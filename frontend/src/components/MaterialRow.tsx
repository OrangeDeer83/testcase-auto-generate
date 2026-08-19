import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { UploadedMaterial } from '../types'

interface MaterialRowProps {
  material: UploadedMaterial
  busy: boolean
  onRemove?: (id: string) => void
  /** 回傳是否成功——改檔名可能因為撞名被後端拒絕，呼叫端要讓輸入框知道要不要回復原值。 */
  onUpdate: (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ) => Promise<boolean>
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
  const [previewOpen, setPreviewOpen] = useState(false)

  // 改名如果因為名稱重複被後端拒絕，material.filename 不會變，這裡要跟著回復顯示，
  // 不能讓輸入框停在使用者剛剛打的（其實沒存成功的）名稱上。
  useEffect(() => {
    setNameBase(splitExtension(material.filename).base)
  }, [material.filename])

  const saveName = async () => {
    const trimmed = nameBase.trim()
    if (!trimmed) {
      setNameBase(initialBase)
      return
    }
    const fullName = `${trimmed}${ext}`
    if (fullName === material.filename) return
    // 檔名可能因為跟其他素材撞名被拒絕，這時要把輸入框改回原本的名字，
    // 不能讓畫面停在使用者剛打的、其實沒存成功的內容上。
    const ok = await onUpdate(material.id, { filename: fullName })
    if (!ok) setNameBase(initialBase)
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
        {!isText && material.image_data_url ? (
          <img
            className="material-thumbnail"
            src={material.image_data_url}
            alt={material.filename}
            onClick={() => setPreviewOpen(true)}
          />
        ) : (
          <span className="material-icon">{isText ? '📄' : '🖼️'}</span>
        )}
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
      {previewOpen && material.image_data_url && (
        <div className="modal-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="modal-panel material-thumbnail-preview" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{material.filename}</h2>
              <button className="secondary" onClick={() => setPreviewOpen(false)}>
                關閉
              </button>
            </div>
            <img src={material.image_data_url} alt={material.filename} />
          </div>
        </div>
      )}
    </li>
  )
}
