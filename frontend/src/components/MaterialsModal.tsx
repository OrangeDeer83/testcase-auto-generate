import type { UploadedMaterial } from '../types'

interface MaterialsModalProps {
  materials: UploadedMaterial[]
  title?: string
  onClose: () => void
}

export function MaterialsModal({ materials, title = '素材內容', onClose }: MaterialsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}（共 {materials.length} 項）</h2>
          <button className="secondary" onClick={onClose}>
            關閉
          </button>
        </div>

        {materials.length === 0 && <p className="subtitle">尚未載入素材內容。</p>}

        {materials.map((material) => (
          <div className="material-detail" key={material.id}>
            <div className="material-detail-title">
              {material.kind === 'image' ? '🖼️' : '📄'} {material.filename}
            </div>
            {material.description && (
              <p className="material-detail-description">說明：{material.description}</p>
            )}
            {material.kind === 'image' && material.image_data_url && (
              <img src={material.image_data_url} alt={material.filename} />
            )}
            {material.kind === 'text' && material.text && (
              <pre className="material-detail-text">{material.text}</pre>
            )}
            {!!material.embedded_images?.length && (
              <div className="material-embedded-images">
                <p className="material-embedded-images-label">
                  文件內夾帶的圖片（共 {material.embedded_images.length} 張）：
                </p>
                <div className="material-embedded-images-grid">
                  {material.embedded_images.map((src, index) => (
                    <img key={index} src={src} alt={`${material.filename} 內嵌圖片 ${index + 1}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
