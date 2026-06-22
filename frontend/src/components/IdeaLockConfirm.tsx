interface Props {
  selectedText: string
  revisedPlan?: string
  revisedPlanLoading?: boolean
  onConfirm: () => void
  onBack: () => void
  loading: boolean
}

export function IdeaLockConfirm({ selectedText, revisedPlan, revisedPlanLoading, onConfirm, onBack, loading }: Props) {
  return (
    <div className="card">
      <h2>Confirm your idea</h2>
      <p className="muted">
        Once confirmed, I'll run a personalized feasibility assessment and recommend
        a tech stack matched to your skill level.
      </p>

      <div style={{ marginTop: '1rem' }}>
        {(revisedPlan || revisedPlanLoading) ? (
          <div className="idea-preview" style={{ borderLeftColor: 'var(--success)', color: revisedPlanLoading ? 'var(--muted)' : undefined }}>
            {revisedPlanLoading ? 'Summarising your refined idea…' : revisedPlan}
          </div>
        ) : (
          <div className="idea-preview">{selectedText}</div>
        )}
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
