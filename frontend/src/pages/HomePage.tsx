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
    <div className="home-shell">
      <div className="home-card">
        <div className="home-brand">
          <div className="home-brand-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M3 11l9-8 9 8" />
              <path d="M5 10v10h14V10" />
            </svg>
          </div>
          <span>測試用例自動產生</span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div>
          <p className="home-section-title">選擇專案</p>
          {projects.length === 0 && <p className="subtitle">還沒有任何專案，在下面建立第一個。</p>}
          <div className="home-project-list">
            {projects.map((project) => (
              <div key={project.id} className="home-project-item" onClick={() => navigate(`/projects/${project.id}`)}>
                <div className="home-project-avatar">{project.name.slice(0, 1)}</div>
                <div className="home-project-info">
                  <p className="home-project-name">{project.name}</p>
                  <p className="home-project-meta">
                    素材 {project.materialCount} 項・對話 {project.conversationCount} 個・最後更新{' '}
                    {formatTime(project.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary material-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(project.id, project.name)
                  }}
                >
                  刪除
                </button>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8896a5" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            ))}
          </div>
        </div>

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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            建立專案
          </button>
        </div>
      </div>
    </div>
  )
}
