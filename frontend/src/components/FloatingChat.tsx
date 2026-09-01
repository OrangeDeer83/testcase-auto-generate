import { useEffect, useRef, useState } from 'react'
import { ChatPanel } from './ChatPanel'
import { Tooltip } from './Tooltip'
import type { StreamProgressLine } from '../streamProgress'
import type { ChatMessage, ImageRef, TestCase, UploadedMaterial } from '../types'

interface FloatingChatProps {
  log: ChatMessage[]
  busy: boolean
  /** busy 這次是什麼時候開始的（ms 時間戳）——用來算「思考中」要顯示的已等待
   * 秒數，不能只靠 ChatPanel 自己內部從 0 累加，否則視窗關閉重開後會歸零。
   * busy 為 false 時是 null。 */
  busyStartedAt: number | null
  /** 模型串流輸出時，目前已經抓到的「正在寫哪個用例／問題」清單，依序顯示在
   * 「思考中」下面，讓使用者能看到模型正在做什麼，不只是一個乾等的計時器。 */
  streamingLines: StreamProgressLine[]
  onSend: (message: string, file?: File) => void
  materials: UploadedMaterial[]
  selectedMaterialIds: string[]
  testCases: TestCase[]
  imageMap: Map<number, ImageRef>
  onChangeSelectedMaterials: (ids: string[]) => void
  /** 打到一半、還沒送出的草稿——由外層（ProjectLayout）依對話 id 保存，收合
   * 這個浮動視窗時 ChatPanel 會 unmount，草稿不能存在 ChatPanel 自己的 state
   * 裡，不然一收合就沒了。 */
  draft: string
  onDraftChange: (draft: string) => void
  /** 每次遞增就代表外層（例如按下「針對已選提問」）要求強制展開這個視窗——
   * 這個元件自己管理 open 這個 state，外層沒辦法直接呼叫它的 setOpen，只能
   * 用這種「訊號」的方式請它展開。 */
  forceOpenToken: number
  /** 使用者「針對已選用例提問」時鎖定的範圍——有值時代表下一則送出的訊息只會
   * 讓模型看到這幾筆用例的完整內容。 */
  activeScope: { ids: string[]; labels: string[] } | null
  onClearScope: () => void
}

const MIN_WIDTH = 300
const MAX_WIDTH = 720
const MIN_HEIGHT = 360
const MAX_HEIGHT = 800

export function FloatingChat({
  log,
  busy,
  busyStartedAt,
  streamingLines,
  onSend,
  materials,
  selectedMaterialIds,
  testCases,
  imageMap,
  onChangeSelectedMaterials,
  draft,
  onDraftChange,
  forceOpenToken,
  activeScope,
  onClearScope,
}: FloatingChatProps) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [size, setSize] = useState({ width: 380, height: 560 })
  const prevLengthRef = useRef(log.length)
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const isFirstForceOpenRef = useRef(true)

  useEffect(() => {
    if (log.length > prevLengthRef.current && !open) {
      setUnread((count) => count + (log.length - prevLengthRef.current))
    }
    prevLengthRef.current = log.length
  }, [log, open])

  useEffect(() => {
    // token 從 0 開始，掛載當下這個 effect 也會跑一次——第一次不用理它，不然
    // 每個對話一開啟就會強制彈出聊天視窗，不是使用者要的行為。
    if (isFirstForceOpenRef.current) {
      isFirstForceOpenRef.current = false
      return
    }
    setOpen(true)
  }, [forceOpenToken])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  // 最後一則如果是 AI 提出、使用者還沒回應的問題，收合狀態下的圓形按鈕本身也要閃爍——
  // 不然使用者要先點開才看得到 ChatPanel 裡的閃爍提示，等於根本沒被提醒到。
  const lastEntry = log[log.length - 1]
  const hasUnansweredQuestion =
    lastEntry?.role === 'assistant' && (lastEntry.questions?.length ?? 0) > 0

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    resizeStartRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height }

    const handleMove = (moveEvent: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const dx = start.x - moveEvent.clientX
      const dy = start.y - moveEvent.clientY
      setSize({
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, start.width + dx)),
        height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, start.height + dy)),
      })
    }
    const handleUp = () => {
      resizeStartRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  if (!open) {
    return (
      <Tooltip label={hasUnansweredQuestion ? '測試用例助手（有未回答的問題）' : '測試用例助手'}>
        <button
          type="button"
          className={`chat-fab${hasUnansweredQuestion ? ' chat-fab-blink' : ''}`}
          onClick={() => setOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M21 11.5a8.4 8.4 0 01-8.5 8.4 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8A8.5 8.5 0 0112.5 3h.5a8.5 8.5 0 018 8v.5z" />
          </svg>
          {unread > 0 && <span className="chat-fab-badge">{unread}</span>}
        </button>
      </Tooltip>
    )
  }

  return (
    <div className="chat-float-panel" style={{ width: size.width, height: size.height }}>
      <div className="chat-float-resize-handle" onMouseDown={handleResizeStart}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 4L4 20M20 12L12 20" />
        </svg>
      </div>
      <div className="chat-float-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M12 2l1.8 5.6H20l-4.6 3.4 1.8 5.6-5.2-3.4-5.2 3.4 1.8-5.6L4 7.6h6.2z" />
        </svg>
        <span>測試用例助手</span>
        <Tooltip placement="bottom" label="關閉">
          <button type="button" className="chat-float-close" onClick={() => setOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </Tooltip>
      </div>
      <div className="chat-float-body">
        <ChatPanel
          log={log}
          busy={busy}
          busyStartedAt={busyStartedAt}
          streamingLines={streamingLines}
          onSend={onSend}
          materials={materials}
          selectedMaterialIds={selectedMaterialIds}
          testCases={testCases}
          imageMap={imageMap}
          onChangeSelectedMaterials={onChangeSelectedMaterials}
          draft={draft}
          onDraftChange={onDraftChange}
          activeScope={activeScope}
          onClearScope={onClearScope}
        />
      </div>
    </div>
  )
}
