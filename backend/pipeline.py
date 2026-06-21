"""
Orchestration controller for the AI Project Mentor pipeline.

Chains the four agent functions with explicit gate validation, versioned DB writes,
and partial re-run (wave) routing. This is the single authority on pipeline state
transitions — agents produce content, this controller decides when and whether they run.

Per SUBAGENT_PATTERN_NOTES.md design patterns applied here:
  - Human approval gates: lock_idea() and confirm_stack() are explicit no-LLM steps
    that the student must trigger; the Roadmap Planner cannot run until confirm_stack().
  - Atomic versioned outputs: every revision creates a new agent_outputs row (never
    overwrites); fields from unchanged agents are copied forward.
  - Wave-based partial re-runs: run_revision_wave() re-runs only Roadmap Planner +
    Critic, treating them as an atomic wave, without touching idea_analysis or feasibility.
  - Session-state-as-resume-point: each function reads sessions.status from the DB
    to determine where the pipeline is; no in-memory state is assumed.

IMPORTANT: Do not regenerate this file from agent calls. Edit it directly only when
pipeline routing rules change.
"""

from pydantic import TypeAdapter

import db
import schemas
from agents.idea_analyzer import run_idea_analyzer
from agents.feasibility_advisor import run_feasibility_advisor
from agents.roadmap_planner import run_roadmap_planner
from agents.critic import run_critic

_idea_adapter = TypeAdapter(schemas.IdeaAnalyzerOutput)


class PipelineGateError(Exception):
    """Session is not in the required status for the requested pipeline step."""


def _gate(session: dict, *allowed: str) -> None:
    if session["status"] not in allowed:
        raise PipelineGateError(
            f"Cannot run this step: session is '{session['status']}', "
            f"expected one of {list(allowed)}."
        )


def _load_feasibility(latest: dict) -> schemas.FeasibilityOutput:
    """Reconstruct FeasibilityOutput from the two separate jsonb columns."""
    return schemas.FeasibilityOutput.model_validate({
        **latest["feasibility"],
        "recommended_stack": latest["tech_stack"],
    })


# ── Step 1: Idea Analysis ──────────────────────────────────────────────────────

def run_idea_analysis(session_id: str, raw_idea_text: str) -> schemas.IdeaAnalyzerOutput:
    """
    Gate: draft (initial run) | idea_locked / roadmap_ready / revising (idea-edit revision).

    Runs Agent 1. Saves the raw idea text and creates a new versioned agent_outputs
    row with idea_analysis populated. Advances session to options_presented.
    """
    session = db.get_session(session_id)
    _gate(session, "draft", "idea_locked", "roadmap_ready", "revising")

    profile = db.get_profile(session["profile_id"])
    output = run_idea_analyzer(schemas.IdeaAnalyzerInput(
        raw_idea_text=raw_idea_text,
        skill_level=profile["skill_level"],
        known_stack=profile.get("known_stack"),
    ))

    db.save_project_idea(session_id, raw_idea_text)
    version = db.get_next_version(session_id)
    db.create_agent_output_row(session_id, version, output.model_dump())
    db.update_session_status(session_id, "options_presented")
    return output


# ── Step 2: Lock Idea — human approval gate, no LLM call ──────────────────────

def lock_idea(session_id: str, selected_idea_text: str) -> None:
    """
    Gate: options_presented.

    Records the student's confirmed idea selection. No LLM call — this is the
    explicit human approval gate before feasibility analysis is allowed to run.
    For vague input: selected_idea_text is whichever generated option the student chose.
    For specific input: selected_idea_text is the student's confirmed original idea.
    """
    session = db.get_session(session_id)
    _gate(session, "options_presented")

    db.save_project_idea(session_id, selected_idea_text)
    db.update_session_status(session_id, "idea_locked")


# ── Step 3: Feasibility Analysis ───────────────────────────────────────────────

def run_feasibility(session_id: str) -> schemas.FeasibilityOutput:
    """
    Gate: idea_locked.

    Runs Agent 2. Updates the current agent_outputs row with feasibility and
    tech_stack fields. Advances session to feasibility_presented.
    """
    session = db.get_session(session_id)
    _gate(session, "idea_locked")

    profile = db.get_profile(session["profile_id"])
    locked_idea = db.get_locked_idea(session_id)

    latest = db.get_latest_agent_output(session_id)
    if not latest or not latest.get("idea_analysis"):
        raise PipelineGateError("No idea analysis found. Run /analyze first.")

    idea_output = _idea_adapter.validate_python(latest["idea_analysis"])

    output = run_feasibility_advisor(schemas.FeasibilityInput(
        locked_idea_text=locked_idea,
        skill_level=profile["skill_level"],
        known_stack=profile.get("known_stack"),
        idea_analyzer_output=idea_output,
    ))

    # Store feasibility fields and recommended_stack separately (per schema design).
    # tech_stack is split out so the frontend can display the stack card independently.
    db.update_agent_output_feasibility(
        output_id=latest["id"],
        feasibility=output.model_dump(exclude={"recommended_stack"}),
        tech_stack=output.recommended_stack.model_dump(),
    )
    db.update_session_status(session_id, "feasibility_presented")
    return output


# ── Step 3b: Feasibility Revision — stack-rejection path ──────────────────────

