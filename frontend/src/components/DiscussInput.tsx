import { useState } from 'react'

interface Props {
  onSubmit: (message: string, intent: 'ask' | 'revise') => void
  loading: boolean
  canRevise: boolean
  revisePlaceholder?: string
}

export function DiscussInput({ onSubmit, loading, canRevise, revisePlaceholder }: Props) {
  const [message, setMessage] = useState('')
  const [intent, setIntent] = useState<'ask' | 'revise'>('ask')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      onSubmit(message.trim(), intent)
      setMessage('')
    }
  }

  return (
    <div className="card">
      <div className="discuss-header">
        <h2 style={{ margin: 0 }}>{canRevise ? 'Ask or revise' : 'Ask'}</h2>
        {canRevise && (
          <div className="intent-toggle">
            <button
              type="button"
              className={intent === 'ask' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setIntent('ask')}
              disabled={loading}
            >
              Ask
            </button>
            <button
              type="button"
              className={intent === 'revise' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setIntent('revise')}
              disabled={loading}
            >
              Revise
            </button>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="form" style={{ marginTop: '1rem' }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={3}
          placeholder={
            intent === 'ask'
              ? 'Ask anything about your project plan…'
              : (revisePlaceholder ?? 'Describe what you\'d like changed…')
          }
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !message.trim()}>
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
