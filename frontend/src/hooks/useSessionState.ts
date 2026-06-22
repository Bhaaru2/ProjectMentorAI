import { useState } from 'react'
import * as mentor from '../api/mentor'
import type {
  IdeaAnalyzerOutput,
  FeasibilityOutput,
  RoadmapOutput,
  CriticOutput,
  SessionStatus,
  RoadmapPhaseRow,
  ConversationMessage,
} from '../api/mentor'

interface SessionState {
  sessionId: string | null
  phase: SessionStatus | 'draft'
  ideaOutput: IdeaAnalyzerOutput | null
  feasibilityOutput: FeasibilityOutput | null
  roadmapOutput: RoadmapOutput | null
  critiqueOutput: CriticOutput | null
  conversationLog: ConversationMessage[]
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
  conversationLog: [],
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
      const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')
      const msg = isTimeout
        ? 'The AI took too long to respond. Please try again.'
        : (err?.response?.data?.detail ?? err?.message ?? 'An unexpected error occurred.')
      patch({ error: String(msg) })
      return undefined
    } finally {
      // Always reset loading, whether fn succeeded, threw, or forgot to reset itself
      patch({ loading: false })
    }
  }

  // ── Create session + analyze idea in one action ───────────────────────────────

  const startAndAnalyze = async (rawIdeaText: string, profileId: string) => {
    await withLoading(async () => {
      const title = rawIdeaText.slice(0, 60) + (rawIdeaText.length > 60 ? '…' : '')
      const session = await mentor.createSession(profileId, title)
      const ideaOutput = await mentor.analyzeIdea(session.id, rawIdeaText)
      const log = await mentor.getConversationLog(session.id)
      patch({
        sessionId: session.id,
        phase: 'options_presented',
        ideaOutput,
        conversationLog: log,
      })
    })
  }

  // ── Re-analyze idea on the existing session (revision path from options_presented) ──

  const reanalyzeIdea = async (refinedText: string) => {
    await withLoading(async () => {
      const ideaOutput = await mentor.analyzeIdea(state.sessionId!, refinedText)
      const log = await mentor.getConversationLog(state.sessionId!)
      patch({ ideaOutput, phase: 'options_presented', conversationLog: log })
    })
  }

  // ── Lock idea → auto-run feasibility ─────────────────────────────────────────

  const lockIdea = async (selectedIdeaText: string) => {
    await withLoading(async () => {
      await mentor.lockIdea(state.sessionId!, selectedIdeaText)
      patch({ phase: 'idea_locked' })
      const feasibilityOutput = await mentor.runFeasibility(state.sessionId!)
      patch({ feasibilityOutput, phase: 'feasibility_presented' })
    })
  }

  // ── Stack revision (rejection path) ──────────────────────────────────────────

  const reviseStack = async (studentNote: string) => {
    await withLoading(async () => {
      const feasibilityOutput = await mentor.reviseStack(state.sessionId!, studentNote)
      const log = await mentor.getConversationLog(state.sessionId!)
      patch({ feasibilityOutput, phase: 'feasibility_presented', conversationLog: log })
    })
  }

  // ── Confirm stack → auto-run roadmap wave ─────────────────────────────────────

  const confirmStack = async () => {
    await withLoading(async () => {
      await mentor.confirmStack(state.sessionId!)
      patch({ phase: 'stack_confirmed' })
      const { roadmap, critique } = await mentor.runRoadmap(state.sessionId!)
      patch({ roadmapOutput: roadmap, critiqueOutput: critique, phase: 'roadmap_ready' })
    })
  }

  // ── Roadmap revision ──────────────────────────────────────────────────────────

  const submitRevision = async (feedback: string) => {
    await withLoading(async () => {
      const { roadmap, critique } = await mentor.reviseRoadmap(state.sessionId!, feedback)
      const log = await mentor.getConversationLog(state.sessionId!)
      patch({ roadmapOutput: roadmap, critiqueOutput: critique, phase: 'roadmap_ready', conversationLog: log })
    })
  }

  // ── Free-form discussion / revision via /discuss ──────────────────────────────

  const discuss = async (message: string, intent: 'ask' | 'revise') => {
    await withLoading(async () => {
      const response = await mentor.discuss(state.sessionId!, message, intent)

      const updates: Partial<SessionState> = {}

      if (response.type === 'revision') {
        const scope = response.scope

        if (scope === 'feasibility') {
          // Re-ran Feasibility — reset roadmap (stale)
          updates.feasibilityOutput = response.content as FeasibilityOutput
          updates.phase = 'feasibility_presented'
          updates.roadmapOutput = null
          updates.critiqueOutput = null

        } else {
          // scope === 'roadmap' or legacy response without scope
          const content = response.content as Record<string, unknown>
          if ('roadmap' in content) {
            updates.roadmapOutput = content.roadmap as RoadmapOutput
            updates.critiqueOutput = content.critique as CriticOutput
          }
        }
      }

      const log = await mentor.getConversationLog(state.sessionId!)
      patch({ ...updates, conversationLog: log })
    })
  }

  // ── Load a previous session from DB ──────────────────────────────────────────

  const loadSession = async (sessionId: string) => {
    await withLoading(async () => {
      const [data, log] = await Promise.all([
        mentor.getSession(sessionId),
        mentor.getConversationLog(sessionId),
      ])
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
        conversationLog: log,
      })
    })
  }

  const resetSession = () => setState(INITIAL)

  return {
    ...state,
    startAndAnalyze,
    reanalyzeIdea,
    lockIdea,
    reviseStack,
    confirmStack,
    submitRevision,
    discuss,
    loadSession,
    resetSession,
  }
}
