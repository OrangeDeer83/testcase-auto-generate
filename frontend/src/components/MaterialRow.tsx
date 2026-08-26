import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { UploadedMaterial } from '../types'
import { useImageLightbox } from './ImageLightbox'

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
  /** 有給才會在每張附加圖片上顯示「拆出」按鈕——把那張圖片拆成獨立的一筆新素材，
   * 取消合併裡的其中一張，不用整組拆散重來。 */
  onUngroupImage?: (materialId: string, index: number) => void
}

/** 分離主檔名跟副檔名，副檔名不開放編輯，避免使用者改完檔名跟實際內容種類（圖片/文字）對不上。 */
function splitExtension(filename: string): { base: string; ext: string } {
  const idx = filename.lastIndexOf('.')
  if (idx <= 0 || idx === filename.length - 1) return { base: filename, ext: '' }
  return { base: filename.slice(0, idx), ext: filename.slice(idx) }
}

export function MaterialRow({
  material,
  busy,
  onRemove,
  onUpdate,
  leadingControl,
  onUngroupImage,
}: MaterialRowProps) {
  const { base: initialBase, ext } = splitExtension(material.filename)
  const [nameBase, setNameBase] = useState(initialBase)
  const [description, setDescription] = useState(material.description)
  const [content, setContent] = useState(material.text ?? '')
  const { open: openPreview, lightbox } = useImageLightbox()

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
  const hasGroup = !!material.embedded_images?.length
  // 有分組圖片時，主圖（圖片素材才有）跟附加圖片一起編號，主圖是圖1；純文字素材
  // 沒有主圖，附加圖片直接從圖1開始——跟 prompt_builder.py 送給模型的編號規則一致，
  // 畫面上的縮圖編號才能跟模型輸出裡提到的「圖N」對得起來。
  const embeddedNumberOffset = isText ? 1 : 2

  return (
    <li className="material-item">
      <div className="material-item-row">
        {leadingControl}
        {!isText && material.image_data_url ? (
          <span className="material-thumbnail-wrap">
            <img
              className="material-thumbnail"
              src={material.image_data_url}
              alt={material.filename}
              onClick={() => material.image_data_url && openPreview(material.image_data_url, material.filename)}
            />
            {hasGroup && <span className="material-image-number">圖1</span>}
          </span>
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
            onClick={() => {
              if (
                window.confirm(
                  `確定要刪除素材「${material.filename}」嗎？如果已經在某些對話裡用過，那些對話紀錄裡的圖片／內容會變成找不到，且無法復原。`,
                )
              ) {
                onRemove(material.id)
              }
            }}
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
      {!!material.embedded_images?.length && (
        <div className="material-embedded-images">
          <p className="material-embedded-images-label">
            {isText ? '文件內夾帶的圖片' : '同一組的其他圖片'}（共 {material.embedded_images.length} 張，點擊可放大）：
          </p>
          <div className="material-embedded-images-grid">
            {material.embedded_images.map((src, index) => (
              <div key={index} className="material-embedded-image-item">
                <span className="material-image-number">圖{index + embeddedNumberOffset}</span>
                <img
                  src={src}
                  alt={`${material.filename} 內嵌圖片 ${index + 1}`}
                  onClick={() => openPreview(src, `${material.filename} 內嵌圖片 ${index + 1}`)}
                />
                {onUngroupImage && (
                  <button
                    type="button"
                    className="material-embedded-image-ungroup"
                    title="拆出這張圖片，變成獨立的素材"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      onUngroupImage(material.id, index)
                    }}
                  >
                    拆出
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {lightbox}
    </li>
  )
}
