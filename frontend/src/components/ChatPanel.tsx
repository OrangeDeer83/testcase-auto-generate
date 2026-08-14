import { useRef, useState } from 'react'
import type { ChatMessage } from '../types'

interface ChatPanelProps {
  log: ChatMessage[]
  busy: boolean
  onSend: (message: string, image?: File) => void
}

export function ChatPanel({ log, busy, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [attachedImage, setAttachedImage] = useState<File | null>(null)
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSend = (draft.trim() || attachedImage) && !busy

  const handleAttachImage = (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setAttachedImage(file)
    setAttachedPreviewUrl(URL.createObjectURL(file))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const clearAttachment = () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl)
    setAttachedImage(null)
    setAttachedPreviewUrl(null)
  }

  const submit = () => {
    if (!canSend) return
    onSend(draft.trim(), attachedImage ?? undefined)
    setDraft('')
    setAttachedImage(null)
    setAttachedPreviewUrl(null)
  }

  return (
    <div className="panel">
      <h2>2. 對話</h2>
      <p className="subtitle">
        回答 LLM 提出的澄清問題，或直接輸入指令請它修改測試用例——可以一次調整多筆用例、多個步驟，也可以附上圖片說明。
      </p>

      <div className="chat-log">
        {log.map((entry, idx) => (
          <div key={idx}>
            <div className={`chat-bubble ${entry.role === 'user' ? 'answer' : 'question'}`}>
              {entry.content}
              {entry.imageUrl && <img src={entry.imageUrl} alt="附加圖片" />}
            </div>
            {entry.context && <div className="chat-bubble context">依據：{entry.context}</div>}
          </div>
        ))}
        {busy && <div className="chat-bubble question">思考中…</div>}
      </div>

      {attachedPreviewUrl && (
        <div className="chat-attachment-preview">
          <img src={attachedPreviewUrl} alt="待送出的附加圖片" />
          <span>{attachedImage?.name}</span>
          <button className="secondary" disabled={busy} onClick={clearAttachment}>
            移除圖片
          </button>
        </div>
      )}

      <div className="chat-input-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: 'none' }}
          onChange={(e) => handleAttachImage(e.target.files)}
        />
        <button
          className="secondary chat-attach-button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          🖼️ 附圖
        </button>
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
        <button disabled={!canSend} onClick={submit}>
          送出
        </button>
      </div>
    </div>
  )
}
