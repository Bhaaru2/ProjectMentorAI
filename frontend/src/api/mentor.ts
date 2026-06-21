import { api } from './client'

// ── Shared types ───────────────────────────────────────────────────────────────

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced'
export type SessionStatus =
  | 'draft'
  | 'options_presented'
  | 'idea_locked'
  | 'feasibility_presented'
  | 'stack_confirmed'
  | 'roadmap_ready'
  | 'revising'

// ── Profile ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  auth_user_id: string
  full_name: string
  skill_level: SkillLevel
  known_stack: string | null
  created_at: string
}

// ── Idea Analyzer ──────────────────────────────────────────────────────────────

export interface ProjectOption {
  title: string
  description: string
  domain: string
  estimated_complexity: 'low' | 'medium' | 'high'
}

export interface SpecificAnalysis {
  relevance_score: number
  relevance_notes: string
  originality_score: number
  originality_notes: string
  scope_verdict: 'well-scoped' | 'too-broad' | 'too-narrow'
  scope_notes: string
  recommendation: 'proceed' | 'revise'
}

export interface VagueOutput {
  classification: 'vague'
  options: ProjectOption[]
}

export interface SpecificOutput {
  classification: 'specific'
  analysis: SpecificAnalysis
}

export type IdeaAnalyzerOutput = VagueOutput | SpecificOutput

// ── Feasibility ────────────────────────────────────────────────────────────────

export interface RecommendedStack {
  frontend: string
  backend: string
  database: string
  other: string[]
}

export interface FeasibilityOutput {
  personalization_check: string
  complexity_rating: 'low' | 'medium' | 'high'
  complexity_notes: string
  feasibility_verdict: 'feasible' | 'feasible-with-scope-reduction' | 'not-feasible'
  feasibility_notes: string
  scope_suggestions: string[]
  recommended_stack: RecommendedStack
  stack_rationale: string
  eight_week_verdict: 'achievable' | 'tight' | 'not-achievable'
}

// ── Roadmap ────────────────────────────────────────────────────────────────────

export interface WeekPlan {
  week_number: number
  tasks: string[]
  milestone: string
}

export interface RoadmapPhase {
  phase_title: string
  weeks: WeekPlan[]
}

export interface RoadmapOutput {
  phases: RoadmapPhase[]
  total_weeks: number
  critical_path_notes: string
}

// ── Critic ─────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  item: string
  result: 'pass' | 'fail'
  notes: string
}

export interface FeedbackAddressed {
  feedback_summary: string
  result: 'pass' | 'fail'
  notes: string
}

export interface RoadmapFlag {
  week_number: number
  issue: string
  suggestion: string
}

export interface MilestoneSuggestion {
  week_number: number
  original_milestone: string
  suggested_milestone: string
}

export interface CriticOutput {
  checklist: ChecklistItem[]
  student_feedback_addressed: FeedbackAddressed | null
  overall_verdict: 'strong' | 'needs-minor-revision' | 'needs-major-revision'
  flags: RoadmapFlag[]
  missing_elements: string[]
  strengths: string[]
  revised_milestone_suggestions: MilestoneSuggestion[]
}

// ── Session ────────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  profile_id: string
  title: string
  status: SessionStatus
  created_at: string
  updated_at: string
}

export interface RoadmapPhaseRow {
  id: string
  agent_output_id: string
  week_number: number
  phase_title: string
  tasks: string[]
  milestone: string
}

export interface AgentOutputRow {
  id: string
  session_id: string
  idea_analysis: IdeaAnalyzerOutput | null
  feasibility: Omit<FeasibilityOutput, 'recommended_stack'> | null
  tech_stack: RecommendedStack | null
  critique: CriticOutput | null
  version: number
  created_at: string
}

export interface SessionDetail {
  session: Session
  latest_output: AgentOutputRow | null
  roadmap_phases: RoadmapPhaseRow[]
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getProfileByAuth(authUserId: string): Promise<Profile | null> {
  try {
    const res = await api.get<Profile>(`/profiles/by-auth/${authUserId}`)
    return res.data
  } catch (err: any) {
    if (err.response?.status === 404) return null
    throw err
  }
}

export async function createProfile(data: {
  auth_user_id: string
  full_name: string
  skill_level: SkillLevel
  known_stack?: string
}): Promise<Profile> {
  const res = await api.post<Profile>('/profiles', data)
  return res.data
}

export async function createSession(profileId: string, title: string): Promise<Session> {
  const res = await api.post<Session>('/sessions', { profile_id: profileId, title })
  return res.data
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const res = await api.get<SessionDetail>(`/sessions/${sessionId}`)
  return res.data
}

export async function listSessions(profileId: string): Promise<Session[]> {
  const res = await api.get<Session[]>(`/profiles/${profileId}/sessions`)
  return res.data
}

export async function analyzeIdea(
  sessionId: string,
  rawIdeaText: string,
): Promise<IdeaAnalyzerOutput> {
  const res = await api.post<IdeaAnalyzerOutput>(`/sessions/${sessionId}/analyze`, {
    raw_idea_text: rawIdeaText,
  })
  return res.data
}

export async function lockIdea(sessionId: string, selectedIdeaText: string): Promise<void> {
  await api.post(`/sessions/${sessionId}/lock-idea`, { selected_idea_text: selectedIdeaText })
}

export async function runFeasibility(sessionId: string): Promise<FeasibilityOutput> {
  const res = await api.post<FeasibilityOutput>(`/sessions/${sessionId}/feasibility`)
  return res.data
}

export async function reviseStack(
  sessionId: string,
  studentNote: string,
): Promise<FeasibilityOutput> {
  const res = await api.post<FeasibilityOutput>(`/sessions/${sessionId}/revise-stack`, {
    student_note: studentNote,
  })
  return res.data
}

export async function confirmStack(sessionId: string): Promise<void> {
  await api.post(`/sessions/${sessionId}/confirm-stack`)
}

export async function runRoadmap(
  sessionId: string,
): Promise<{ roadmap: RoadmapOutput; critique: CriticOutput }> {
  const res = await api.post<{ roadmap: RoadmapOutput; critique: CriticOutput }>(
    `/sessions/${sessionId}/roadmap`,
  )
  return res.data
}

export async function reviseRoadmap(
  sessionId: string,
  studentFeedback: string,
): Promise<{ roadmap: RoadmapOutput; critique: CriticOutput }> {
  const res = await api.post<{ roadmap: RoadmapOutput; critique: CriticOutput }>(
    `/sessions/${sessionId}/revise`,
    { student_feedback: studentFeedback },
  )
  return res.data
}

// ── Conversation ───────────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  stage: string
  message_type: string
  content: { text?: string; summary?: string; [key: string]: unknown }
  intent: 'ask' | 'revise' | null
  agent_output_version: number | null
  created_at: string
}

export interface DiscussResponse {
  type: 'reply' | 'revision'
  content: unknown
  version: number | null
}

export async function getConversationLog(sessionId: string): Promise<ConversationMessage[]> {
  const res = await api.get<ConversationMessage[]>(`/sessions/${sessionId}/conversation`)
  return res.data
}

export async function discuss(
  sessionId: string,
  message: string,
  intent: 'ask' | 'revise',
): Promise<DiscussResponse> {
  const res = await api.post<DiscussResponse>(`/sessions/${sessionId}/discuss`, { message, intent })
  return res.data
}
