import { useState } from 'react'
import type { FeasibilityOutput } from '../api/mentor'

interface Props {
  feasibility: FeasibilityOutput
  onConfirmStack: () => void
  onReviseStack: (note: string) => void
  loading: boolean
  readOnly?: boolean
}

const VERDICT_COLOR: Record<FeasibilityOutput['feasibility_verdict'], string> = {
  feasible: '#10b981',
  'feasible-with-scope-reduction': '#f59e0b',
  'not-feasible': '#ef4444',
}

const WEEK_COLOR: Record<FeasibilityOutput['eight_week_verdict'], string> = {
  achievable: '#10b981',
  tight: '#f59e0b',
  'not-achievable': '#ef4444',
}

export function FeasibilityCard({ feasibility: f, onConfirmStack, onReviseStack, loading, readOnly = false }: Props) {
  const [revising, setRevising] = useState(false)
  const [note, setNote] = useState('')

  const submitRevision = (e: React.FormEvent) => {
    e.preventDefault()
    if (note.trim()) {
      onReviseStack(note.trim())
      setRevising(false)
      setNote('')
    }
  }

  return (
    <div className="card">
      <h2>Feasibility assessment</h2>
      <p className="muted">{f.personalization_check}</p>

      <div className="badge-row" style={{ marginTop: '1rem' }}>
        <span className="badge" style={{ backgroundColor: VERDICT_COLOR[f.feasibility_verdict] }}>
          {f.feasibility_verdict.replace(/-/g, ' ')}
        </span>
        <span className="badge" style={{ backgroundColor: WEEK_COLOR[f.eight_week_verdict] }}>
          8 weeks: {f.eight_week_verdict}
        </span>
        <span className="badge badge-neutral">complexity: {f.complexity_rating}</span>
      </div>

      <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>{f.feasibility_notes}</p>

      {f.scope_suggestions.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <strong>Scope suggestions</strong>
          <ul className="bullet-list">
            {f.scope_suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <div className="stack-box">
        <strong>Recommended stack</strong>
        <div className="stack-grid">
          <span className="stack-label">Frontend</span><span>{f.recommended_stack.frontend}</span>
          <span className="stack-label">Backend</span><span>{f.recommended_stack.backend}</span>
          <span className="stack-label">Database</span><span>{f.recommended_stack.database}</span>
          {f.recommended_stack.other.length > 0 && (
            <>
              <span className="stack-label">Other</span>
              <span>{f.recommended_stack.other.join(', ')}</span>
            </>
          )}
        </div>
        <p className="muted small" style={{ marginTop: '0.5rem' }}>{f.stack_rationale}</p>
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn-primary" onClick={onConfirmStack} disabled={loading}>
            {loading ? 'Building roadmap…' : 'Confirm this stack'}
          </button>
          {/* <button className="btn-secondary" onClick={() => setRevising(true)} disabled={loading}>
            Revise stack / scope
          </button> */}
        </div>
      )}
    </div>
  )
}
