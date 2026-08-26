import { useEffect, useRef, useState } from 'react'
import { ChatPanel } from './ChatPanel'
import type { ChatMessage } from '../types'

interface FloatingChatProps {
  log: ChatMessage[]
  busy: boolean
  onSend: (message: string, file?: File) => void
}

const MIN_WIDTH = 300
const MAX_WIDTH = 720
const MIN_HEIGHT = 360
const MAX_HEIGHT = 800

export function FloatingChat({ log, busy, onSend }: FloatingChatProps) {
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
      <button
        type="button"
        className={`chat-fab${hasUnansweredQuestion ? ' chat-fab-blink' : ''}`}
        onClick={() => setOpen(true)}
        title={hasUnansweredQuestion ? '測試用例助手（有未回答的問題）' : '測試用例助手'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M21 11.5a8.4 8.4 0 01-8.5 8.4 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8A8.5 8.5 0 0112.5 3h.5a8.5 8.5 0 018 8v.5z" />
        </svg>
        {unread > 0 && <span className="chat-fab-badge">{unread}</span>}
      </button>
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
        <button type="button" className="chat-float-close" onClick={() => setOpen(false)} title="關閉">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="chat-float-body">
        <ChatPanel log={log} busy={busy} onSend={onSend} />
      </div>
    </div>
  )
}
