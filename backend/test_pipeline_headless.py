#!/usr/bin/env python3
"""
Headless pipeline test — AI Project Mentor Agent.
Hits real Groq API and real Supabase. No mocks.

Test data is left in Supabase after the run so you can inspect it.
To clean up when done:
    python test_pipeline_headless.py --cleanup <profile_id>

Run from backend/ directory.
"""

import sys
from dotenv import load_dotenv

load_dotenv()

import db
import pipeline


# ── Helpers ────────────────────────────────────────────────────────────────────

def section(title: str) -> None:
    print(f"\n{'=' * 62}")
    print(f"  {title}")
    print("=" * 62)


def check(label: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}")
    if detail:
        print(f"         → {detail}")
    if not condition:
        raise AssertionError(f"Check failed: {label}" + (f" ({detail})" if detail else ""))


# ── Cleanup mode ───────────────────────────────────────────────────────────────

def do_cleanup(profile_id: str) -> None:
    print(f"\nCleaning up test data for profile {profile_id} ...")
    client = db.get_db()

    # Fetch auth_user_id before deleting the profile row
    profile_row = client.table("profiles").select("auth_user_id").eq("id", profile_id).single().execute().data
    auth_user_id = profile_row["auth_user_id"] if profile_row else None

    sessions = db.list_sessions(profile_id)
    for s in sessions:
        sid = s["id"]
        outputs = client.table("agent_outputs").select("id").eq("session_id", sid).execute()
        for o in outputs.data:
            client.table("roadmap_phases").delete().eq("agent_output_id", o["id"]).execute()
        client.table("feedback_revisions").delete().eq("session_id", sid).execute()
        client.table("agent_outputs").delete().eq("session_id", sid).execute()
        client.table("project_ideas").delete().eq("session_id", sid).execute()
    client.table("sessions").delete().eq("profile_id", profile_id).execute()
    client.table("profiles").delete().eq("id", profile_id).execute()

    if auth_user_id:
        db.delete_test_auth_user(auth_user_id)
        print(f"  Auth user {auth_user_id} deleted.")

    print("  Done. All test rows removed.\n")


if len(sys.argv) == 3 and sys.argv[1] == "--cleanup":
    do_cleanup(sys.argv[2])
    sys.exit(0)


# ── Main test run ──────────────────────────────────────────────────────────────

print("\nAI Project Mentor — Headless Pipeline Test")
print("Real Groq API + Real Supabase | No mocks\n")

profile_id = None  # set early so cleanup hint prints even on early failure

