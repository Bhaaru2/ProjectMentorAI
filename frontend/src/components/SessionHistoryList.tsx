import { useEffect, useState } from 'react'
import { listSessions } from '../api/mentor'
import type { Session } from '../api/mentor'

interface Props {
  profileId: string
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  refreshKey: number
}

const STATUS_LABEL: Record<Session['status'], string> = {
  draft: 'Draft',
  options_presented: 'Choosing idea',
  idea_locked: 'Idea locked',
  feasibility_presented: 'Reviewing stack',
  stack_confirmed: 'Stack confirmed',
  roadmap_ready: 'Roadmap ready',
  revising: 'Revising',
}

export function SessionHistoryList({
  profileId,
  activeSessionId,
  onSelectSession,
  onNewSession,
  refreshKey,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    listSessions(profileId).then(setSessions).catch(() => {})
  }, [profileId, refreshKey])

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <button className="btn-new" onClick={onNewSession} title="New session">＋</button>
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <p className="muted small" style={{ padding: '0 0.75rem' }}>No sessions yet.</p>
        )}
        {sessions.map(s => (
          <button
            key={s.id}
            className={`session-item ${s.id === activeSessionId ? 'session-active' : ''}`}
            onClick={() => onSelectSession(s.id)}
          >
            <span className="session-title">{s.title}</span>
            <span className="session-status">{STATUS_LABEL[s.status]}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
