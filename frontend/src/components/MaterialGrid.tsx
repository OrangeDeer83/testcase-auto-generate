import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { UploadedMaterial } from '../types'
import { MaterialRow } from './MaterialRow'
import { ModalOverlay } from './ModalOverlay'

interface MaterialGridProps {
  materials: UploadedMaterial[]
  busy: boolean
  onUpdateMaterial: (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ) => Promise<boolean>
  /** 有給才會在編輯視窗裡顯示刪除鈕——對話素材選取畫面不給，避免誤刪整個專案共用的素材。 */
  onRemoveMaterial?: (id: string) => void
  /** 有給才會在卡片上顯示勾選框（對話素材選取畫面用來挑這次要送給模型的素材）。 */
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  /** 有給才會在格子最後多一張「+ 新增素材」卡片。 */
  onAddClick?: () => void
}

/** 素材卡片格：專案素材庫、對話素材選取畫面共用同一套排版跟編輯視窗。 */
export function MaterialGrid({
  materials,
  busy,
  onUpdateMaterial,
  onRemoveMaterial,
  selectedIds,
  onToggleSelect,
  onAddClick,
}: MaterialGridProps) {
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
  const editingMaterial = materials.find((m) => m.id === editingMaterialId) ?? null

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, materialId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setEditingMaterialId(materialId)
    }
  }

  const handleDeleteClick = (e: MouseEvent<HTMLButtonElement>, material: UploadedMaterial) => {
    e.stopPropagation()
    if (
      window.confirm(
        `確定要刪除素材「${material.filename}」嗎？如果已經在某些對話裡用過，那些對話紀錄裡的圖片／內容會變成找不到，且無法復原。`,
      )
    ) {
      onRemoveMaterial?.(material.id)
    }
  }

  return (
    <>
      <div className="material-grid">
        {materials.map((material) => {
          const selected = selectedIds?.has(material.id) ?? false
          return (
            <div
              key={material.id}
              className={`material-card${selected ? ' material-card-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditingMaterialId(material.id)}
              onKeyDown={(e) => handleCardKeyDown(e, material.id)}
            >
              {onToggleSelect && (
                <input
                  type="checkbox"
                  className="material-card-checkbox"
                  checked={selected}
                  disabled={busy}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleSelect(material.id)}
                />
              )}
              <span className="material-card-thumb">
                {material.kind === 'image' && material.image_data_url ? (
                  <img src={material.image_data_url} alt={material.filename} />
                ) : (
                  <span className="material-card-icon">{material.kind === 'text' ? '📝' : '📄'}</span>
                )}
                {!!material.embedded_images?.length && (
                  <span className="material-card-image-badge" title={`內含 ${material.embedded_images.length} 張圖片`}>
                    🖼️ {material.embedded_images.length}
                  </span>
                )}
              </span>
              <span className="material-card-name" title={material.filename}>
                {material.filename}
              </span>
              {onRemoveMaterial && (
                <button
                  type="button"
                  className="material-card-delete"
                  title="刪除素材"
                  onClick={(e) => handleDeleteClick(e, material)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
        {onAddClick && (
          <button type="button" className="material-card material-card-add" onClick={onAddClick}>
            <span className="material-card-thumb">
              <span className="material-card-icon">+</span>
            </span>
            <span className="material-card-name">新增素材</span>
          </button>
        )}
      </div>

      {editingMaterial && (
        <ModalOverlay onClose={() => setEditingMaterialId(null)}>
          <div className="modal-header">
            <h2>編輯素材</h2>
            <button className="secondary" onClick={() => setEditingMaterialId(null)}>
              關閉
            </button>
          </div>
          <ul className="material-list">
            <MaterialRow
              material={editingMaterial}
              busy={busy}
              onRemove={
                onRemoveMaterial
                  ? (id) => {
                      onRemoveMaterial(id)
                      setEditingMaterialId(null)
                    }
                  : undefined
              }
              onUpdate={onUpdateMaterial}
            />
          </ul>
        </ModalOverlay>
      )}
    </>
  )
}
