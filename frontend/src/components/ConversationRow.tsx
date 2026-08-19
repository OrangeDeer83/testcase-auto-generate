import { useState } from 'react'
import type { ConversationSummary } from '../types'

interface ConversationRowProps {
  conversation: ConversationSummary
  onNavigate: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string, name: string) => void
  formatTime: (ms: number) => string
}

export function ConversationRow({
  conversation,
  onNavigate,
  onRename,
  onDelete,
  formatTime,
}: ConversationRowProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(conversation.name)

  const startEditing = () => {
    setDraftName(conversation.name)
    setEditing(true)
  }

  const commitRename = () => {
    setEditing(false)
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === conversation.name) return
    onRename(conversation.id, trimmed)
  }

  return (
    <li className="material-item">
      <div className="material-item-row">
        {editing ? (
          <input
            className="material-name-input"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraftName(conversation.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="project-name-link" onClick={() => onNavigate(conversation.id)}>
            {conversation.name}
          </span>
        )}
        {!editing && (
          <button className="secondary material-remove" onClick={startEditing}>
            重新命名
          </button>
        )}
        <button
          className="secondary material-remove"
          onClick={() => onDelete(conversation.id, conversation.name)}
        >
          刪除
        </button>
      </div>
      <p className="previous-value">
        {conversation.testCaseCount} 筆測試用例・{conversation.messageCount} 則訊息・最後更新{' '}
        {formatTime(conversation.updatedAt)}
      </p>
    </li>
  )
}
