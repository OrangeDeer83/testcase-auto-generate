import type { UploadedMaterial } from '../types'

interface MaterialSelectorProps {
  materials: UploadedMaterial[]
  selectedIds: string[]
  busy: boolean
  onChange: (ids: string[]) => void
}

export function MaterialSelector({ materials, selectedIds, busy, onChange }: MaterialSelectorProps) {
  const selectedSet = new Set(selectedIds)

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((existing) => existing !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (materials.length === 0) {
    return <p className="subtitle">這個專案還沒有素材，先到專案頁上傳。</p>
  }

  return (
    <ul className="material-selector-list">
      {materials.map((material) => (
        <li key={material.id} className="material-selector-item">
          <label>
            <input
              type="checkbox"
              checked={selectedSet.has(material.id)}
              disabled={busy}
              onChange={() => toggle(material.id)}
            />
            <span>{material.kind === 'image' ? '🖼️' : '📄'} {material.filename}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}
