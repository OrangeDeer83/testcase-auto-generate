import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProject, deleteProject, listProjects } from '../api'
import type { ProjectSummary } from '../types'

function formatTime(ms: number): string {
  return new Date(ms * 1000).toLocaleString('zh-TW', { hour12: false })
}

export function HomePage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setProjects(await listProjects())
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取專案列表失敗')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const project = await createProject(name)
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立專案失敗')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`確定要刪除專案「${name}」嗎？裡面的素材與所有對話都會一起刪除，且無法復原。`)) return
    setError(null)
    try {
      await deleteProject(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除專案失敗')
    }
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1>測試用例自動產生</h1>
        <p className="subtitle">選擇一個專案繼續，或建立新專案開始上傳需求文件與 UI 截圖。</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <h2>建立新專案</h2>
        <div className="text-field-input-row">
          <input
            type="text"
            value={newName}
            disabled={busy}
            placeholder="專案名稱，例如：登入模組"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
          <button disabled={busy || !newName.trim()} onClick={handleCreate}>
            建立
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>專案列表</h2>
        {projects.length === 0 && <p className="subtitle">還沒有任何專案。</p>}
        {projects.length > 0 && (
          <ul className="material-list">
            {projects.map((project) => (
              <li key={project.id} className="material-item">
                <div className="material-item-row">
                  <span
                    className="project-name-link"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    {project.name}
                  </span>
                  <button
                    className="secondary material-remove"
                    onClick={() => handleDelete(project.id, project.name)}
                  >
                    刪除
                  </button>
                </div>
                <p className="previous-value">
                  素材 {project.materialCount} 項・對話 {project.conversationCount} 個・最後更新
                  {' '}{formatTime(project.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
