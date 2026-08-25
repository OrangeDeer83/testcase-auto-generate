import type { UploadedMaterial } from '../types'
import { ModalOverlay } from './ModalOverlay'

interface MaterialsModalProps {
  materials: UploadedMaterial[]
  title?: string
  onClose: () => void
}

export function MaterialsModal({ materials, title = '素材內容', onClose }: MaterialsModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-header">
        <h2>{title}（共 {materials.length} 項）</h2>
        <button className="secondary" onClick={onClose}>
          關閉
        </button>
      </div>

      {materials.length === 0 && <p className="subtitle">尚未載入素材內容。</p>}

      {materials.map((material) => {
        const embeddedCount = material.embedded_images?.length ?? 0
        const hasGroup = embeddedCount > 0
        const embeddedNumberOffset = material.kind === 'text' ? 1 : 2
        const lastEmbeddedNumber = embeddedNumberOffset + embeddedCount - 1
        const numberRangeLabel =
          embeddedCount > 1 ? `圖${embeddedNumberOffset}～圖${lastEmbeddedNumber}` : `圖${embeddedNumberOffset}`
        return (
          <div className="material-detail" key={material.id}>
            <div className="material-detail-title">
              {material.kind === 'image' ? '🖼️' : '📄'} {material.filename}
            </div>
            {material.description && (
              <p className="material-detail-description">說明：{material.description}</p>
            )}
            {material.kind === 'image' && material.image_data_url && (
              <span className="material-thumbnail-wrap material-detail-image-wrap">
                <img src={material.image_data_url} alt={material.filename} />
                {hasGroup && <span className="material-image-number">圖1</span>}
              </span>
            )}
            {material.kind === 'text' && material.text && (
              <pre className="material-detail-text">{material.text}</pre>
            )}
            {hasGroup && (
              <div className="material-embedded-images">
                <p className="material-embedded-images-label">
                  {material.kind === 'text' ? '文件內夾帶的圖片' : '同一組的其他圖片'}
                  （共 {embeddedCount} 張，{numberRangeLabel}）：
                </p>
                <div className="material-embedded-images-grid">
                  {(material.embedded_images ?? []).map((src, index) => (
                    <div key={index} className="material-embedded-image-item">
                      <span className="material-image-number">圖{index + embeddedNumberOffset}</span>
                      <img src={src} alt={`${material.filename} 內嵌圖片 ${index + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </ModalOverlay>
  )
}
