import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProject, listProjects } from '../api'
import type { ProjectSummary } from '../types'

interface ProjectSwitcherProps {
  currentProjectId: string
  currentProjectName: string
}

/** 專案不常切換，所以不做常駐的下拉/圖示列，改成點了才彈出的小選單。 */
export function ProjectSwitcher({ currentProjectId, currentProjectName }: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const project = await createProject(name)
      setOpen(false)
      setNewName('')
      navigate(`/projects/${project.id}`)
    } catch {
      // 建立失敗時維持選單開啟，讓使用者看得到剛打的名稱重試
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="project-switcher" ref={containerRef}>
      <button
        type="button"
        className="project-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        title="切換專案"
      >
        <span className="project-switcher-name">{currentProjectName}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="project-switcher-menu">
          {projects === null && <p className="project-switcher-loading">載入中…</p>}
          {projects?.map((project) => (
            <div
              key={project.id}
              className={`project-switcher-item${project.id === currentProjectId ? ' active' : ''}`}
              onClick={() => {
                setOpen(false)
                if (project.id !== currentProjectId) navigate(`/projects/${project.id}`)
              }}
            >
              {project.name}
            </div>
          ))}
          <div className="project-switcher-divider" />
          <div className="project-switcher-create">
            <input
              value={newName}
              disabled={busy}
              placeholder="新專案名稱"
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
      )}
    </div>
  )
}
