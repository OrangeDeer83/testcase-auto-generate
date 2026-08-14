import { useState } from 'react'
import type { ChatMessage } from '../types'

interface ChatPanelProps {
  log: ChatMessage[]
  busy: boolean
  onSend: (message: string) => void
}

export function ChatPanel({ log, busy, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim() || busy) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <div className="panel">
      <h2>2. 對話</h2>
      <p className="subtitle">
        回答 LLM 提出的澄清問題，或直接輸入指令請它修改測試用例——可以一次調整多筆用例、多個步驟。
      </p>

      <div className="chat-log">
        {log.map((entry, idx) => (
          <div
            key={idx}
            className={`chat-bubble ${entry.role === 'user' ? 'answer' : 'question'}`}
          >
            {entry.content}
          </div>
        ))}
        {busy && <div className="chat-bubble question">思考中…</div>}
      </div>

      <div className="chat-input-row">
        <textarea
          value={draft}
          disabled={busy}
          placeholder="輸入回答，或下達修改指令，例如「把用例 3 的步驟 2 改成…」…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button disabled={busy || !draft.trim()} onClick={submit}>
          送出
        </button>
      </div>
    </div>
  )
}
