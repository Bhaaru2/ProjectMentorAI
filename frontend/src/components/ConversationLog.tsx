import type { ConversationMessage } from '../api/mentor'

interface Props {
  messages: ConversationMessage[]
}

export function ConversationLog({ messages }: Props) {
  if (messages.length === 0) return null

  return (
    <div className="card">
      <h2>Discussion</h2>
      <div className="conversation-list">
        {messages.map(msg => {
          const isUser = msg.role === 'user'
          const text = msg.content.text || msg.content.summary || ''
          const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

          return (
            <div key={msg.id} className={`bubble-row ${isUser ? 'bubble-row-user' : 'bubble-row-assistant'}`}>
              <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                {msg.message_type === 'agent_output' && (
                  <span className="revision-label">
                    Revision v{msg.agent_output_version}
                  </span>
                )}
                <p style={{ margin: 0 }}>{text}</p>
                <span className="bubble-time">{time}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
