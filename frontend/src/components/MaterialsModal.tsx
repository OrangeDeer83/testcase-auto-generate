import type { UploadedMaterial } from '../types'

interface MaterialsModalProps {
  materials: UploadedMaterial[]
  onClose: () => void
}

export function MaterialsModal({ materials, onClose }: MaterialsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>一開始提供的素材（共 {materials.length} 項）</h2>
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
          </div>
        ))}
      </div>
    </div>
  )
}
