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

interface Props {
  messages: ConversationMessage[]
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
        <CritiquePanel
          critique={critique}
          onSubmitRevision={() => {}}
          loading={false}
          readOnly
        />
      </div>
    )
  }

  // Fallback for unknown stages
  const text = (content as { text?: string; summary?: string }).text
    || (content as { text?: string; summary?: string }).summary
    || ''
  return <p style={{ margin: 0 }}>{text}</p>
}

export function ConversationLog({ messages }: Props) {
  if (messages.length === 0) return null

  return (
    <div className="card">
      <h2>Discussion</h2>
      <div className="conversation-list">
        {messages.map(msg => {
          const isUser = msg.role === 'user'
          const time = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })

          // User messages and plain text replies → bubble
          if (isUser || msg.message_type !== 'agent_output') {
            const text = (msg.content as { text?: string }).text || ''
            return (
              <div key={msg.id} className={`bubble-row ${isUser ? 'bubble-row-user' : 'bubble-row-assistant'}`}>
                <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                  <p style={{ margin: 0 }}>{text}</p>
                  <span className="bubble-time">{time}</span>
                </div>
              </div>
            )
          }

          // Agent output → dispatch to real card components, read-only
          return (
            <div key={msg.id} className="card-message">
              <div className="card-message-header">
                <span className="muted small">
                  AI Project Mentor
                  {msg.agent_output_version != null && ` · Revision v${msg.agent_output_version}`}
                  {' · '}{time}
                </span>
              </div>
              <AgentCard msg={msg} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
