interface Props {
  selectedText: string
  onConfirm: () => void
  onBack: () => void
  loading: boolean
}

export function IdeaLockConfirm({ selectedText, onConfirm, onBack, loading }: Props) {
  return (
    <div className="card">
      <h2>Confirm your idea</h2>
      <p className="muted">
        Once confirmed, I'll run a personalized feasibility assessment and recommend
        a tech stack matched to your skill level.
      </p>

      <div className="idea-preview">
        {selectedText}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button className="btn-primary" onClick={onConfirm} disabled={loading}>
          {loading ? 'Running feasibility analysis…' : 'Confirm this idea'}
        </button>
        <button className="btn-secondary" onClick={onBack} disabled={loading}>
          ← Change my idea
        </button>
      </div>
    </div>
  )
}
