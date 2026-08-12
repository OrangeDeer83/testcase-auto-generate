import { useState } from 'react'
import type { ClarificationQuestion } from '../types'

export interface ChatEntry {
  question: ClarificationQuestion
  answer?: string
}

interface ClarifyChatProps {
  log: ChatEntry[]
  currentQuestion: ClarificationQuestion | null
  busy: boolean
  onAnswer: (answer: string) => void
}

export function ClarifyChat({ log, currentQuestion, busy, onAnswer }: ClarifyChatProps) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim()) return
    onAnswer(draft.trim())
    setDraft('')
  }

  return (
    <div className="panel">
      <h2>2. 疑問澄清</h2>
      <p className="subtitle">
        LLM 對部分內容不夠確定，逐一回答以下問題後才會產出完整用例，避免用例出現臆測的步驟。
      </p>

      <div className="chat-log">
        {log.map((entry, idx) => (
          <div key={entry.question.id + idx}>
            <div className="chat-bubble question">{entry.question.question}</div>
            {entry.question.context && (
              <div className="chat-bubble context">依據：{entry.question.context}</div>
            )}
            {entry.answer !== undefined && (
              <div className="chat-bubble answer">{entry.answer}</div>
            )}
          </div>
        ))}

        {currentQuestion && (
          <div>
            <div className="chat-bubble question">{currentQuestion.question}</div>
            {currentQuestion.context && (
              <div className="chat-bubble context">依據：{currentQuestion.context}</div>
            )}
          </div>
        )}
      </div>

      {currentQuestion && (
        <div className="chat-input-row">
          <textarea
            value={draft}
            disabled={busy}
            placeholder="輸入回答…"
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
      )}

      {!currentQuestion && busy && <p className="subtitle">正在依回答重新產出測試用例…</p>}
    </div>
  )
}
