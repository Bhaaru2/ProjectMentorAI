import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { useSessionState } from './hooks/useSessionState'
import { getProfileByAuth } from './api/mentor'
import type { Profile } from './api/mentor'

import { AuthForm } from './components/AuthForm'
import { ProfileSetup } from './components/ProfileSetup'
import { SessionHistoryList } from './components/SessionHistoryList'
import { IdeaInput } from './components/IdeaInput'
import { OptionsDisplay } from './components/OptionsDisplay'
import { IdeaLockConfirm } from './components/IdeaLockConfirm'
import { FeasibilityCard } from './components/FeasibilityCard'
import { RoadmapTimeline } from './components/RoadmapTimeline'
import { CritiquePanel } from './components/CritiquePanel'

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [lastIdeaText, setLastIdeaText] = useState('')
  const [pendingLockText, setPendingLockText] = useState<string | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const session = useSessionState()

  useEffect(() => {
    if (!user) { setProfile(null); return }
    setProfileLoading(true)
    getProfileByAuth(user.id)
      .then(p => setProfile(p))
      .finally(() => setProfileLoading(false))
  }, [user])

  if (authLoading || profileLoading) {
    return <div className="full-center"><p className="muted">Loading…</p></div>
  }

  if (!user) return <AuthForm />

  if (!profile) {
    return <ProfileSetup authUserId={user.id} onComplete={p => setProfile(p)} />
  }

  const startNew = () => {
    session.resetSession()
    setPendingLockText(null)
    setLastIdeaText('')
  }

  const handleSelectSession = (sessionId: string) => {
    setPendingLockText(null)
    session.loadSession(sessionId)
  }

  const handleAnalyze = async (ideaText: string) => {
    setLastIdeaText(ideaText)
    setPendingLockText(null)
    await session.startAndAnalyze(ideaText, profile.id)
    setHistoryRefreshKey(k => k + 1)
  }

  const handleLock = async () => {
    if (!pendingLockText) return
    const text = pendingLockText
    setPendingLockText(null)
    await session.lockIdea(text)
  }

  let mainContent: React.ReactNode

  if (!session.sessionId || session.phase === 'draft') {
    mainContent = <IdeaInput onSubmit={handleAnalyze} loading={session.loading} />

  } else if (session.phase === 'options_presented') {
    mainContent = pendingLockText ? (
      <IdeaLockConfirm
        selectedText={pendingLockText}
        onConfirm={handleLock}
        onBack={() => setPendingLockText(null)}
        loading={session.loading}
      />
    ) : (
      <OptionsDisplay
        ideaOutput={session.ideaOutput!}
        originalIdeaText={lastIdeaText}
        onSelectOption={setPendingLockText}
        onReanalyze={startNew}
      />
    )

  } else if (session.phase === 'idea_locked' || (session.phase === 'feasibility_presented' && !session.feasibilityOutput)) {
    mainContent = <div className="card"><p className="muted">Running feasibility analysis…</p></div>

  } else if (session.phase === 'feasibility_presented' && session.feasibilityOutput) {
    mainContent = (
      <FeasibilityCard
        feasibility={session.feasibilityOutput}
        onConfirmStack={session.confirmStack}
        onReviseStack={session.reviseStack}
        loading={session.loading}
      />
    )

  } else if (session.phase === 'stack_confirmed' || (session.phase === 'roadmap_ready' && !session.roadmapOutput)) {
    mainContent = <div className="card"><p className="muted">Building your 8-week roadmap…</p></div>

  } else if ((session.phase === 'roadmap_ready' || session.phase === 'revising') && session.roadmapOutput && session.critiqueOutput) {
    mainContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <RoadmapTimeline roadmap={session.roadmapOutput} flags={session.critiqueOutput.flags} />
        <CritiquePanel
          critique={session.critiqueOutput}
          onSubmitRevision={session.submitRevision}
          loading={session.loading}
        />
      </div>
    )

  } else if (session.phase === 'revising') {
    mainContent = <div className="card"><p className="muted">Revising your roadmap…</p></div>

  } else {
    mainContent = <IdeaInput onSubmit={handleAnalyze} loading={session.loading} />
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="header-title">AI Project Mentor</span>
        <div className="header-right">
          <span className="muted small">{profile.full_name}</span>
          <button className="link-btn" onClick={() => { signOut(); startNew() }}>Log out</button>
        </div>
      </header>

      <div className="app-body">
        <SessionHistoryList
          profileId={profile.id}
          activeSessionId={session.sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={startNew}
          refreshKey={historyRefreshKey}
        />

        <main className="main-content">
          {session.error && (
            <div className="error-banner">
              {session.error}
              <button className="link-btn" onClick={startNew} style={{ marginLeft: '0.5rem' }}>
                Dismiss
              </button>
            </div>
          )}
          {mainContent}
        </main>
      </div>
    </div>
  )
}
