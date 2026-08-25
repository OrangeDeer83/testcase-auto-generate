import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  addTextMaterial,
  deleteMaterial,
  mergeMaterials,
  ungroupImage,
  updateMaterial,
  uploadMaterials,
} from '../api'
import { MaterialLibraryPanel, type TextMaterialDraft } from '../components/MaterialLibraryPanel'
import type { ShellContext } from './ProjectLayout'

export function MaterialLibraryView() {
  const { projectId, materials, refreshShell, setError } = useOutletContext<ShellContext>()
  const [busy, setBusy] = useState(false)

  const handleUpload = async (files: File[]) => {
    setBusy(true)
    setError(null)
    try {
      await uploadMaterials(projectId, files)
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上傳失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleMergeMaterials = async (ids: string[]) => {
    setBusy(true)
    setError(null)
    try {
      await mergeMaterials(projectId, ids)
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '合併素材失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleUngroupImage = async (materialId: string, index: number) => {
    setError(null)
    try {
      await ungroupImage(projectId, materialId, index)
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '拆出圖片失敗')
    }
  }

  const handleAddText = async (drafts: TextMaterialDraft[]) => {
    setBusy(true)
    setError(null)
    try {
      for (const draft of drafts) {
        await addTextMaterial(projectId, draft.label, draft.content)
      }
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入素材失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveMaterial = async (id: string) => {
    setError(null)
    try {
      await deleteMaterial(projectId, id)
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除素材失敗')
    }
  }

  const handleUpdateMaterial = async (
    id: string,
    updates: { filename?: string; description?: string; text?: string },
  ): Promise<boolean> => {
    setError(null)
    try {
      await updateMaterial(projectId, id, updates)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新素材失敗')
      return false
    } finally {
      await refreshShell()
    }
  }

  return (
    <MaterialLibraryPanel
      materials={materials}
      busy={busy}
      onUpload={handleUpload}
      onAddText={handleAddText}
      onRemoveMaterial={handleRemoveMaterial}
      onUpdateMaterial={handleUpdateMaterial}
      onMergeMaterials={handleMergeMaterials}
      onUngroupImage={handleUngroupImage}
    />
  )
}
