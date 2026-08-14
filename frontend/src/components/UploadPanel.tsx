import { useRef, useState } from 'react'
import type { UploadedMaterial } from '../types'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg'

interface TextField {
  id: number
  value: string
}

function nextFieldId(fields: TextField[]): number {
  return fields.reduce((max, f) => Math.max(max, f.id), 0) + 1
}

interface UploadPanelProps {
  materials: UploadedMaterial[]
  busy: boolean
  onUpload: (files: File[]) => void
  onAddText: (label: string, content: string) => Promise<void>
  onGenerate: () => void
}

export function UploadPanel({ materials, busy, onUpload, onAddText, onGenerate }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [textFields, setTextFields] = useState<TextField[]>(() => [{ id: 1, value: '' }])
  const [addingId, setAddingId] = useState<number | null>(null)

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

  const submitField = async (field: TextField) => {
    if (!field.value.trim()) return
    setAddingId(field.id)
    try {
      await onAddText(`欄位${field.id}`, field.value.trim())
      setTextFields((fields) => {
        const remaining = fields.filter((f) => f.id !== field.id)
        return remaining.length > 0 ? remaining : [{ id: nextFieldId(remaining), value: '' }]
      })
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="panel">
      <h2>1. 上傳素材</h2>
      <p className="subtitle">
        支援需求規格文件（PDF / Word .docx / Markdown / 純文字）與 UI 截圖（PNG / JPG），可一次上傳多個檔案。
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
        或直接貼上文字，可分成多個欄位、逐一加入，也可以一次貼很多內容到單一欄位：
      </p>

      {textFields.map((field) => (
        <div key={field.id} className="text-field-row">
          <label className="text-field-label">欄位{field.id}</label>
          <textarea
            value={field.value}
            disabled={busy}
            placeholder="貼上需求文字…"
            onChange={(e) => updateField(field.id, e.target.value)}
          />
          <div className="text-field-actions">
            <button
              disabled={busy || addingId === field.id || !field.value.trim()}
              onClick={() => submitField(field)}
            >
              {addingId === field.id ? '加入中…' : '加入為素材'}
            </button>
            {textFields.length > 1 && (
              <button className="secondary" disabled={busy} onClick={() => removeField(field.id)}>
                移除欄位
              </button>
            )}
          </div>
        </div>
      ))}

      <button className="secondary" disabled={busy} onClick={addField}>
        + 新增欄位
      </button>

      {materials.length > 0 && (
        <ul className="material-list">
          {materials.map((material, idx) => (
            <li key={`${material.filename}-${idx}`}>
              {material.kind === 'image' ? '🖼️' : '📄'} {material.filename}
            </li>
          ))}
        </ul>
      )}

      <div className="toolbar">
        <span className="subtitle">已加入 {materials.length} 項素材</span>
        <button disabled={busy || materials.length === 0} onClick={onGenerate}>
          {busy ? '產生中…' : '開始產生測試用例'}
        </button>
      </div>
    </div>
  )
}
