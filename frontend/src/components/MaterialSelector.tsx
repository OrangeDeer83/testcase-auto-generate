import { useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { getPastedImageFile } from '../clipboardImage'
import type { UploadedMaterial } from '../types'
import { MaterialGrid } from './MaterialGrid'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.md,.markdown,.txt,.png,.jpg,.jpeg'
const LIBRARY_COLLAPSE_THRESHOLD = 4

interface MaterialSelectorProps {
  materials: UploadedMaterial[]
  selectedIds: string[]
  busy: boolean
  onChange: (ids: string[]) => void
  onUpdateMaterial: (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ) => Promise<boolean>
  onAddFiles: (files: File[]) => void
  onAddText: (label: string, content: string) => void
  onRemoveMaterial: (id: string) => void
  onMergeMaterials: (ids: string[]) => Promise<void>
  onUngroupImage: (materialId: string, index: number) => void
  usageCounts?: Map<string, number>
}

export function MaterialSelector({
  materials,
  selectedIds,
  busy,
  onChange,
  onUpdateMaterial,
  onAddFiles,
  onAddText,
  onRemoveMaterial,
  onMergeMaterials,
  onUngroupImage,
  usageCounts,
}: MaterialSelectorProps) {
  const selectedSet = new Set(selectedIds)
  const inputRef = useRef<HTMLInputElement>(null)
  const [newText, setNewText] = useState('')
  const [libraryExpanded, setLibraryExpanded] = useState(
    materials.length <= LIBRARY_COLLAPSE_THRESHOLD,
  )

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

  const focusUpload = () => {
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    inputRef.current?.click()
  }

  return (
    <div>
      <p className="text-field-label">新增這次對話要用的素材</p>
      <p className="subtitle" style={{ marginTop: 0 }}>
        會加進整個專案的素材庫，並自動勾選給這個對話用：
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

      {materials.length > 0 && (
        <div className="material-library-collapsible">
          <button
            type="button"
            className="material-library-toggle"
            onClick={() => setLibraryExpanded((prev) => !prev)}
          >
            <span className={`toggle-caret${libraryExpanded ? ' expanded' : ''}`}>▸</span>
            專案素材庫（共 {materials.length} 項，已勾選 {selectedIds.length} 項）
          </button>
          {libraryExpanded && (
            <MaterialGrid
              materials={materials}
              busy={busy}
              onUpdateMaterial={onUpdateMaterial}
              onRemoveMaterial={onRemoveMaterial}
              onMergeMaterials={onMergeMaterials}
              onUngroupImage={onUngroupImage}
              selectedIds={selectedSet}
              onToggleSelect={toggle}
              onAddClick={focusUpload}
              usageCounts={usageCounts}
            />
          )}
        </div>
      )}
    </div>
  )
}
