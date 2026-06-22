import { useState, useEffect, useRef } from 'react'
import { useAuth } from './hooks/useAuth'
import { useSessionState } from './hooks/useSessionState'
import { getProfileByAuth, getIntentSummary } from './api/mentor'
import type { Profile, CriticOutput } from './api/mentor'

const hasRoadmapIssues = (c: CriticOutput): boolean =>
  c.overall_verdict !== 'strong' ||
  c.flags.length > 0 ||
  c.checklist.some(item => item.result === 'fail') ||
  c.student_feedback_addressed?.result === 'fail' ||
  c.missing_elements.length > 0

import { AuthForm } from './components/AuthForm'
import { ProfileSetup } from './components/ProfileSetup'
import { SessionHistoryList } from './components/SessionHistoryList'
import { IdeaInput } from './components/IdeaInput'
import { OptionsDisplay } from './components/OptionsDisplay'
import { IdeaLockConfirm } from './components/IdeaLockConfirm'
import { FeasibilityCard } from './components/FeasibilityCard'
import { RoadmapTimeline } from './components/RoadmapTimeline'
import { CritiquePanel } from './components/CritiquePanel'
import { ConversationLog } from './components/ConversationLog'
import { DiscussInput } from './components/DiscussInput'

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [lastIdeaText, setLastIdeaText] = useState('')
  const [pendingLockText, setPendingLockText] = useState<string | null>(null)
  const [refinedIdeaSummary, setRefinedIdeaSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [analyzeIdeaLoading, setAnalyzeIdeaLoading] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [showRoadmap, setShowRoadmap] = useState(false)

  const session = useSessionState()
  const mainRef = useRef<HTMLElement>(null)
  const roadmapRef = useRef<HTMLDivElement>(null)
  const feasibilityRef = useRef<HTMLDivElement>(null)
  const postMessagesEndRef = useRef<HTMLDivElement>(null)
  const lockConfirmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) { setProfile(null); return }
    setProfileLoading(true)
    getProfileByAuth(user.id)
      .then(p => setProfile(p))
      .finally(() => setProfileLoading(false))
  }, [user])

  // Scroll to FeasibilityCard when it arrives or is revised
  useEffect(() => {
    if (session.feasibilityOutput) {
      setTimeout(() => {
        feasibilityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [session.feasibilityOutput])

  // Scroll to top of roadmap when it arrives or is revised
  useEffect(() => {
    if (session.roadmapOutput) {
      setTimeout(() => {
        roadmapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [session.roadmapOutput])

  useEffect(() => {
    if (session.conversationLog.length > 0) {
      setTimeout(() => {
        // When roadmap is visible, scroll to end of postMessages so the latest reply
        // is in view without being buried under the roadmap
        if (postMessagesEndRef.current) {
          postMessagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
        } else {
          mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: 'smooth' })
        }
      }, 150)
    }
  }, [session.conversationLog.length])

  // Scroll to IdeaLockConfirm when user picks an option — it renders at the bottom
  // of content, not next to the option card, so we must bring it into view.
  useEffect(() => {
    if (pendingLockText) {
      setTimeout(() => {
        lockConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [pendingLockText])

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
    setRefinedIdeaSummary(null)
    setSummaryLoading(false)
    setLastIdeaText('')
    setShowRoadmap(false)
  }

  const handleSelectSession = (sessionId: string) => {
    setPendingLockText(null)
    setShowRoadmap(false)
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
    setRefinedIdeaSummary(null)
    setSummaryLoading(false)
    await session.lockIdea(text)
    setHistoryRefreshKey(k => k + 1)
  }

  const handleAnalyzeIdeaFromDiscussion = async () => {
    if (!session.sessionId) return
    // Clear any pending lock so the new analysis card shows Proceed/Change, not IdeaLockConfirm
    setPendingLockText(null)
    setRefinedIdeaSummary(null)
    setAnalyzeIdeaLoading(true)
    try {
      let ideaText = lastIdeaText
      try {
        const summary = await getIntentSummary(session.sessionId)
        if (summary) ideaText = summary
      } catch { /* fallback to lastIdeaText */ }
      await session.reanalyzeIdea(ideaText)
    } finally {
      setAnalyzeIdeaLoading(false)
    }
  }

  const handleFeasibilityAssessmentFromDiscussion = async () => {
    if (!session.sessionId) return
    // Collect user text messages from postMessages as the discussion note
    const note = postMessages
      .filter(m => m.role === 'user' && m.message_type !== 'agent_output')
      .map(m => (m.content as { text?: string }).text || '')
      .filter(Boolean)
      .join(' ')
    await session.reviseStack(note || 're-assess based on our discussion')
  }

  const handleDiscuss = async (message: string, intent: 'ask' | 'revise') => {
    if (intent === 'revise' && session.phase === 'options_presented') {
      setLastIdeaText(message)
      await session.reanalyzeIdea(message)
    } else {
      await session.discuss(message, intent)
    }
  }

  const handleProceed = async (ideaText: string) => {
    setRefinedIdeaSummary(null)
    setPendingLockText(ideaText)
    const hasDiscussion = session.conversationLog.some(
      m => m.role === 'assistant' && m.message_type !== 'agent_output'
    )
    if (hasDiscussion && session.sessionId) {
      setSummaryLoading(true)
      try {
        const summary = await getIntentSummary(session.sessionId)
        setRefinedIdeaSummary(summary)
      } catch {
        // silently skip — confirm card still works without summary
      } finally {
        setSummaryLoading(false)
      }
    }
  }

  // Top slot: only the initial idea input
  const topContent: React.ReactNode =
    (!session.sessionId || session.phase === 'draft')
      ? <IdeaInput onSubmit={handleAnalyze} loading={session.loading} />
      : null

  // Split conversation log at the last agent output of the active pipeline stage.
  // preMessages  → ConversationLog above inlineCard (ConversationLog already skips the last
  //                active-stage output since inlineCard shows it live)
  // postMessages → plain bubbles rendered BELOW inlineCard so discussion continues after it
  const activeStage =
    session.phase === 'feasibility_presented' || session.phase === 'stack_confirmed'
      ? 'feasibility'
      : session.phase === 'roadmap_ready' || session.phase === 'revising'
        ? 'roadmap'
        : null

  let splitIdx = -1
  if (activeStage) {
    session.conversationLog.forEach((msg, idx) => {
      if (msg.role === 'assistant' && msg.message_type === 'agent_output' && msg.stage === activeStage) {
        splitIdx = idx
      }
    })
  }

  const preMessages  = splitIdx >= 0 ? session.conversationLog.slice(0, splitIdx + 1) : session.conversationLog
  const postMessages = splitIdx >= 0 ? session.conversationLog.slice(splitIdx + 1) : []

  // Inline slot: rendered BELOW the conversation so it's always visible
  let inlineCard: React.ReactNode = null
  if (session.sessionId && session.phase !== 'draft' && session.phase !== 'options_presented') {
    if (session.phase === 'idea_locked' ||
        (session.phase === 'feasibility_presented' && !session.feasibilityOutput)) {
      inlineCard = <div className="card"><p className="muted">Running feasibility analysis…</p></div>

    } else if (session.phase === 'feasibility_presented' && session.feasibilityOutput) {
      inlineCard = (
        <div ref={feasibilityRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {session.ideaOutput && (
            <OptionsDisplay
              ideaOutput={session.ideaOutput}
              originalIdeaText=""
              onSelectOption={() => {}}
              onReanalyze={() => {}}
              readOnly
            />
          )}
          <FeasibilityCard
            feasibility={session.feasibilityOutput}
            onConfirmStack={session.confirmStack}
            onReviseStack={session.reviseStack}
            loading={session.loading}
          />
        </div>
      )

    } else if (session.phase === 'stack_confirmed' ||
               (session.phase === 'roadmap_ready' && !session.roadmapOutput)) {
      inlineCard = <div className="card"><p className="muted">Building your 8-week roadmap…</p></div>

    } else if (session.phase === 'revising' &&
               (!session.roadmapOutput || !session.critiqueOutput)) {
      inlineCard = <div className="card"><p className="muted">Revising your roadmap…</p></div>
    }
    // roadmap_ready/revising with output: rendered below postMessages (see JSX)
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

        <main className="main-content" ref={mainRef}>
          {session.error && (
            <div className="error-banner">
              {session.error}
              <button className="link-btn" onClick={startNew} style={{ marginLeft: '0.5rem' }}>
                Dismiss
              </button>
            </div>
          )}

          {topContent}

          {session.sessionId && session.phase !== 'draft' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <ConversationLog
                messages={preMessages}
                activePhase={session.phase}
                originalIdeaText={(() => {
                  if (lastIdeaText) return lastIdeaText
                  // Use the LAST idea-stage user message so "Proceed" always uses the most recent idea text
                  const msgs = session.conversationLog
                  for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].role === 'user' && msgs[i].stage === 'idea_analysis') {
                      return (msgs[i].content as { text?: string }).text ?? ''
                    }
                  }
                  return (msgs.find(m => m.role === 'user')?.content as { text?: string })?.text ?? ''
                })()}
                onSelectOption={handleProceed}
                onReanalyze={startNew}
                pendingLockText={pendingLockText}
                onAnalyzeIdea={session.phase === 'options_presented' ? handleAnalyzeIdeaFromDiscussion : undefined}
                analyzeIdeaLoading={analyzeIdeaLoading}
              />
              {inlineCard}
              {postMessages.length > 0 && (
                <div className="card">
                  <div className="conversation-list" style={{ marginTop: 0 }}>
                    {postMessages
                      .filter(msg => msg.message_type !== 'agent_output')
                      .map(msg => {
                        const isUser = msg.role === 'user'
                        const text = (msg.content as { text?: string }).text || ''
                        const time = new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit', minute: '2-digit',
                        })
                        const showFeasibilityBtn =
                          !isUser && session.phase === 'feasibility_presented'
                        const showRoadmapBtn =
                          !isUser && !showRoadmap &&
                          (session.phase === 'roadmap_ready' || session.phase === 'revising') &&
                          !!session.roadmapOutput
                        return (
                          <div key={msg.id}>
                            <div className={`bubble-row ${isUser ? 'bubble-row-user' : 'bubble-row-assistant'}`}>
                              <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                                <p style={{ margin: 0 }}>{text}</p>
                                <span className="bubble-time">{time}</span>
                              </div>
                            </div>
                            {showFeasibilityBtn && (
                              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '0.5rem', paddingLeft: '0.25rem' }}>
                                <button
                                  className="btn-primary"
                                  onClick={handleFeasibilityAssessmentFromDiscussion}
                                  disabled={session.loading}
                                >
                                  {session.loading ? 'Running assessment…' : '🔍 Feasibility Assessment'}
                                </button>
                              </div>
                            )}
                            {showRoadmapBtn && (
                              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '0.5rem', paddingLeft: '0.25rem' }}>
                                <button
                                  className="btn-primary"
                                  onClick={() => setShowRoadmap(true)}
                                >
                                  See the Roadmap
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    <div ref={postMessagesEndRef} />
                  </div>
                </div>
              )}
              {/* Roadmap ready prompt — only when no discussion has happened yet */}
              {(session.phase === 'roadmap_ready' || session.phase === 'revising') &&
               session.roadmapOutput && !showRoadmap &&
               postMessages.filter(m => m.message_type !== 'agent_output').length === 0 && (
                <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0 }} className="muted">
                    Your roadmap is ready — discuss first, or view it now.
                  </p>
                  <button className="btn-primary" onClick={() => setShowRoadmap(true)}>
                    See the Roadmap
                  </button>
                </div>
              )}
              {/* Roadmap + Critique — rendered here (below chat) when user clicks See the Roadmap */}
              {showRoadmap && session.roadmapOutput && session.critiqueOutput &&
               (session.phase === 'roadmap_ready' || session.phase === 'revising') && (
                <div ref={roadmapRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <RoadmapTimeline roadmap={session.roadmapOutput} flags={session.critiqueOutput.flags} />
                  {hasRoadmapIssues(session.critiqueOutput) ? (
                    <CritiquePanel
                      critique={session.critiqueOutput}
                      onSubmitRevision={session.submitRevision}
                      loading={session.loading}
                      readOnly
                    />
                  ) : (
                    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '1.1rem' }}>✓</span>
                      <p style={{ margin: 0, color: 'var(--success)', fontWeight: 600 }}>
                        Roadmap looks strong — no issues flagged.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {pendingLockText && session.phase === 'options_presented' && (
                <div ref={lockConfirmRef}>
                  <IdeaLockConfirm
                    selectedText={pendingLockText}
                    revisedPlan={refinedIdeaSummary ?? undefined}
                    revisedPlanLoading={summaryLoading}
                    onConfirm={handleLock}
                    onBack={() => { setPendingLockText(null); setRefinedIdeaSummary(null); setSummaryLoading(false) }}
                    loading={session.loading}
                  />
                </div>
              )}
              <DiscussInput
                onSubmit={handleDiscuss}
                loading={session.loading}
                canRevise={
                  session.phase === 'options_presented' ||
                  session.phase === 'feasibility_presented' ||
                  session.phase === 'roadmap_ready'
                }
                revisePlaceholder={
                  session.phase === 'options_presented'
                    ? 'Enter your refined idea — I\'ll re-analyse it…'
                    : undefined
                }
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
