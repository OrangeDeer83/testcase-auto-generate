import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { MaterialUsage } from '../materialUsage'
import type { UploadedMaterial } from '../types'
import { MaterialRow } from './MaterialRow'
import { ModalOverlay } from './ModalOverlay'
import { Tooltip } from './Tooltip'

interface MaterialGridProps {
  materials: UploadedMaterial[]
  busy: boolean
  onUpdateMaterial: (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ) => Promise<boolean>
  /** 有給才會在編輯視窗裡顯示刪除鈕——對話素材選取畫面不給，避免誤刪整個專案共用的素材。 */
  onRemoveMaterial?: (id: string) => void
  /** 有給才會顯示「合併素材成一組」功能——選取多筆既有的素材，合併成一筆，
   * 讓模型知道它們彼此相關（例如同一畫面「開關前／開關後」的對照截圖，或一份
   * 需求文件搭配幾張相關截圖）。 */
  onMergeMaterials?: (ids: string[]) => Promise<void>
  /** 有給才會在編輯視窗裡每張附加圖片上顯示「拆出」按鈕，把它拆回獨立的一筆素材。 */
  onUngroupImage?: (materialId: string, index: number) => void
  /** 有給才會在卡片上顯示勾選框（對話素材選取畫面用來挑這次要送給模型的素材）。 */
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  /** 有給才會在格子最後多一張「+ 新增素材」卡片。 */
  onAddClick?: () => void
  /** 有給才會在圖片類素材卡片上顯示「已被 N 筆用例引用／尚未被引用」的標籤——
   * 只有已經產生過用例的對話才有意義，沒給就不顯示，不要顯示一個永遠是 0 的
   * 誤導性標籤。取消勾選被「尚未鎖定」的用例引用的素材時，會另外跳出確認，
   * 因為之後模型再對話會失去這個素材的依據。 */
  usageCounts?: Map<string, MaterialUsage>
}

