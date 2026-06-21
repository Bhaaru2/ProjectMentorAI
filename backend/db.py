import os
from datetime import datetime, timezone
from supabase import create_client, Client

_client: Client | None = None


def get_db() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


# ── Auth helpers (service-role only) ──────────────────────────────────────────

def create_test_auth_user(email: str) -> str:
    """Creates a Supabase auth user and returns its UUID. For headless tests only."""
    response = get_db().auth.admin.create_user({"email": email, "email_confirm": True})
    return response.user.id


def delete_test_auth_user(auth_user_id: str) -> None:
    """Deletes a Supabase auth user by UUID. For headless test cleanup only."""
    get_db().auth.admin.delete_user(auth_user_id)


# ── Profiles ───────────────────────────────────────────────────────────────────

def create_profile(
    full_name: str,
    skill_level: str,
    known_stack: str | None = None,
    auth_user_id: str | None = None,
) -> dict:
    r = get_db().table("profiles").insert({
        "auth_user_id": auth_user_id,
        "full_name": full_name,
        "skill_level": skill_level,
        "known_stack": known_stack,
    }).execute()
    return r.data[0]


def get_profile(profile_id: str) -> dict:
    r = get_db().table("profiles").select("*").eq("id", profile_id).single().execute()
    return r.data


# ── Sessions ───────────────────────────────────────────────────────────────────

def create_session(profile_id: str, title: str) -> dict:
    r = get_db().table("sessions").insert({
        "profile_id": profile_id,
        "title": title,
        "status": "draft",
    }).execute()
    return r.data[0]


def get_session(session_id: str) -> dict:
    r = get_db().table("sessions").select("*").eq("id", session_id).single().execute()
    return r.data


def update_session_status(session_id: str, status: str) -> None:
    get_db().table("sessions").update({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", session_id).execute()


def list_sessions(profile_id: str) -> list[dict]:
    r = (get_db().table("sessions")
         .select("*")
         .eq("profile_id", profile_id)
         .order("created_at", desc=True)
         .execute())
    return r.data


# ── Project Ideas ──────────────────────────────────────────────────────────────

def save_project_idea(session_id: str, raw_idea_text: str) -> dict:
    r = get_db().table("project_ideas").insert({
        "session_id": session_id,
        "raw_idea_text": raw_idea_text,
    }).execute()
    return r.data[0]


def get_locked_idea(session_id: str) -> str:
    """Returns the most recently saved idea text for this session."""
    r = (get_db().table("project_ideas")
         .select("raw_idea_text")
         .eq("session_id", session_id)
         .order("created_at", desc=True)
         .limit(1)
         .execute())
    if not r.data:
        raise ValueError(f"No idea found for session {session_id}")
    return r.data[0]["raw_idea_text"]


# ── Agent Outputs ──────────────────────────────────────────────────────────────

def get_next_version(session_id: str) -> int:
    r = (get_db().table("agent_outputs")
         .select("version")
         .eq("session_id", session_id)
         .order("version", desc=True)
         .limit(1)
         .execute())
    return (r.data[0]["version"] + 1) if r.data else 1


def get_latest_agent_output(session_id: str) -> dict | None:
    r = (get_db().table("agent_outputs")
         .select("*")
         .eq("session_id", session_id)
         .order("version", desc=True)
         .limit(1)
         .execute())
    return r.data[0] if r.data else None


def create_agent_output_row(session_id: str, version: int, idea_analysis: dict) -> dict:
    r = get_db().table("agent_outputs").insert({
        "session_id": session_id,
        "version": version,
        "idea_analysis": idea_analysis,
    }).execute()
    return r.data[0]


def update_agent_output_feasibility(output_id: str, feasibility: dict, tech_stack: dict) -> None:
    get_db().table("agent_outputs").update({
        "feasibility": feasibility,
        "tech_stack": tech_stack,
    }).eq("id", output_id).execute()


def update_agent_output_critique(output_id: str, critique: dict) -> None:
    get_db().table("agent_outputs").update({
        "critique": critique,
    }).eq("id", output_id).execute()


# ── Roadmap Phases ─────────────────────────────────────────────────────────────

def save_roadmap_phases(agent_output_id: str, phases: list[dict]) -> None:
    rows = [
        {
            "agent_output_id": agent_output_id,
            "week_number": week["week_number"],
            "phase_title": phase["phase_title"],
            "tasks": week["tasks"],
            "milestone": week["milestone"],
        }
        for phase in phases
        for week in phase["weeks"]
    ]
    get_db().table("roadmap_phases").insert(rows).execute()


def get_roadmap_phases(agent_output_id: str) -> list[dict]:
    r = (get_db().table("roadmap_phases")
         .select("*")
         .eq("agent_output_id", agent_output_id)
         .order("week_number")
         .execute())
    return r.data


# ── Feedback Revisions ─────────────────────────────────────────────────────────

def get_revision_count(session_id: str) -> int:
    r = (get_db().table("feedback_revisions")
         .select("revision_number")
         .eq("session_id", session_id)
         .order("revision_number", desc=True)
         .limit(1)
         .execute())
    return r.data[0]["revision_number"] if r.data else 0


def save_feedback_revision(
    session_id: str,
    revision_number: int,
    student_feedback: str,
    resulting_output_id: str,
) -> dict:
    r = get_db().table("feedback_revisions").insert({
        "session_id": session_id,
        "revision_number": revision_number,
        "student_feedback": student_feedback,
        "resulting_output_id": resulting_output_id,
    }).execute()
    return r.data[0]