try:

    # ── Scenario A: Vague idea → options → lock ───────────────────────────────

    section("SCENARIO A — Vague idea analysis + lock")

    auth_user_id = db.create_test_auth_user("headless-test@projectmentorai.dev")
    print(f"\n  Auth user: {auth_user_id}")

    profile = db.create_profile(
        full_name="Test Student (headless)",
        skill_level="intermediate",
        known_stack="Python, basic HTML/CSS",
        auth_user_id=auth_user_id,
    )
    profile_id = profile["id"]
    print(f"\n  Profile:  {profile_id}")
    print(f"  Level:    {profile['skill_level']}")
    print(f"  Stack:    {profile['known_stack']}")

    session = db.create_session(profile_id, "Headless test session")
    session_id = session["id"]
    print(f"  Session:  {session_id}")

    print("\nRunning Idea Analyzer with vague input ...")
    idea_output = pipeline.run_idea_analysis(
        session_id,
        "I want to build something with AI for my MCA project",
    )

    print(f"\n  classification: {idea_output.classification}")
    check("Classification is 'vague'", idea_output.classification == "vague")
    check(
        "2–3 options returned",
        2 <= len(idea_output.options) <= 3,
        f"got {len(idea_output.options)}",
    )

    print("\n  Options:")
    for i, opt in enumerate(idea_output.options, 1):
        print(f"    {i}. [{opt.estimated_complexity}] {opt.title}  ({opt.domain})")
        print(f"       {opt.description}")

    st = db.get_session(session_id)["status"]
    check("Status → options_presented", st == "options_presented", f"got '{st}'")

    selected_text = f"{idea_output.options[0].title}: {idea_output.options[0].description}"
    print(f"\nLocking idea → {idea_output.options[0].title!r}")
    pipeline.lock_idea(session_id, selected_text)

    st = db.get_session(session_id)["status"]
    check("Status → idea_locked", st == "idea_locked", f"got '{st}'")

    # ── Scenario B: Feasibility + gate check + confirm stack ──────────────────

    section("SCENARIO B — Feasibility + gate enforcement + confirm stack")

    print("\nRunning Feasibility Advisor ...")
    feasibility_output = pipeline.run_feasibility(session_id)

    print(f"\n  personalization_check: {feasibility_output.personalization_check}")
    print(f"  complexity:            {feasibility_output.complexity_rating}")
    print(f"  feasibility_verdict:   {feasibility_output.feasibility_verdict}")
    print(f"  eight_week_verdict:    {feasibility_output.eight_week_verdict}")
    stk = feasibility_output.recommended_stack
    print(f"  recommended_stack:")
    print(f"    frontend:  {stk.frontend}")
    print(f"    backend:   {stk.backend}")
    print(f"    database:  {stk.database}")
    if stk.other:
        print(f"    other:     {', '.join(stk.other)}")
    print(f"  stack_rationale: {feasibility_output.stack_rationale}")
    if feasibility_output.scope_suggestions:
        print("  scope_suggestions:")
        for s in feasibility_output.scope_suggestions:
            print(f"    • {s}")

    check(
        "Feasibility verdict is valid",
        feasibility_output.feasibility_verdict in (
            "feasible", "feasible-with-scope-reduction", "not-feasible"
        ),
    )
    st = db.get_session(session_id)["status"]
    check("Status → feasibility_presented", st == "feasibility_presented", f"got '{st}'")

    # Gate: roadmap wave must be blocked until confirm_stack
    print("\nGate check — calling run_roadmap_wave() before confirm_stack() ...")
    gate_blocked = False
    try:
        pipeline.run_roadmap_wave(session_id)
    except pipeline.PipelineGateError as e:
        gate_blocked = True
        print(f"  Correctly blocked: {e}")
    check("Roadmap wave blocked before confirm_stack", gate_blocked)

    pipeline.confirm_stack(session_id)
    st = db.get_session(session_id)["status"]
    check("Status → stack_confirmed", st == "stack_confirmed", f"got '{st}'")

    # ── Scenario C: Roadmap wave (Agents 3 + 4) ───────────────────────────────

    section("SCENARIO C — Roadmap wave (Agents 3 + 4)")

    print("\nRunning Roadmap Planner + Critic ...")
    roadmap_output, critic_output = pipeline.run_roadmap_wave(session_id)

    print(f"\n  critical_path_notes: {roadmap_output.critical_path_notes}")
    print(f"\n  Roadmap — {roadmap_output.total_weeks} weeks, {len(roadmap_output.phases)} phases:")
    for phase in roadmap_output.phases:
        print(f"\n    ▸ {phase.phase_title}")
        for week in phase.weeks:
            print(f"      Week {week.week_number}  [{week.milestone}]")
            for task in week.tasks:
                print(f"        • {task}")

    check("total_weeks = 8", roadmap_output.total_weeks == 8)
    check("At least 3 phases", len(roadmap_output.phases) >= 3, f"got {len(roadmap_output.phases)}")
    week_nums = sorted(w.week_number for p in roadmap_output.phases for w in p.weeks)
    check("All 8 weeks present", week_nums == list(range(1, 9)), f"got {week_nums}")

    print(f"\n  Critic verdict: {critic_output.overall_verdict}")
    print(f"  Checklist ({len(critic_output.checklist)} items):")
    for item in critic_output.checklist:
        print(f"    [{item.result.upper()}] {item.item}")
        print(f"           {item.notes}")

    check("Checklist has 6 items", len(critic_output.checklist) == 6, f"got {len(critic_output.checklist)}")

    if critic_output.flags:
        print("\n  Flags:")
        for f in critic_output.flags:
            print(f"    Wk {f.week_number}: {f.issue}")
            print(f"    → {f.suggestion}")
    if critic_output.missing_elements:
        print(f"\n  Missing elements: {critic_output.missing_elements}")
    if critic_output.strengths:
        print(f"\n  Strengths: {critic_output.strengths}")

    latest_v1 = db.get_latest_agent_output(session_id)
    v1_id = latest_v1["id"]
    phases_in_db = db.get_roadmap_phases(v1_id)
    check("roadmap_phases rows in DB = 8", len(phases_in_db) == 8, f"got {len(phases_in_db)}")

    print(f"\n  agent_outputs v1:  {v1_id}")
    print(f"    idea_analysis:  {'✓' if latest_v1['idea_analysis'] else '✗'}")
    print(f"    feasibility:    {'✓' if latest_v1['feasibility'] else '✗'}")
    print(f"    tech_stack:     {'✓' if latest_v1['tech_stack'] else '✗'}")
    print(f"    critique:       {'✓' if latest_v1['critique'] else '✗'}")

    st = db.get_session(session_id)["status"]
    check("Status → roadmap_ready", st == "roadmap_ready", f"got '{st}'")

    # ── Scenario C (cont.): Revision wave ─────────────────────────────────────

    section("SCENARIO C (cont.) — Revision wave")

    feedback = (
        "Week 1 is too vague — I want more specific setup tasks. "
        "Also, testing feels rushed into a single week; please spread it out."
    )
    print(f"\n  Student feedback: {feedback!r}")
    print("\nRunning revision wave (Agents 3 + 4 only, Agent 1 + 2 skipped) ...")
    rev_roadmap, rev_critic = pipeline.run_revision_wave(session_id, feedback)

    print(f"\n  Revised roadmap ({rev_roadmap.total_weeks} weeks):")
    for phase in rev_roadmap.phases:
        print(f"\n    ▸ {phase.phase_title}")
        for week in phase.weeks:
            print(f"      Week {week.week_number}  [{week.milestone}]")

    print(f"\n  Critic verdict after revision: {rev_critic.overall_verdict}")
    if rev_critic.student_feedback_addressed:
        sfa = rev_critic.student_feedback_addressed
        print(f"  Feedback addressed [{sfa.result.upper()}]: {sfa.notes}")

    # Versioning checks
    latest_v2 = db.get_latest_agent_output(session_id)
    check("New agent_outputs row created", latest_v2["id"] != v1_id)
    check("v2 version number = 2", latest_v2["version"] == 2, f"got {latest_v2['version']}")

    v1_refetch = (db.get_db().table("agent_outputs")
                  .select("*").eq("id", v1_id).single().execute().data)
    check("v1 idea_analysis unchanged", v1_refetch["idea_analysis"] == latest_v1["idea_analysis"])
    check("v1 feasibility unchanged",   v1_refetch["feasibility"]   == latest_v1["feasibility"])

    v2_phases = db.get_roadmap_phases(latest_v2["id"])
    check("v2 roadmap_phases rows in DB = 8", len(v2_phases) == 8, f"got {len(v2_phases)}")

    revision_count = db.get_revision_count(session_id)
    check("feedback_revisions row recorded (count = 1)", revision_count == 1, f"got {revision_count}")

    st = db.get_session(session_id)["status"]
    check("Status → roadmap_ready (post-revision)", st == "roadmap_ready", f"got '{st}'")

    # ── Done ──────────────────────────────────────────────────────────────────

    section("ALL CHECKS PASSED")
    print(f"""
  Data is live in Supabase — inspect it now.

    profile_id : {profile_id}
    session_id : {session_id}
    v1 output  : {v1_id}
    v2 output  : {latest_v2['id']}

  To clean up when ready:
    python test_pipeline_headless.py --cleanup {profile_id}
""")

except Exception as exc:
    print(f"\n\n  [ERROR] {exc}")
    if profile_id:
        print(f"\n  Test data may be partially written. To clean up:")
        print(f"    python test_pipeline_headless.py --cleanup {profile_id}\n")
    raise
