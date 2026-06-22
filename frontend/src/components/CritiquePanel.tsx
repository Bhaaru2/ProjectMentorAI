import { useState } from 'react'
import type { CriticOutput } from '../api/mentor'

interface Props {
  critique: CriticOutput
  onSubmitRevision: (feedback: string) => void
  loading: boolean
  readOnly?: boolean
}

const VERDICT_STYLE: Record<CriticOutput['overall_verdict'], { bg: string; label: string }> = {
  strong: { bg: '#10b981', label: 'Strong' },
  'needs-minor-revision': { bg: '#f59e0b', label: 'Needs minor revision' },
  'needs-major-revision': { bg: '#ef4444', label: 'Needs major revision' },
}

export function CritiquePanel({ critique: c, onSubmitRevision, loading, readOnly = false }: Props) {
  const [feedback, setFeedback] = useState('')
  const vs = VERDICT_STYLE[c.overall_verdict]

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (feedback.trim()) {
      onSubmitRevision(feedback.trim())
      setFeedback('')
    }
  }

  const isRevisionResult = !!c.student_feedback_addressed
  const failedChecks = c.checklist.filter(item => item.result === 'fail')

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Critic review</h2>
        <span className="badge" style={{ backgroundColor: vs.bg }}>{vs.label}</span>
      </div>

      {/* Revision run: show feedback addressed FIRST, then only issues */}
      {isRevisionResult && (
        <div style={{ marginBottom: '1.25rem' }}>
          <strong>Your feedback</strong>
          <div
            className={`checklist-item ${c.student_feedback_addressed!.result === 'fail' ? 'checklist-fail' : 'checklist-pass'}`}
            style={{ marginTop: '0.5rem' }}
          >
            <span className="check-icon">{c.student_feedback_addressed!.result === 'pass' ? '✓' : '✗'}</span>
            <div>
              <p style={{ margin: 0 }}>{c.student_feedback_addressed!.feedback_summary}</p>
              <p className="muted small" style={{ margin: '0.2rem 0 0' }}>{c.student_feedback_addressed!.notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* First run: full checklist. Revision run: only failed items */}
      {(!isRevisionResult || failedChecks.length > 0) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <strong>{isRevisionResult ? 'Remaining issues' : 'Checklist'}</strong>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(isRevisionResult ? failedChecks : c.checklist).map((item, i) => (
              <div key={i} className={`checklist-item ${item.result === 'fail' ? 'checklist-fail' : 'checklist-pass'}`}>
                <span className="check-icon">{item.result === 'pass' ? '✓' : '✗'}</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>{item.item}</p>
                  <p className="muted small" style={{ margin: '0.2rem 0 0' }}>{item.notes}</p>
                </div>
              </div>
            ))}
            {isRevisionResult && failedChecks.length === 0 && (
              <p className="muted small">All checklist items pass.</p>
            )}
          </div>
        </div>
      )}

      {c.flags.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <strong>Flags</strong>
          {c.flags.map((f, i) => (
            <div key={i} className="flag-item">
              <p style={{ margin: 0 }}><strong>Week {f.week_number}:</strong> {f.issue}</p>
              <p className="muted small" style={{ margin: '0.2rem 0 0' }}>→ {f.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {/* Strengths only on first run — student already knows the plan's strengths */}
      {!isRevisionResult && c.strengths.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <strong>Strengths</strong>
          <ul className="bullet-list">
            {c.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {!isRevisionResult && c.missing_elements.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <strong>Missing elements</strong>
          <ul className="bullet-list">
            {c.missing_elements.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {!readOnly && (
        <form onSubmit={submit} className="form" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
          <label>
            Request a revision
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
              placeholder="Describe what you'd like changed — e.g. 'Week 1 tasks are too vague' or 'Add more time for testing'"
              disabled={loading}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={loading || !feedback.trim()}>
            {loading ? 'Revising roadmap…' : 'Submit revision'}
          </button>
        </form>
      )}
    </div>
  )
}
