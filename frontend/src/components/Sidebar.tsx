import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ProjectSwitcher } from './ProjectSwitcher'
import { Tooltip } from './Tooltip'
import type { ConversationSummary, Project } from '../types'

interface SidebarProps {
  projectId: string
  project: Project | null
  materialCount: number
  conversations: ConversationSummary[]
  activeConversationId?: string
  onCreateConversation: () => void
  onRenameConversation: (id: string, name: string) => void
  onDeleteConversation: (id: string, name: string) => void
}

function ConversationNavItem({
  conversation,
  active,
  collapsed,
  onNavigate,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary
  active: boolean
  collapsed: boolean
  onNavigate: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.name)
  const hasResult = conversation.testCaseCount > 0

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === conversation.name) {
      setDraft(conversation.name)
      return
    }
    onRename(trimmed)
  }

  if (collapsed) {
    return (
      <Tooltip
        placement="right"
        label={conversation.name}
        meta={hasResult ? `已產生 ${conversation.testCaseCount} 筆測試用例` : '尚未產生測試用例'}
      >
        <button
          type="button"
          className={`sidebar-collapsed-icon sidebar-collapsed-avatar${active ? ' active' : ''}`}
          onClick={onNavigate}
        >
          {conversation.name.trim().slice(0, 1) || '?'}
          {!hasResult && <span className="sidebar-collapsed-dot" />}
        </button>
      </Tooltip>
    )
  }

  return (
    <div className={`sidebar-nav-item${active ? ' active' : ''}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sidebar-nav-icon">
        <path d="M21 11.5a8.4 8.4 0 01-8.5 8.4 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8A8.5 8.5 0 0112.5 3h.5a8.5 8.5 0 018 8v.5z" />
      </svg>
      {editing ? (
        <input
          className="sidebar-rename-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(conversation.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <span className="sidebar-nav-label" onClick={onNavigate}>
          {conversation.name}
        </span>
      )}
      {!hasResult && !editing && (
        <Tooltip label="還沒有測試用例">
          <span className="sidebar-unread-dot" />
        </Tooltip>
      )}
      {!editing && (
        <div className="sidebar-nav-actions">
          <Tooltip label="重新命名">
            <button type="button" className="sidebar-nav-action" onClick={() => setEditing(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H7a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
                <path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label="刪除">
            <button type="button" className="sidebar-nav-action" onClick={onDelete}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
              </svg>
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  projectId,
  project,
  materialCount,
  conversations,
  activeConversationId,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <div className="sidebar-collapsed-top">
          <Tooltip placement="right" label="展開側欄">
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={() => setCollapsed(false)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </button>
          </Tooltip>

          <Tooltip placement="right" label={project?.name ?? '專案'}>
            <div className="sidebar-collapsed-logo">{(project?.name ?? '?').slice(0, 1)}</div>
          </Tooltip>

          <Tooltip placement="right" label="素材庫" meta={`${materialCount} 項`}>
            <NavLink
              to={`/projects/${projectId}`}
              end
              className={({ isActive }) => `sidebar-collapsed-icon${isActive ? ' active' : ''}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </NavLink>
          </Tooltip>
          <div className="sidebar-collapsed-divider" />
        </div>

        <div className="sidebar-collapsed-list">
          {conversations.map((conversation) => (
            <ConversationNavItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              collapsed
              onNavigate={() => navigate(`/projects/${projectId}/conversations/${conversation.id}`)}
              onRename={(name) => onRenameConversation(conversation.id, name)}
              onDelete={() => onDeleteConversation(conversation.id, conversation.name)}
            />
          ))}
        </div>

        <div className="sidebar-collapsed-bottom">
          <Tooltip placement="right" label="開新對話">
            <button
              type="button"
              className="sidebar-collapsed-icon sidebar-collapsed-add"
              onClick={onCreateConversation}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <ProjectSwitcher currentProjectId={projectId} currentProjectName={project?.name ?? '專案'} />
        <Tooltip placement="bottom" label="收合側欄">
          <button type="button" className="sidebar-collapse-toggle" onClick={() => setCollapsed(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
        </Tooltip>
      </div>

      <div className="sidebar-section">
        <NavLink
          to={`/projects/${projectId}`}
          end
          className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sidebar-nav-icon">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="sidebar-nav-label">素材庫</span>
          <span className="sidebar-count">{materialCount}</span>
        </NavLink>
      </div>

      <div className="sidebar-section sidebar-conversations">
        <p className="sidebar-section-title">對話</p>
        <div className="sidebar-nav-list">
          {conversations.map((conversation) => (
            <ConversationNavItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              collapsed={false}
              onNavigate={() => navigate(`/projects/${projectId}/conversations/${conversation.id}`)}
              onRename={(name) => onRenameConversation(conversation.id, name)}
              onDelete={() => onDeleteConversation(conversation.id, conversation.name)}
            />
          ))}
          {conversations.length === 0 && (
            <p className="sidebar-empty-hint">
              這個專案還沒有對話
              <br />
              開一個新對話，開始上傳需求文件或截圖
            </p>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-create-button" onClick={onCreateConversation}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          開新對話
        </button>
      </div>
    </div>
  )
}
