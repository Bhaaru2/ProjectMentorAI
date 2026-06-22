from dotenv import load_dotenv

load_dotenv()  # must run before any module reads env vars

from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
import pipeline

app = FastAPI(title="AI Project Mentor Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ─────────────────────────────────────────────────────────────

class CreateProfileRequest(BaseModel):
    auth_user_id: str
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


class ReviseStackRequest(BaseModel):
    student_note: str


class DiscussRequest(BaseModel):
    message: str
    intent: Literal["ask", "revise"]


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
    return db.create_profile(req.full_name, req.skill_level, req.known_stack, req.auth_user_id)


@app.get("/profiles/by-auth/{auth_user_id}")
def get_profile_by_auth(auth_user_id: str):
    profile = db.get_profile_by_auth_user_id(auth_user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile found for this user")
    return profile


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


@app.get("/sessions/{session_id}/conversation")
def get_conversation(session_id: str):
    return db.get_conversation_log(session_id)


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


@app.post("/sessions/{session_id}/revise-stack")
def revise_stack(session_id: str, req: ReviseStackRequest):
    """Stack-rejection path — re-runs Agent 2 with note. Gate: feasibility_presented."""
    try:
        session = db.get_session(session_id)
        stage = pipeline.get_stage_from_status(session["status"])
        db.log_message(session_id, "user", stage, "revision_request",
                       {"text": req.student_note}, intent="revise")
        output = pipeline.run_feasibility_revision(session_id, req.student_note)
        latest = db.get_latest_agent_output(session_id)
        db.log_message(session_id, "assistant", stage, "agent_output",
                       output.model_dump(),
                       intent="revise",
                       agent_output_version=latest["version"] if latest else None)
        return output.model_dump()
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.post("/sessions/{session_id}/revise")
def revise_roadmap(session_id: str, req: ReviseRequest):
    """Partial re-run — Agents 3 + 4 only with student feedback. Gate: roadmap_ready."""
    try:
        session = db.get_session(session_id)
        stage = pipeline.get_stage_from_status(session["status"])
        db.log_message(session_id, "user", stage, "revision_request",
                       {"text": req.student_feedback}, intent="revise")
        roadmap, critique = pipeline.run_revision_wave(session_id, req.student_feedback)
        latest = db.get_latest_agent_output(session_id)
        db.log_message(session_id, "assistant", stage, "agent_output",
                       {"roadmap": roadmap.model_dump(), "critique": critique.model_dump()},
                       intent="revise",
                       agent_output_version=latest["version"] if latest else None)
        return {"roadmap": roadmap.model_dump(), "critique": critique.model_dump()}
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)


@app.get("/sessions/{session_id}/intent-summary")
def get_intent_summary(session_id: str):
    """Synthesise 1-2 sentences describing what the student wants to build,
    drawn from their messages across the full discussion."""
    from agents.discuss import run_intent_summary_agent
    conversation = db.get_conversation_log(session_id)
    summary = run_intent_summary_agent(conversation)
    return {"summary": summary}


@app.post("/sessions/{session_id}/discuss")
def discuss(session_id: str, req: DiscussRequest):
    """Free-form ask or revision via conversation. Logs both turns to conversation_log."""
    try:
        return pipeline.run_discuss(session_id, req.message, req.intent)
    except pipeline.PipelineGateError as e:
        raise _gate_err(e)
    except Exception as e:
        err_str = str(e)
        if "413" in err_str or "rate_limit" in err_str or "tokens" in err_str.lower():
            raise HTTPException(
                status_code=429,
                detail="The AI service is temporarily over capacity. Please wait a moment and try again.",
            )
        raise HTTPException(
            status_code=503,
            detail=f"AI service error — please try again. ({type(e).__name__})",
        )
