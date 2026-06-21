import { useState } from 'react'
import * as mentor from '../api/mentor'
import type {
  IdeaAnalyzerOutput,
  FeasibilityOutput,
  RoadmapOutput,
  CriticOutput,
  SessionStatus,
  RoadmapPhaseRow,
} from '../api/mentor'

interface SessionState {
  sessionId: string | null
  phase: SessionStatus | 'draft'
  ideaOutput: IdeaAnalyzerOutput | null
  feasibilityOutput: FeasibilityOutput | null
  roadmapOutput: RoadmapOutput | null
  critiqueOutput: CriticOutput | null
  loading: boolean
  error: string | null
}

const INITIAL: SessionState = {
  sessionId: null,
  phase: 'draft',
  ideaOutput: null,
  feasibilityOutput: null,
  roadmapOutput: null,
  critiqueOutput: null,
  loading: false,
  error: null,
}

function buildRoadmapFromRows(rows: RoadmapPhaseRow[]): RoadmapOutput {
  const phaseMap = new Map<string, mentor.WeekPlan[]>()
  for (const row of rows) {
    if (!phaseMap.has(row.phase_title)) phaseMap.set(row.phase_title, [])
    phaseMap.get(row.phase_title)!.push({
      week_number: row.week_number,
      tasks: row.tasks,
      milestone: row.milestone,
    })
  }
  const phases: mentor.RoadmapPhase[] = []
  for (const [phase_title, weeks] of phaseMap) {
    phases.push({ phase_title, weeks: [...weeks].sort((a, b) => a.week_number - b.week_number) })
  }
  return { phases, total_weeks: rows.length, critical_path_notes: '' }
}

export function useSessionState() {
  const [state, setState] = useState<SessionState>(INITIAL)

  const patch = (updates: Partial<SessionState>) =>
    setState(s => ({ ...s, ...updates }))

  const withLoading = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    patch({ loading: true, error: null })
    try {
      const result = await fn()
      return result
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? err?.message ?? 'An unexpected error occurred.'
      patch({ loading: false, error: String(msg) })
      return undefined
    }
  }

  // ── Create session + analyze idea in one action ───────────────────────────────

  const startAndAnalyze = async (rawIdeaText: string, profileId: string) => {
    await withLoading(async () => {
      const title = rawIdeaText.slice(0, 60) + (rawIdeaText.length > 60 ? '…' : '')
      const session = await mentor.createSession(profileId, title)
      const ideaOutput = await mentor.analyzeIdea(session.id, rawIdeaText)
      patch({
        sessionId: session.id,
        phase: 'options_presented',
        ideaOutput,
        loading: false,
      })
    })
  }

  // ── Lock idea → auto-run feasibility ─────────────────────────────────────────

  const lockIdea = async (selectedIdeaText: string) => {
    await withLoading(async () => {
      await mentor.lockIdea(state.sessionId!, selectedIdeaText)
      patch({ phase: 'idea_locked' })
      const feasibilityOutput = await mentor.runFeasibility(state.sessionId!)
      patch({ feasibilityOutput, phase: 'feasibility_presented', loading: false })
    })
  }

  // ── Stack revision (rejection path) ──────────────────────────────────────────

  const reviseStack = async (studentNote: string) => {
    await withLoading(async () => {
      const feasibilityOutput = await mentor.reviseStack(state.sessionId!, studentNote)
      patch({ feasibilityOutput, phase: 'feasibility_presented', loading: false })
    })
  }

  // ── Confirm stack → auto-run roadmap wave ─────────────────────────────────────

  const confirmStack = async () => {
    await withLoading(async () => {
      await mentor.confirmStack(state.sessionId!)
      patch({ phase: 'stack_confirmed' })
      const { roadmap, critique } = await mentor.runRoadmap(state.sessionId!)
      patch({ roadmapOutput: roadmap, critiqueOutput: critique, phase: 'roadmap_ready', loading: false })
    })
  }

  // ── Roadmap revision ──────────────────────────────────────────────────────────

  const submitRevision = async (feedback: string) => {
    await withLoading(async () => {
      const { roadmap, critique } = await mentor.reviseRoadmap(state.sessionId!, feedback)
      patch({ roadmapOutput: roadmap, critiqueOutput: critique, phase: 'roadmap_ready', loading: false })
    })
  }

  // ── Load a previous session from DB ──────────────────────────────────────────

  const loadSession = async (sessionId: string) => {
    await withLoading(async () => {
      const data = await mentor.getSession(sessionId)
      const { session, latest_output: out, roadmap_phases: rows } = data

      let feasibilityOutput: FeasibilityOutput | null = null
      if (out?.feasibility && out?.tech_stack) {
        feasibilityOutput = { ...(out.feasibility as any), recommended_stack: out.tech_stack }
      }

      const roadmapOutput = rows?.length ? buildRoadmapFromRows(rows) : null

      patch({
        sessionId,
        phase: session.status,
        ideaOutput: out?.idea_analysis ?? null,
        feasibilityOutput,
        roadmapOutput,
        critiqueOutput: out?.critique ?? null,
        loading: false,
      })
    })
  }

  const resetSession = () => setState(INITIAL)

  return {
    ...state,
    startAndAnalyze,
    lockIdea,
    reviseStack,
    confirmStack,
    submitRevision,
    loadSession,
    resetSession,
  }
}
