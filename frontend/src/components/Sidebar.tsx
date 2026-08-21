import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { ProjectSwitcher } from './ProjectSwitcher'
import type { ConversationSummary, Project } from '../types'

/**
 * 收合側欄的圖示都擠在 64px 寬、且對話清單本身有 overflow-y:auto 的容器裡，
 * 用一般的 CSS absolute tooltip 會被清單容器的捲動邊界裁掉，所以改用 portal +
 * 滑鼠移入時量測位置，直接掛到 document.body 上，不受任何祖先容器的 overflow 影響。
 */
function IconTooltip({
  label,
  meta,
  children,
}: {
  label: string
  meta?: string
  children: ReactNode
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 10 })
  }
  const hide = () => setPos(null)

  return (
    <span
      className="sidebar-tooltip-anchor"
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div className="sidebar-tooltip" role="tooltip" style={{ top: pos.top, left: pos.left }}>
            <span className="sidebar-tooltip-title">{label}</span>
            {meta && <span className="sidebar-tooltip-meta">{meta}</span>}
          </div>,
          document.body,
        )}
    </span>
  )
}

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
      <IconTooltip
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
      </IconTooltip>
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
      {!hasResult && !editing && <span className="sidebar-unread-dot" title="還沒有測試用例" />}
      {!editing && (
        <div className="sidebar-nav-actions">
          <button
            type="button"
            className="sidebar-nav-action"
            title="重新命名"
            onClick={() => setEditing(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H7a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
              <path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
          <button type="button" className="sidebar-nav-action" title="刪除" onClick={onDelete}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
            </svg>
          </button>
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
          <IconTooltip label="展開側欄">
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={() => setCollapsed(false)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </button>
          </IconTooltip>

          <IconTooltip label={project?.name ?? '專案'}>
            <div className="sidebar-collapsed-logo">{(project?.name ?? '?').slice(0, 1)}</div>
          </IconTooltip>

          <IconTooltip label="素材庫" meta={`${materialCount} 項`}>
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
          </IconTooltip>
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
          <IconTooltip label="開新對話">
            <button
              type="button"
              className="sidebar-collapsed-icon sidebar-collapsed-add"
              onClick={onCreateConversation}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </IconTooltip>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <ProjectSwitcher currentProjectId={projectId} currentProjectName={project?.name ?? '專案'} />
        <button
          type="button"
          className="sidebar-collapse-toggle"
          title="收合側欄"
          onClick={() => setCollapsed(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          </svg>
        </button>
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