def run_feasibility_revision(session_id: str, student_note: str) -> schemas.FeasibilityOutput:
    """
    Gate: feasibility_presented (before confirm_stack — no roadmap exists yet).

    Stack-rejection path: re-runs Agent 2 with the student's note as added context.
    Creates a new versioned agent_outputs row (copies idea_analysis forward, preserves v1
    feasibility row unchanged). Resets to feasibility_presented so the student must
    explicitly confirm the revised stack before the Roadmap Planner is allowed to run.
    """
    session = db.get_session(session_id)
    _gate(session, "feasibility_presented")

    profile = db.get_profile(session["profile_id"])
    locked_idea = db.get_locked_idea(session_id)

    latest = db.get_latest_agent_output(session_id)
    if not latest or not latest.get("idea_analysis"):
        raise PipelineGateError("No idea analysis found. Run /analyze first.")

    idea_output = _idea_adapter.validate_python(latest["idea_analysis"])

    output = run_feasibility_advisor(schemas.FeasibilityInput(
        locked_idea_text=locked_idea,
        skill_level=profile["skill_level"],
        known_stack=profile.get("known_stack"),
        idea_analyzer_output=idea_output,
        student_note=student_note,
    ))

    version = db.get_next_version(session_id)
    new_row = db.create_agent_output_row(session_id, version, latest["idea_analysis"])
    db.update_agent_output_feasibility(
        output_id=new_row["id"],
        feasibility=output.model_dump(exclude={"recommended_stack"}),
        tech_stack=output.recommended_stack.model_dump(),
    )
    db.update_session_status(session_id, "feasibility_presented")
    return output


# ── Step 4: Confirm Stack — human approval gate, no LLM call ──────────────────

def confirm_stack(session_id: str) -> None:
    """
    Gate: feasibility_presented.

    Explicit student UI action that unlocks the Roadmap Planner.
    Must only be called via the /confirm-stack endpoint — never inferred from
    chat text or auto-triggered by any agent.
    """
    session = db.get_session(session_id)
    _gate(session, "feasibility_presented")
    db.update_session_status(session_id, "stack_confirmed")


# ── Step 5: Roadmap Wave — Agents 3 + 4 run as an atomic unit ─────────────────

def run_roadmap_wave(
    session_id: str,
    student_feedback: str | None = None,
) -> tuple[schemas.RoadmapOutput, schemas.CriticOutput]:
    """
    Gate: stack_confirmed (initial run) | revising (revision run).

    Runs Agent 3 (Roadmap Planner) then Agent 4 (Critic) as an atomic wave —
    both succeed or neither result is persisted. On a revision run, creates a new
    versioned agent_outputs row copying idea_analysis + feasibility/tech_stack from
    the previous version; only the roadmap phases and critique are new.

    Caller is responsible for setting status to 'revising' before calling this on
    a revision, and for recording the feedback_revisions row after it returns.
    """
    session = db.get_session(session_id)
    _gate(session, "stack_confirmed", "revising")

    profile = db.get_profile(session["profile_id"])
    locked_idea = db.get_locked_idea(session_id)

    latest = db.get_latest_agent_output(session_id)
    if not latest or not latest.get("feasibility"):
        raise PipelineGateError("No feasibility output found. Complete /feasibility first.")

    feasibility_output = _load_feasibility(latest)

    roadmap_output = run_roadmap_planner(schemas.RoadmapInput(
        locked_idea_text=locked_idea,
        skill_level=profile["skill_level"],
        feasibility_output=feasibility_output,
        student_feedback=student_feedback,
    ))

    critic_output = run_critic(schemas.CriticInput(
        roadmap_output=roadmap_output,
        recommended_stack=feasibility_output.recommended_stack,
        student_feedback=student_feedback,
    ))

    # Revision: new versioned row copying unchanged fields forward.
    # Initial run: update the existing row in place (feasibility already populated it).
    is_revision = session["status"] == "revising"
    if is_revision:
        version = db.get_next_version(session_id)
        new_row = db.create_agent_output_row(session_id, version, latest["idea_analysis"])
        db.update_agent_output_feasibility(
            output_id=new_row["id"],
            feasibility=latest["feasibility"],
            tech_stack=latest["tech_stack"],
        )
        output_id = new_row["id"]
    else:
        output_id = latest["id"]

    db.update_agent_output_critique(output_id, critic_output.model_dump())
    db.save_roadmap_phases(output_id, [p.model_dump() for p in roadmap_output.phases])
    db.update_session_status(session_id, "roadmap_ready")
    return roadmap_output, critic_output


# ── Step 6: Revision Wave — partial re-run of Agents 3 + 4 only ───────────────

def run_revision_wave(
    session_id: str,
    student_feedback: str,
) -> tuple[schemas.RoadmapOutput, schemas.CriticOutput]:
    """
    Gate: roadmap_ready.

    Convenience entry point for roadmap revisions. Sets status to 'revising',
    delegates to run_roadmap_wave() with feedback, then records the
    feedback_revisions row. Agents 1 and 2 are not re-run.
    """
    session = db.get_session(session_id)
    _gate(session, "roadmap_ready")

    db.update_session_status(session_id, "revising")
    roadmap_output, critic_output = run_roadmap_wave(session_id, student_feedback=student_feedback)

    latest = db.get_latest_agent_output(session_id)
    revision_number = db.get_revision_count(session_id) + 1
    db.save_feedback_revision(
        session_id=session_id,
        revision_number=revision_number,
        student_feedback=student_feedback,
        resulting_output_id=latest["id"],
    )
    return roadmap_output, critic_output
