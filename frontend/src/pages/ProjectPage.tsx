import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addTextMaterial,
  createConversation,
  deleteConversation,
  deleteMaterial,
  getMaterials,
  getProject,
  listConversations,
  updateConversation,
  updateMaterial,
  uploadMaterials,
} from '../api'
import { ConversationRow } from '../components/ConversationRow'
import { MaterialLibraryPanel, type TextMaterialDraft } from '../components/MaterialLibraryPanel'
import type { ConversationSummary, Project, UploadedMaterial } from '../types'

function formatTime(ms: number): string {
  return new Date(ms * 1000).toLocaleString('zh-TW', { hour12: false })
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [newConversationName, setNewConversationName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshAll = async () => {
    if (!projectId) return
    try {
      const [proj, mats, convs] = await Promise.all([
        getProject(projectId),
        getMaterials(projectId),
        listConversations(projectId),
      ])
      setProject(proj)
      setMaterials(mats)
      setConversations(convs)
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取專案失敗')
    }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (!projectId) return null

  const handleUpload = async (files: File[]) => {
    setBusy(true)
    setError(null)
    try {
      await uploadMaterials(projectId, files)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上傳失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleAddText = async (drafts: TextMaterialDraft[]) => {
    setBusy(true)
    setError(null)
    try {
      for (const draft of drafts) {
        await addTextMaterial(projectId, draft.label, draft.content)
      }
      await refreshAll()
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
      await refreshAll()
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
      // 就算更新失敗（例如檔名重複被拒絕），也要重新讀取最新狀態，
      // 讓素材列表的輸入框回復成後端實際存的值，不要停在使用者打的內容上。
      await refreshAll()
    }
  }

  const handleCreateConversation = async () => {
    setError(null)
    try {
      const name = newConversationName.trim() || `新對話 ${conversations.length + 1}`
      const conversation = await createConversation(projectId, name)
      setNewConversationName('')
      navigate(`/projects/${projectId}/conversations/${conversation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立對話失敗')
    }
  }

  const handleRenameConversation = async (id: string, name: string) => {
    setError(null)
    try {
      await updateConversation(projectId, id, { name })
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新命名對話失敗')
    }
  }

  const handleDeleteConversation = async (id: string, name: string) => {
    if (!window.confirm(`確定要刪除對話「${name}」嗎？聊天紀錄與測試用例都會一起刪除，且無法復原。`)) return
    setError(null)
    try {
      await deleteConversation(projectId, id)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除對話失敗')
    }
  }

  return (
    <div className="app-shell app-shell-project">
      <div className="app-header">
        <div className="app-header-row">
          <h1>{project?.name ?? '專案'}</h1>
          <button className="secondary" onClick={() => navigate('/')}>
            ← 回首頁
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="project-columns">
        <div className="panel">
          <h2>對話</h2>
          <div className="text-field-input-row">
            <input
              type="text"
              value={newConversationName}
              placeholder="對話名稱，例如：登入頁驗證碼流程（留空則自動命名）"
              onChange={(e) => setNewConversationName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateConversation()
              }}
            />
            <button onClick={handleCreateConversation}>+ 開新對話</button>
          </div>
          {conversations.length === 0 && (
            <p className="subtitle" style={{ marginTop: 12 }}>
              還沒有對話，輸入名稱後點「開新對話」開始產生測試用例。
            </p>
          )}
          {conversations.length > 0 && (
            <ul className="material-list" style={{ marginTop: 12 }}>
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  formatTime={formatTime}
                  onNavigate={(id) => navigate(`/projects/${projectId}/conversations/${id}`)}
                  onRename={handleRenameConversation}
                  onDelete={handleDeleteConversation}
                />
              ))}
            </ul>
          )}
        </div>

        <MaterialLibraryPanel
          materials={materials}
          busy={busy}
          onUpload={handleUpload}
          onAddText={handleAddText}
          onRemoveMaterial={handleRemoveMaterial}
          onUpdateMaterial={handleUpdateMaterial}
        />
      </div>
    </div>
  )
}
