import { useEffect, useRef, useState } from 'react'
import { ChatPanel } from './ChatPanel'
import { Tooltip } from './Tooltip'
import type { ChatMessage, ImageRef, TestCase, UploadedMaterial } from '../types'

interface FloatingChatProps {
  log: ChatMessage[]
  busy: boolean
  /** busy 這次是什麼時候開始的（ms 時間戳）——用來算「思考中」要顯示的已等待
   * 秒數，不能只靠 ChatPanel 自己內部從 0 累加，否則視窗關閉重開後會歸零。
   * busy 為 false 時是 null。 */
  busyStartedAt: number | null
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
}

const MIN_WIDTH = 300
const MAX_WIDTH = 720
const MIN_HEIGHT = 360
const MAX_HEIGHT = 800

export function FloatingChat({
  log,
  busy,
  busyStartedAt,
  onSend,
  materials,
  selectedMaterialIds,
  testCases,
  imageMap,
  onChangeSelectedMaterials,
  draft,
  onDraftChange,
}: FloatingChatProps) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [size, setSize] = useState({ width: 380, height: 560 })
  const prevLengthRef = useRef(log.length)
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (log.length > prevLengthRef.current && !open) {
      setUnread((count) => count + (log.length - prevLengthRef.current))
    }
    prevLengthRef.current = log.length
  }, [log, open])

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
          onSend={onSend}
          materials={materials}
          selectedMaterialIds={selectedMaterialIds}
          testCases={testCases}
          imageMap={imageMap}
          onChangeSelectedMaterials={onChangeSelectedMaterials}
          draft={draft}
          onDraftChange={onDraftChange}
        />
      </div>
    </div>
  )
}
