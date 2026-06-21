from __future__ import annotations
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

# ── Shared ─────────────────────────────────────────────────────────────────────

SkillLevel = Literal["beginner", "intermediate", "advanced"]


# ── Agent 1 — Idea Analyzer ────────────────────────────────────────────────────

class IdeaAnalyzerInput(BaseModel):
    raw_idea_text: str
    skill_level: SkillLevel
    known_stack: str | None = None


class ProjectOption(BaseModel):
    title: str
    description: str
    domain: str
    estimated_complexity: Literal["low", "medium", "high"]


class VagueOutput(BaseModel):
    classification: Literal["vague"]
    options: list[ProjectOption] = Field(min_length=2, max_length=3)


class SpecificAnalysis(BaseModel):
    relevance_score: int = Field(ge=1, le=10)
    relevance_notes: str
    originality_score: int = Field(ge=1, le=10)
    originality_notes: str
    scope_verdict: Literal["well-scoped", "too-broad", "too-narrow"]
    scope_notes: str
    recommendation: Literal["proceed", "revise"]


class SpecificOutput(BaseModel):
    classification: Literal["specific"]
    analysis: SpecificAnalysis


# Discriminated union — validated by classification field
IdeaAnalyzerOutput = Annotated[
    Union[VagueOutput, SpecificOutput],
    Field(discriminator="classification"),
]


# ── Agent 2 — Feasibility & Tech Advisor ───────────────────────────────────────

class FeasibilityInput(BaseModel):
    locked_idea_text: str
    skill_level: SkillLevel
    known_stack: str | None = None
    idea_analyzer_output: IdeaAnalyzerOutput


class RecommendedStack(BaseModel):
    frontend: str
    backend: str
    database: str
    other: list[str] = []


class FeasibilityOutput(BaseModel):
    personalization_check: str
    complexity_rating: Literal["low", "medium", "high"]
    complexity_notes: str
    feasibility_verdict: Literal[
        "feasible", "feasible-with-scope-reduction", "not-feasible"
    ]
    feasibility_notes: str
    scope_suggestions: list[str]
    recommended_stack: RecommendedStack
    stack_rationale: str
    eight_week_verdict: Literal["achievable", "tight", "not-achievable"]


# ── Agent 3 — Roadmap Planner ──────────────────────────────────────────────────

class RoadmapInput(BaseModel):
    locked_idea_text: str
    skill_level: SkillLevel
    feasibility_output: FeasibilityOutput
    student_feedback: str | None = None  # populated only on revision runs


class WeekPlan(BaseModel):
    week_number: int = Field(ge=1, le=8)
    tasks: list[str] = Field(min_length=3, max_length=5)
    milestone: str


class RoadmapPhase(BaseModel):
    phase_title: str
    weeks: list[WeekPlan]


class RoadmapOutput(BaseModel):
    phases: list[RoadmapPhase]
    total_weeks: int = Field(default=8)
    critical_path_notes: str


# ── Agent 4 — Critic & Feedback Agent ──────────────────────────────────────────

class CriticInput(BaseModel):
    roadmap_output: RoadmapOutput
    recommended_stack: RecommendedStack  # needed for checklist item 3 (stack alignment)
    student_feedback: str | None = None  # only on revision runs


class ChecklistItem(BaseModel):
    item: str
    result: Literal["pass", "fail"]
    notes: str


class FeedbackAddressed(BaseModel):
    feedback_summary: str
    result: Literal["pass", "fail"]
    notes: str


class RoadmapFlag(BaseModel):
    week_number: int = Field(ge=1, le=8)
    issue: str
    suggestion: str


class MilestoneSuggestion(BaseModel):
    week_number: int = Field(ge=1, le=8)
    original_milestone: str
    suggested_milestone: str


class CriticOutput(BaseModel):
    checklist: list[ChecklistItem]
    student_feedback_addressed: FeedbackAddressed | None = None
    overall_verdict: Literal["strong", "needs-minor-revision", "needs-major-revision"]
    flags: list[RoadmapFlag]
    missing_elements: list[str]
    strengths: list[str]
    revised_milestone_suggestions: list[MilestoneSuggestion]
