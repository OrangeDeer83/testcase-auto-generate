import { useState } from 'react'
import type { ReactNode } from 'react'
import type { UploadedMaterial } from '../types'

interface MaterialRowProps {
  material: UploadedMaterial
  busy: boolean
  onRemove?: (id: string) => void
  onUpdate: (id: string, updates: { filename?: string; description?: string; text?: string }) => void
  /** 選用的前綴控制項，例如對話素材選取畫面裡用來勾選這個素材的 checkbox。 */
  leadingControl?: ReactNode
}

/** 分離主檔名跟副檔名，副檔名不開放編輯，避免使用者改完檔名跟實際內容種類（圖片/文字）對不上。 */
function splitExtension(filename: string): { base: string; ext: string } {
  const idx = filename.lastIndexOf('.')
  if (idx <= 0 || idx === filename.length - 1) return { base: filename, ext: '' }
  return { base: filename.slice(0, idx), ext: filename.slice(idx) }
}

export function MaterialRow({ material, busy, onRemove, onUpdate, leadingControl }: MaterialRowProps) {
  const { base: initialBase, ext } = splitExtension(material.filename)
  const [nameBase, setNameBase] = useState(initialBase)
  const [description, setDescription] = useState(material.description)
  const [content, setContent] = useState(material.text ?? '')

  const saveName = () => {
    const trimmed = nameBase.trim()
    if (!trimmed) {
      setNameBase(initialBase)
      return
    }
    setNameBase(trimmed)
    const fullName = `${trimmed}${ext}`
    if (fullName !== material.filename) onUpdate(material.id, { filename: fullName })
  }

  const saveDescription = () => {
    if (description !== material.description) onUpdate(material.id, { description })
  }

  const saveContent = () => {
    if (content !== material.text) onUpdate(material.id, { text: content })
  }

  const isText = material.kind === 'text'

  return (
    <li className="material-item">
      <div className="material-item-row">
        {leadingControl}
        <span className="material-icon">{isText ? '📄' : '🖼️'}</span>
        <input
          className="material-name-input"
          value={nameBase}
          disabled={busy}
          onChange={(e) => setNameBase(e.target.value)}
          onBlur={saveName}
        />
        {ext && <span className="material-extension">{ext}</span>}
        {onRemove && (
          <button
            className="secondary material-remove"
            disabled={busy}
            onClick={() => onRemove(material.id)}
          >
            刪除
          </button>
        )}
      </div>
      {isText ? (
        <textarea
          className="material-content-input"
          placeholder="這則素材的文字內容"
          value={content}
          disabled={busy}
          onChange={(e) => setContent(e.target.value)}
          onBlur={saveContent}
        />
      ) : (
        <textarea
          className="material-description-input"
          placeholder="這個素材的說明（選填），例如：登入頁面驗證碼錯誤時的畫面……有助於模型理解素材跟需求的關係"
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
        />
      )}
    </li>
  )
}
