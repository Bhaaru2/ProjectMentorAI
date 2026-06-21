import type { RoadmapOutput, RoadmapFlag } from '../api/mentor'

interface Props {
  roadmap: RoadmapOutput
  flags: RoadmapFlag[]
}

export function RoadmapTimeline({ roadmap, flags }: Props) {
  const flaggedWeeks = new Set(flags.map(f => f.week_number))

  return (
    <div className="card">
      <h2>8-week roadmap</h2>
      {roadmap.critical_path_notes && (
        <p className="muted" style={{ marginBottom: '1rem' }}>
          ⚠ {roadmap.critical_path_notes}
        </p>
      )}

      {roadmap.phases.map((phase, pi) => (
        <div key={pi} className="phase-block">
          <h3 className="phase-title">{phase.phase_title}</h3>
          {phase.weeks.map(week => (
            <div
              key={week.week_number}
              className={`week-card ${flaggedWeeks.has(week.week_number) ? 'week-flagged' : ''}`}
            >
              <div className="week-header">
                <span className="week-num">Week {week.week_number}</span>
                {flaggedWeeks.has(week.week_number) && (
                  <span className="flag-badge">⚑ Flagged</span>
                )}
              </div>
              <p className="week-milestone">🎯 {week.milestone}</p>
              <ul className="task-list">
                {week.tasks.map((task, ti) => <li key={ti}>{task}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
