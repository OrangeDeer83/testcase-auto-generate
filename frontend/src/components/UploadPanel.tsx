import { useRef } from 'react'
import type { UploadedMaterial } from '../types'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg'

interface UploadPanelProps {
  materials: UploadedMaterial[]
  busy: boolean
  onUpload: (files: File[]) => void
  onGenerate: () => void
}

export function UploadPanel({ materials, busy, onUpload, onGenerate }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    onUpload(Array.from(fileList))
    if (inputRef.current) inputRef.current.value = ''
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
        <span className="subtitle">已上傳 {materials.length} 個檔案</span>
        <button disabled={busy || materials.length === 0} onClick={onGenerate}>
          {busy ? '產生中…' : '開始產生測試用例'}
        </button>
      </div>
    </div>
  )
}
