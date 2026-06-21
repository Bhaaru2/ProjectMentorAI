from dotenv import load_dotenv

load_dotenv()  # must run before any module reads env vars

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import db
import pipeline

app = FastAPI(title="AI Project Mentor Agent", version="0.1.0")


# ── Request models ─────────────────────────────────────────────────────────────

class CreateProfileRequest(BaseModel):
    full_name: str
    skill_level: str          # beginner | intermediate | advanced
    known_stack: str | None = None


class CreateSessionRequest(BaseModel):
    profile_id: str
    title: str


class AnalyzeIdeaRequest(BaseModel):
    raw_idea_text: str


class LockIdeaRequest(BaseModel):
    selected_idea_text: str


class ReviseRequest(BaseModel):
    student_feedback: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _gate_err(e: pipeline.PipelineGateError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(e))


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Profiles ───────────────────────────────────────────────────────────────────

@app.post("/profiles", status_code=201)
def create_profile(req: CreateProfileRequest):
    return db.create_profile(req.full_name, req.skill_level, req.known_stack)


@app.get("/profiles/{profile_id}")
def get_profile(profile_id: str):
    return db.get_profile(profile_id)


@app.get("/profiles/{profile_id}/sessions")
def list_sessions(profile_id: str):
    return db.list_sessions(profile_id)


# ── Sessions ───────────────────────────────────────────────────────────────────

@app.post("/sessions", status_code=201)
def create_session(req: CreateSessionRequest):
    return db.create_session(req.profile_id, req.title)


@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    session = db.get_session(session_id)
    latest = db.get_latest_agent_output(session_id)
    result: dict = {"session": session, "latest_output": latest}
    if latest:
        result["roadmap_phases"] = db.get_roadmap_phases(latest["id"])
    return result


# ── Pipeline endpoints ─────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/analyze")
def analyze_idea(session_id: str, req: AnalyzeIdeaRequest):
    """Agent 1 — Idea Analyzer. Gate: draft (or idea-edit revision states)."""
    try:
        output = pipeline.run_idea_analysis(session_id, req.raw_idea_text)
        return output.model_dump()
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.post("/sessions/{session_id}/lock-idea")
def lock_idea(session_id: str, req: LockIdeaRequest):
    """Human approval gate. Gate: options_presented. No LLM call."""
    try:
        pipeline.lock_idea(session_id, req.selected_idea_text)
        return {"status": "idea_locked"}
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.post("/sessions/{session_id}/feasibility")
def run_feasibility(session_id: str):
    """Agent 2 — Feasibility & Tech Advisor. Gate: idea_locked."""
    try:
        output = pipeline.run_feasibility(session_id)
        return output.model_dump()
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.post("/sessions/{session_id}/confirm-stack")
def confirm_stack(session_id: str):
    """Human approval gate. Gate: feasibility_presented. No LLM call."""
    try:
        pipeline.confirm_stack(session_id)
        return {"status": "stack_confirmed"}
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.post("/sessions/{session_id}/roadmap")
def run_roadmap(session_id: str):
    """Agents 3 + 4 — Roadmap Planner + Critic wave. Gate: stack_confirmed."""
    try:
        roadmap, critique = pipeline.run_roadmap_wave(session_id)
        return {
            "roadmap": roadmap.model_dump(),
            "critique": critique.model_dump(),
        }
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.post("/sessions/{session_id}/revise")
def revise_roadmap(session_id: str, req: ReviseRequest):
    """Partial re-run — Agents 3 + 4 only with student feedback. Gate: roadmap_ready."""
    try:
        roadmap, critique = pipeline.run_revision_wave(session_id, req.student_feedback)
        return {
            "roadmap": roadmap.model_dump(),
            "critique": critique.model_dump(),
        }
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)