/** 素材卡片格：專案素材庫、對話素材選取畫面共用同一套排版跟編輯視窗。 */
export function MaterialGrid({
  materials,
  busy,
  onUpdateMaterial,
  onRemoveMaterial,
  onMergeMaterials,
  onUngroupImage,
  selectedIds,
  onToggleSelect,
  onAddClick,
  usageCounts,
}: MaterialGridProps) {
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
  const editingMaterial = materials.find((m) => m.id === editingMaterialId) ?? null

  // 合併模式：跟「勾選要送給模型的素材」是兩件獨立的事，各自管自己的狀態，
  // 避免同一個勾選框身兼兩種語意。mergeSelected 用陣列保留選取順序——
  // 第一個選的會是合併後的主圖，其餘依序變成附加圖片。
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<string[]>([])
  const [merging, setMerging] = useState(false)

  const exitMergeMode = () => {
    setMergeMode(false)
    setMergeSelected([])
  }

  // 第一個選的（主體）可以是任何種類的素材（文字／PDF／圖片）；選了第一個之後，
  // 之後每一個都只能是圖片素材——文字內容沒辦法變成合併後的附加圖片。已經選過的
  // 素材永遠可以再點一次取消選取，不受這條規則限制。
  const toggleMergeSelect = (material: UploadedMaterial) => {
    const alreadyPicked = mergeSelected.includes(material.id)
    if (!alreadyPicked && mergeSelected.length > 0 && material.kind !== 'image') return
    setMergeSelected((prev) =>
      alreadyPicked ? prev.filter((id) => id !== material.id) : [...prev, material.id],
    )
  }

  const handleConfirmMerge = async () => {
    if (mergeSelected.length < 2 || !onMergeMaterials) return
    setMerging(true)
    try {
      await onMergeMaterials(mergeSelected)
      exitMergeMode()
    } finally {
      setMerging(false)
    }
  }

  const handleCardClick = (material: UploadedMaterial) => {
    if (busy) return
    if (mergeMode) {
      toggleMergeSelect(material)
      return
    }
    setEditingMaterialId(material.id)
  }

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, material: UploadedMaterial) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick(material)
    }
  }

  const handleToggleSelect = (material: UploadedMaterial, currentlySelected: boolean) => {
    if (!onToggleSelect) return
    const unlockedCaseNames = usageCounts?.get(material.id)?.unlockedCaseNames ?? []
    if (currentlySelected && unlockedCaseNames.length > 0) {
      const confirmed = window.confirm(
        `以下尚未鎖定的用例是根據「${material.filename}」寫的：\n\n` +
          unlockedCaseNames.map((name) => `・${name}`).join('\n') +
          '\n\n取消勾選之後，模型再對話時會失去這個素材的依據，之後的修改可能無法再對照原始素材確認。確定要取消勾選嗎？',
      )
      if (!confirmed) return
    }
    onToggleSelect(material.id)
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
      {onMergeMaterials && (
        <div className="material-merge-bar">
          {mergeMode ? (
            <>
              <span className="material-merge-hint">
                {mergeSelected.length === 0
                  ? '先點第一筆當主體（文字／PDF／圖片都可以），之後只能再點圖片素材依序附加上去'
                  : `已選 ${mergeSelected.length} 筆，第 1 筆點的是主體`}
              </span>
              <button type="button" className="secondary" disabled={merging} onClick={exitMergeMode}>
                取消
              </button>
              <button
                type="button"
                disabled={merging || mergeSelected.length < 2}
                onClick={handleConfirmMerge}
              >
                合併成一組（{mergeSelected.length}）
              </button>
            </>
          ) : (
            <button type="button" className="secondary" disabled={busy} onClick={() => setMergeMode(true)}>
              合併素材成一組
            </button>
          )}
        </div>
      )}

      <div className="material-grid">
        {materials.map((material) => {
          const selected = selectedIds?.has(material.id) ?? false
          const mergeIndex = mergeSelected.indexOf(material.id)
          const mergeEligible =
            mergeIndex >= 0 || mergeSelected.length === 0 || material.kind === 'image'
          const isImageLike = material.kind === 'image' || (material.embedded_images?.length ?? 0) > 0
          const usage = usageCounts?.get(material.id)
          const usageCount = usage?.total ?? 0
          const unlockedCount = usage?.unlockedCaseNames.length ?? 0
          return (
            <div
              key={material.id}
              className={[
                'material-card',
                selected ? 'material-card-selected' : '',
                mergeMode && !mergeEligible ? 'material-card-merge-disabled' : '',
                mergeIndex >= 0 ? 'material-card-merge-picked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(material)}
              onKeyDown={(e) => handleCardKeyDown(e, material)}
            >
              {onToggleSelect && (
                <input
                  type="checkbox"
                  className="material-card-checkbox"
                  checked={selected}
                  disabled={busy}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleToggleSelect(material, selected)}
                />
              )}
              <span className="material-card-thumb">
                {material.kind === 'image' && material.image_data_url ? (
                  <img src={material.image_data_url} alt={material.filename} />
                ) : (
                  <span className="material-card-icon">{material.kind === 'text' ? '📝' : '📄'}</span>
                )}
                {!!material.embedded_images?.length && (
                  <Tooltip label={`內含 ${material.embedded_images.length} 張圖片`}>
                    <span className="material-card-image-badge">
                      🖼️ {material.embedded_images.length}
                    </span>
                  </Tooltip>
                )}
              </span>
              <Tooltip label={material.filename}>
                <span className="material-card-name">{material.filename}</span>
              </Tooltip>
              {usageCounts && isImageLike && (
                <Tooltip
                  label={
                    usageCount === 0
                      ? '目前沒有任何測試用例引用這個素材，取消勾選應該不影響已產生的內容'
                      : unlockedCount > 0
                        ? `已被 ${usageCount} 筆測試用例引用，其中 ${unlockedCount} 筆尚未鎖定——取消勾選後模型再對話會失去這個素材的依據`
                        : `已被 ${usageCount} 筆測試用例引用，且都已鎖定，取消勾選不會受影響`
                  }
                >
                  <span
                    className={`material-card-usage-badge${usageCount > 0 ? ' material-card-usage-badge-used' : ''}`}
                  >
                    {usageCount > 0 ? `已用 ${usageCount}` : '未使用'}
                  </span>
                </Tooltip>
              )}
              {mergeMode
                ? mergeEligible && (
                    <span className="material-card-merge-badge" aria-hidden="true">
                      {mergeIndex >= 0 ? mergeIndex + 1 : ''}
                    </span>
                  )
                : onRemoveMaterial && (
                    <Tooltip label="刪除素材">
                      <button
                        type="button"
                        className="material-card-delete"
                        onClick={(e) => handleDeleteClick(e, material)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
                        </svg>
                      </button>
                    </Tooltip>
                  )}
            </div>
          )
        })}
        {onAddClick && !mergeMode && (
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
              onUngroupImage={onUngroupImage}
            />
          </ul>
        </ModalOverlay>
      )}
    </>
  )
}
