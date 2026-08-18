import { useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { getPastedImageFile } from '../clipboardImage'
import type { UploadedMaterial } from '../types'
import { MaterialRow } from './MaterialRow'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.md,.markdown,.txt,.png,.jpg,.jpeg'

interface MaterialSelectorProps {
  materials: UploadedMaterial[]
  selectedIds: string[]
  busy: boolean
  onChange: (ids: string[]) => void
  onUpdateMaterial: (id: string, updates: { filename?: string; description?: string; text?: string }) => void
  onAddFiles: (files: File[]) => void
  onAddText: (label: string, content: string) => void
}

export function MaterialSelector({
  materials,
  selectedIds,
  busy,
  onChange,
  onUpdateMaterial,
  onAddFiles,
  onAddText,
}: MaterialSelectorProps) {
  const selectedSet = new Set(selectedIds)
  const inputRef = useRef<HTMLInputElement>(null)
  const [newText, setNewText] = useState('')

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((existing) => existing !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    onAddFiles(Array.from(fileList))
    if (inputRef.current) inputRef.current.value = ''
  }

  const handlePasteImage = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getPastedImageFile(e.clipboardData, '截圖')
    if (!file) return
    e.preventDefault()
    onAddFiles([file])
  }

  const handleAddTextClick = () => {
    const content = newText.trim()
    if (!content) return
    onAddText('新素材', content)
    setNewText('')
  }

  return (
    <div>
      {materials.length > 0 && (
        <ul className="material-list">
          {materials.map((material) => (
            <MaterialRow
              key={material.id}
              material={material}
              busy={busy}
              onUpdate={onUpdateMaterial}
              leadingControl={
                <input
                  type="checkbox"
                  checked={selectedSet.has(material.id)}
                  disabled={busy}
                  onChange={() => toggle(material.id)}
                />
              }
            />
          ))}
        </ul>
      )}

      <p className="subtitle" style={{ marginTop: 12 }}>
        也可以直接在這裡加入新素材（會加進整個專案的素材庫，並自動勾選給這個對話用）：
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        disabled={busy}
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <div className="text-field-input-row" style={{ marginTop: 8 }}>
        <textarea
          value={newText}
          disabled={busy}
          placeholder="貼上文字新增素材…也可以直接貼上截圖（Ctrl+V）"
          onChange={(e) => setNewText(e.target.value)}
          onPaste={handlePasteImage}
        />
        <button disabled={busy || !newText.trim()} onClick={handleAddTextClick}>
          加入
        </button>
      </div>
    </div>
  )
}
