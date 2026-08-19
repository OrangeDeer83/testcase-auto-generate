import { useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { getPastedImageFile } from '../clipboardImage'
import type { UploadedMaterial } from '../types'
import { MaterialRow } from './MaterialRow'
import { MaterialsModal } from './MaterialsModal'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.md,.markdown,.txt,.png,.jpg,.jpeg'
const LIBRARY_COLLAPSE_THRESHOLD = 4

interface TextField {
  id: number
  value: string
}

function nextFieldId(fields: TextField[]): number {
  return fields.reduce((max, f) => Math.max(max, f.id), 0) + 1
}

export interface TextMaterialDraft {
  label: string
  content: string
}

interface MaterialLibraryPanelProps {
  materials: UploadedMaterial[]
  busy: boolean
  onUpload: (files: File[]) => void
  onAddText: (drafts: TextMaterialDraft[]) => void
  onRemoveMaterial: (id: string) => void
  onUpdateMaterial: (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ) => Promise<boolean>
}

export function MaterialLibraryPanel({
  materials,
  busy,
  onUpload,
  onAddText,
  onRemoveMaterial,
  onUpdateMaterial,
}: MaterialLibraryPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [textFields, setTextFields] = useState<TextField[]>(() => [{ id: 1, value: '' }])
  const [showContent, setShowContent] = useState(false)
  const [libraryExpanded, setLibraryExpanded] = useState(
    materials.length <= LIBRARY_COLLAPSE_THRESHOLD,
  )

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    onUpload(Array.from(fileList))
    if (inputRef.current) inputRef.current.value = ''
  }

  const updateField = (id: number, value: string) => {
    setTextFields((fields) => fields.map((f) => (f.id === id ? { ...f, value } : f)))
  }

  const addField = () => {
    setTextFields((fields) => [...fields, { id: nextFieldId(fields), value: '' }])
  }

  const removeField = (id: number) => {
    setTextFields((fields) => (fields.length > 1 ? fields.filter((f) => f.id !== id) : fields))
  }

  const handlePasteImage = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getPastedImageFile(e.clipboardData, '截圖')
    if (!file) return
    e.preventDefault()
    onUpload([file])
  }

  const nonEmptyFields = textFields.filter((f) => f.value.trim())

  const handleAddTextClick = () => {
    if (nonEmptyFields.length === 0) return
    onAddText(nonEmptyFields.map((f) => ({ label: `欄位${f.id}`, content: f.value.trim() })))
    setTextFields([{ id: 1, value: '' }])
  }

  return (
    <div className="panel">
      <div className="app-header-row">
        <h2>素材庫</h2>
        {materials.length > 0 && (
          <button className="secondary" onClick={() => setShowContent(true)}>
            📎 檢視素材內容
          </button>
        )}
      </div>
      <p className="subtitle">
        這個專案的所有對話共用同一個素材庫，上傳一次即可重複使用，不用每個對話都重新上傳。支援需求規格文件（PDF / Word .docx / Excel .xlsx / Markdown / 純文字）與 UI 截圖（PNG / JPG）。
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        disabled={busy}
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      <p className="subtitle" style={{ marginTop: 16 }}>
        或直接貼上文字，可分成多個欄位，也可以一次貼很多內容到單一欄位：
      </p>

      {textFields.map((field) => (
        <div key={field.id} className="text-field-row">
          <label className="text-field-label">欄位{field.id}</label>
          <div className="text-field-input-row">
            <textarea
              value={field.value}
              disabled={busy}
              placeholder="貼上需求文字…也可以直接貼上截圖（Ctrl+V）"
              onChange={(e) => updateField(field.id, e.target.value)}
              onPaste={handlePasteImage}
            />
            {textFields.length > 1 && (
              <button
                className="secondary text-field-remove"
                disabled={busy}
                onClick={() => removeField(field.id)}
              >
                移除欄位
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="toolbar">
        <button className="secondary" disabled={busy} onClick={addField}>
          + 新增欄位
        </button>
        <button disabled={busy || nonEmptyFields.length === 0} onClick={handleAddTextClick}>
          加入素材庫
        </button>
      </div>

      {materials.length > 0 && (
        <div className="material-library-collapsible">
          <button
            type="button"
            className="material-library-toggle"
            onClick={() => setLibraryExpanded((prev) => !prev)}
          >
            <span className={`toggle-caret${libraryExpanded ? ' expanded' : ''}`}>▸</span>
            素材清單（共 {materials.length} 項，點擊可編輯說明／檔名）
          </button>
          {libraryExpanded && (
            <ul className="material-list">
              {materials.map((material) => (
                <MaterialRow
                  key={material.id}
                  material={material}
                  busy={busy}
                  onRemove={onRemoveMaterial}
                  onUpdate={onUpdateMaterial}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {showContent && (
        <MaterialsModal
          materials={materials}
          title="專案素材庫"
          onClose={() => setShowContent(false)}
        />
      )}
    </div>
  )
}
