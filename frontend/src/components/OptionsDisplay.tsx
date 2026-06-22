import type { IdeaAnalyzerOutput, ProjectOption } from '../api/mentor'

interface Props {
  ideaOutput: IdeaAnalyzerOutput
  originalIdeaText: string
  onSelectOption: (text: string) => void
  onReanalyze: () => void
  readOnly?: boolean
}

const COMPLEXITY_COLOR: Record<ProjectOption['estimated_complexity'], string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
}

export function OptionsDisplay({ ideaOutput, originalIdeaText, onSelectOption, onReanalyze, readOnly = false }: Props) {
  if (ideaOutput.classification === 'vague') {
    return (
      <div className="card">
        <h2>Here are some project ideas for you</h2>
        {!readOnly && (
          <p className="muted">
            Your input was open-ended, so I've generated a few tailored options.
            Click one to proceed with it.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.25rem' }}>
          {ideaOutput.options.map((opt, i) => (
            <div
              key={i}
              className="option-card"
              onClick={readOnly ? undefined : () => onSelectOption(`${opt.title}: ${opt.description}`)}
              style={readOnly ? { cursor: 'default' } : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <strong style={{ fontSize: '1rem' }}>{opt.title}</strong>
                <span
                  className="badge"
                  style={{ backgroundColor: COMPLEXITY_COLOR[opt.estimated_complexity] }}
                >
                  {opt.estimated_complexity}
                </span>
              </div>
              <p className="muted" style={{ marginTop: '0.4rem' }}>{opt.domain}</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>{opt.description}</p>
            </div>
          ))}
        </div>
        {!readOnly && (
          <button className="link-btn" style={{ marginTop: '1rem' }} onClick={onReanalyze}>
            ← Try a different idea
          </button>
        )}
      </div>
    )
  }

  // Specific
  const a = ideaOutput.analysis
  const verdictColor = a.scope_verdict === 'well-scoped' ? '#10b981' : '#f59e0b'

  return (
    <div className="card">
      <h2>Idea analysis</h2>
      {originalIdeaText && (
        <p className="muted" style={{ marginBottom: '1.25rem' }}>
          Your idea: <em>"{originalIdeaText}"</em>
        </p>
      )}

      <div style={{ marginBottom: '1.25rem' }}>
        <span className="score-num">{a.relevance_score}/10</span>
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', lineHeight: 1.55 }}>{a.relevance_notes}</p>
      </div>

      <div>
        <span className="badge" style={{ backgroundColor: verdictColor }}>
          {a.scope_verdict.replace(/-/g, ' ')}
        </span>
        <p className="muted small" style={{ marginTop: '0.4rem' }}>{a.scope_notes}</p>
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn-primary" onClick={() => onSelectOption(originalIdeaText)}>
            {a.recommendation === 'proceed' ? 'Proceed with this idea' : 'Proceed anyway'}
          </button>
          <button className="btn-secondary" onClick={onReanalyze}>
            ← Change my idea
          </button>
        </div>
      )}
    </div>
  )
}
