import { newId } from '../id'
import type { FeatureBreakdownItem, UploadedMaterial } from '../types'

interface FeatureBreakdownPanelProps {
  features: FeatureBreakdownItem[]
  materials: UploadedMaterial[]
  selectedMaterialIds: string[]
  /** 正在重新拆分（呼叫模型）時為 true，把所有編輯動作暫時鎖住，理由跟
   * TestCaseTable 的 disabled prop 一樣：避免使用者在請求還沒回來前，
   * 編輯到馬上要被整批覆蓋掉的舊清單。 */
  busy: boolean
  onChange: (features: FeatureBreakdownItem[]) => void
  onRegenerate: () => void
  onConfirm: () => void
}

/** 初次產生用例前的確認畫面：AI 已經把選取的素材拆成幾個功能，使用者在這裡
 * 確認或調整每個功能的名稱、描述、對應的素材，確認後才會針對每個功能各自
 * 呼叫一次生成（見 FeatureGenerationProgress）。 */
export function FeatureBreakdownPanel({
  features,
  materials,
  selectedMaterialIds,
  busy,
  onChange,
  onRegenerate,
  onConfirm,
}: FeatureBreakdownPanelProps) {
  const materialsById = new Map(materials.map((m) => [m.id, m]))
  const coveredIds = new Set(features.flatMap((f) => f.materialIds))
  const uncoveredMaterials = selectedMaterialIds
    .filter((id) => !coveredIds.has(id))
    .map((id) => materialsById.get(id))
    .filter((m): m is UploadedMaterial => !!m)

  const updateFeature = (index: number, patch: Partial<FeatureBreakdownItem>) => {
    const next = features.slice()
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  const toggleMaterial = (index: number, materialId: string) => {
    const feature = features[index]
    const checked = feature.materialIds.includes(materialId)
    updateFeature(index, {
      materialIds: checked
        ? feature.materialIds.filter((id) => id !== materialId)
        : [...feature.materialIds, materialId],
    })
  }

  const removeFeature = (index: number) => {
    onChange(features.filter((_, i) => i !== index))
  }

  const addFeature = () => {
    onChange([...features, { id: newId(), name: '新功能', description: '', materialIds: [] }])
  }

  return (
    <div className="feature-breakdown-panel">
      <p className="subtitle" style={{ marginTop: 0 }}>
        AI 已把選取的素材拆成 {features.length} 個功能範圍，確認或調整每個功能對應的素材後，會針對每個功能各自產生測試用例，涵蓋度會比一次性產生更可靠。
      </p>
      {uncoveredMaterials.length > 0 && (
        <div className="feature-breakdown-warning">
          <span>⚠️ 以下素材目前沒有被任何功能涵蓋到，維持現狀的話產生用例時不會用到它們：</span>
          <ul>
            {uncoveredMaterials.map((m) => (
              <li key={m.id}>{m.filename}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="feature-breakdown-list">
        {features.map((feature, index) => (
          <div className="feature-breakdown-card" key={feature.id}>
            <div className="feature-breakdown-card-header">
              <input
                className="feature-breakdown-name-input"
                value={feature.name}
                disabled={busy}
                onChange={(e) => updateFeature(index, { name: e.target.value })}
                placeholder="功能名稱"
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => removeFeature(index)}
              >
                刪除
              </button>
            </div>
            <textarea
              className="feature-breakdown-description-input"
              value={feature.description}
              disabled={busy}
              onChange={(e) => updateFeature(index, { description: e.target.value })}
              placeholder="這個功能涵蓋的範圍（畫面、操作流程）"
            />
            <div className="feature-breakdown-materials">
              {selectedMaterialIds.map((id) => {
                const material = materialsById.get(id)
                if (!material) return null
                const checked = feature.materialIds.includes(id)
                return (
                  <label
                    key={id}
                    className={`feature-breakdown-material-chip${checked ? ' feature-breakdown-material-chip-checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggleMaterial(index, id)}
                    />
                    {material.kind === 'image' && material.image_data_url && (
                      <img src={material.image_data_url} alt={material.filename} />
                    )}
                    <span>{material.filename}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="feature-breakdown-actions">
        <button type="button" className="secondary" disabled={busy} onClick={addFeature}>
          + 手動新增功能
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onRegenerate}>
          {busy ? '重新拆分中…' : '重新讓 AI 拆一次'}
        </button>
        <button type="button" disabled={busy || features.length === 0} onClick={onConfirm}>
          確認，開始產生用例
        </button>
      </div>
    </div>
  )
}
