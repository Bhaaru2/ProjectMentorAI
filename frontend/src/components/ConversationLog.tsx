import type {
  ConversationMessage,
  IdeaAnalyzerOutput,
  FeasibilityOutput,
  RoadmapOutput,
  CriticOutput,
} from '../api/mentor'
import { OptionsDisplay } from './OptionsDisplay'
import { FeasibilityCard } from './FeasibilityCard'
import { RoadmapTimeline } from './RoadmapTimeline'
import { CritiquePanel } from './CritiquePanel'

const hasRoadmapIssues = (c: CriticOutput): boolean =>
  c.overall_verdict !== 'strong' ||
  c.flags.length > 0 ||
  c.checklist.some(item => item.result === 'fail') ||
  c.student_feedback_addressed?.result === 'fail' ||
  c.missing_elements.length > 0

interface Props {
  messages: ConversationMessage[]
  activePhase?: string
  originalIdeaText?: string
  onSelectOption?: (text: string) => void
  onReanalyze?: () => void
  pendingLockText?: string | null
  onAnalyzeIdea?: () => void
  analyzeIdeaLoading?: boolean
}

function AgentCard({ msg }: { msg: ConversationMessage }) {
  const { stage, content } = msg

  if (stage === 'idea_analysis') {
    return (
      <OptionsDisplay
        ideaOutput={content as unknown as IdeaAnalyzerOutput}
        originalIdeaText=""
        onSelectOption={() => {}}
        onReanalyze={() => {}}
        readOnly
      />
    )
  }

  if (stage === 'feasibility') {
    return (
      <FeasibilityCard
        feasibility={content as unknown as FeasibilityOutput}
        onConfirmStack={() => {}}
        onReviseStack={() => {}}
        loading={false}
        readOnly
      />
    )
  }

  if (stage === 'roadmap') {
    const { roadmap, critique } = content as unknown as {
      roadmap: RoadmapOutput
      critique: CriticOutput
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <RoadmapTimeline roadmap={roadmap} flags={critique.flags} />
        {hasRoadmapIssues(critique) ? (
          <CritiquePanel
            critique={critique}
            onSubmitRevision={() => {}}
            loading={false}
            readOnly
          />
        ) : (
          <p style={{ margin: 0, color: 'var(--success)', fontWeight: 600, fontSize: '0.875rem' }}>
            ✓ Roadmap looked strong — no issues flagged.
          </p>
        )}
      </div>
    )
  }

  // Fallback for unknown stages
  const text = (content as { text?: string; summary?: string }).text
    || (content as { text?: string; summary?: string }).summary
    || ''
  return <p style={{ margin: 0 }}>{text}</p>
}

export function ConversationLog({ messages, activePhase, originalIdeaText, onSelectOption, onReanalyze, pendingLockText, onAnalyzeIdea, analyzeIdeaLoading }: Props) {
  if (messages.length === 0) return null

  const showActions = activePhase === 'options_presented' && !!onSelectOption && !!onReanalyze

  // Find last idea_analysis message and its index
  let lastIdeaIdx = -1
  let lastIdeaClassification: string | null = null
  messages.forEach((msg, idx) => {
    if (msg.role === 'assistant' && msg.message_type === 'agent_output' && msg.stage === 'idea_analysis') {
      lastIdeaIdx = idx
      lastIdeaClassification = (msg.content as unknown as IdeaAnalyzerOutput).classification
    }
  })
  const isVague = lastIdeaClassification === 'vague'

  // The active pipeline stage currently shown as inlineCard below the conversation.
  // Skip its last agent_output here to avoid showing it twice.
  const activeStage =
    activePhase === 'feasibility_presented' || activePhase === 'stack_confirmed' ? 'feasibility'
    : activePhase === 'roadmap_ready' || activePhase === 'revising' ? 'roadmap'
    : null

  let lastActiveStageIdx = -1
  if (activeStage) {
    messages.forEach((msg, idx) => {
      if (msg.role === 'assistant' && msg.message_type === 'agent_output' && msg.stage === activeStage) {
        lastActiveStageIdx = idx
      }
    })
  }


  return (
    <div className="card">
      <h2>Discussion</h2>
      <div className="conversation-list">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user'
          const time = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })

          // Skip the last agent output of the currently-active stage — inlineCard shows it live
          if (idx === lastActiveStageIdx) return null

          // User messages and plain text replies → bubble
          if (isUser || msg.message_type !== 'agent_output') {
            const text = (msg.content as { text?: string }).text || ''
            const showAnalyseBtn =
              !isUser &&
              activePhase === 'options_presented' &&
              !!onAnalyzeIdea

            return (
              <div key={msg.id}>
                <div className={`bubble-row ${isUser ? 'bubble-row-user' : 'bubble-row-assistant'}`}>
                  <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                    <p style={{ margin: 0 }}>{text}</p>
                    <span className="bubble-time">{time}</span>
                  </div>
                </div>
                {showAnalyseBtn && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '0.5rem', paddingLeft: '0.25rem' }}>
                    <button
                      className="btn-primary"
                      onClick={onAnalyzeIdea}
                      disabled={!!analyzeIdeaLoading}
                    >
                      {analyzeIdeaLoading ? 'Analysing…' : '🔍 Analyse idea'}
                    </button>
                  </div>
                )}
              </div>
            )
          }

          // For vague ideas: last idea_analysis keeps option tiles clickable (tiles ARE the selection)
          const isLiveVagueCard =
            showActions && isVague && idx === lastIdeaIdx

          // Proceed/Change (or confirm gate) sits directly below the last specific idea analysis card
          const isLastSpecificAnalysis =
            showActions && !isVague && idx === lastIdeaIdx

          return (
            <div key={msg.id}>
              <div className="card-message">
                <div className="card-message-header">
                  <span className="muted small">
                    AI Project Mentor
                    {msg.agent_output_version != null && ` · Revision v${msg.agent_output_version}`}
                    {' · '}{time}
                  </span>
                </div>
                {isLiveVagueCard ? (
                  <OptionsDisplay
                    ideaOutput={msg.content as unknown as IdeaAnalyzerOutput}
                    originalIdeaText={originalIdeaText ?? ''}
                    onSelectOption={onSelectOption!}
                    onReanalyze={onReanalyze!}
                  />
                ) : (
                  <AgentCard msg={msg} />
                )}
              </div>

              {/* Specific output: Proceed/Change buttons (hidden while IdeaLockConfirm is shown at bottom) */}
              {isLastSpecificAnalysis && !pendingLockText && (
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button className="btn-primary" onClick={() => onSelectOption!(originalIdeaText ?? '')}>
                    Proceed with this idea
                  </button>
                  <button className="btn-secondary" onClick={onReanalyze}>
                    ← Change my idea
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
