import { useState } from 'react'
import type { UploadedMaterial } from '../types'

interface MaterialRowProps {
  material: UploadedMaterial
  busy: boolean
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: { filename?: string; description?: string }) => void
}

export function MaterialRow({ material, busy, onRemove, onUpdate }: MaterialRowProps) {
  const [name, setName] = useState(material.filename)
  const [description, setDescription] = useState(material.description)

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(material.filename)
      return
    }
    setName(trimmed)
    if (trimmed !== material.filename) onUpdate(material.id, { filename: trimmed })
  }

  const saveDescription = () => {
    if (description !== material.description) onUpdate(material.id, { description })
  }

  return (
    <li className="material-item">
      <div className="material-item-row">
        <span className="material-icon">{material.kind === 'image' ? '🖼️' : '📄'}</span>
        <input
          className="material-name-input"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
        />
        <button
          className="secondary material-remove"
          disabled={busy}
          onClick={() => onRemove(material.id)}
        >
          刪除
        </button>
      </div>
      <textarea
        className="material-description-input"
        placeholder="這個素材的說明（選填），例如：登入頁面驗證碼錯誤時的畫面……有助於模型理解素材跟需求的關係"
        value={description}
        disabled={busy}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={saveDescription}
      />
    </li>
  )
}
