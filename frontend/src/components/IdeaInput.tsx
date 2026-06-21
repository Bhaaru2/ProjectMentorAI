import { useState } from 'react'

interface Props {
  onSubmit: (ideaText: string) => void
  loading: boolean
}

export function IdeaInput({ onSubmit, loading }: Props) {
  const [text, setText] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) onSubmit(text.trim())
  }

  return (
    <div className="card">
      <h2>What's your project idea?</h2>
      <p className="muted">
        Tell me what you have in mind — specific or vague, anything works.
        I'll analyze it and help you shape it into an 8-week MCA project plan.
      </p>

      <form onSubmit={submit} className="form" style={{ marginTop: '1.25rem' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="e.g. 'I want to build a chatbot for student queries' or 'something with AI'"
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !text.trim()}>
          {loading ? 'Analyzing…' : 'Analyze idea'}
        </button>
      </form>
    </div>
  )
}
