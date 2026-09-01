import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  createConversation,
  deleteConversation,
  getMaterials,
  getProject,
  listConversations,
  updateConversation,
} from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Sidebar } from '../components/Sidebar'
import type { ConversationSummary, Project, UploadedMaterial } from '../types'

export interface ShellContext {
  projectId: string
  project: Project | null
  materials: UploadedMaterial[]
  conversations: ConversationSummary[]
  refreshShell: () => Promise<void>
  setError: (message: string | null) => void
  /** 每個對話各自打到一半、還沒送出的聊天草稿，用對話 id 當 key——放在這裡
   * （而不是 ChatPanel 自己的 state）是因為浮動聊天視窗關閉時 ChatPanel 會
   * 整個 unmount，內部 state 也會跟著消失；放在 ProjectLayout 這一層，切換
   * 對話、收合再展開浮動視窗都不會讓它跟著消失，只有整頁重新整理（state
   * 本來就只活在記憶體裡，本來就該消失）才會清空，符合使用者只要求「同一個
   * session 內」保留草稿的期待。 */
  draftsByConversation: Record<string, string>
  setDraftForConversation: (conversationId: string, draft: string) => void
}

export function ProjectLayout() {
  const { projectId, conversationId } = useParams<{ projectId: string; conversationId?: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [materials, setMaterials] = useState<UploadedMaterial[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [draftsByConversation, setDraftsByConversation] = useState<Record<string, string>>({})

  const setDraftForConversation = (conversationId: string, draft: string) => {
    setDraftsByConversation((prev) => ({ ...prev, [conversationId]: draft }))
  }

  const refreshShell = async () => {
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
    refreshShell()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (!projectId) return null

  const handleCreateConversation = async () => {
    setError(null)
    try {
      const name = `新對話 ${conversations.length + 1}`
      const conversation = await createConversation(projectId, name)
      await refreshShell()
      navigate(`/projects/${projectId}/conversations/${conversation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立對話失敗')
    }
  }

  const handleRenameConversation = async (id: string, name: string) => {
    setError(null)
    try {
      await updateConversation(projectId, id, { name })
      await refreshShell()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新命名對話失敗')
    }
  }

  const handleDeleteConversation = (id: string, name: string) => {
    setDeleteTarget({ id, name })
  }

  const confirmDeleteConversation = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeleteTarget(null)
    setError(null)
    try {
      await deleteConversation(projectId, id)
      await refreshShell()
      if (conversationId === id) navigate(`/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除對話失敗')
    }
  }

  return (
    <div className="app-frame">
      <Sidebar
        projectId={projectId}
        project={project}
        materialCount={materials.length}
        conversations={conversations}
        activeConversationId={conversationId}
        onCreateConversation={handleCreateConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
      />
      <div className="app-main">
        {error && <div className="error-banner">{error}</div>}
        <Outlet
          context={
            {
              projectId,
              project,
              materials,
              conversations,
              refreshShell,
              setError,
              draftsByConversation,
              setDraftForConversation,
            } satisfies ShellContext
          }
        />
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title="刪除對話"
          message={`確定要刪除對話「${deleteTarget.name}」嗎？聊天紀錄與測試用例都會一起刪除，且無法復原。`}
          confirmLabel="確定刪除"
          danger
          onConfirm={confirmDeleteConversation}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
