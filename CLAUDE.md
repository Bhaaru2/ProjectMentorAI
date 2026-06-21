I'm building an MCA mini-project called "AI Project Mentor Agent" — a multi-agent 
system that helps students pick and plan academic projects. I have a finalized 
architecture and need you to do this in two clearly separated phases.

=== PHASE 1: REFERENCE ANALYSIS (READ-ONLY, DO NOT MODIFY ANYTHING) ===

Read through the project folder at: /Users/bhargavi/Desktop/zchat

This is a friend's React Native app that implements a sub-agent workflow. I have 
his permission to study the orchestration pattern only — not to copy his UI, 
styling, component code, or React Native-specific implementation.

Your task:
1. Identify the files/modules that define the sub-agent workflow — look for 
   things like: agent definitions, role/prompt configs, a state machine or 
   workflow controller, rules for which agent runs next, how context/output 
   passes from one agent to the next, and how the workflow decides it's "done" 
   or needs to loop back.
2. Write a plain-English summary (no code copied verbatim) covering:
   - How many distinct agent roles exist and what each one's job is
   - The trigger/handoff logic: what causes the system to move from one agent 
     to the next
   - How state or context is carried between agents (full history? summarized? 
     structured object?)
   - Any retry, revision, or loop-back logic
   - Anything that seems like a deliberate design choice worth adapting
3. Output this summary as a markdown file called SUBAGENT_PATTERN_NOTES.md in 
   my project root. Do not copy any of his actual code into it — describe the 
   pattern in your own words/pseudocode only.

Stop after Phase 1 and show me the summary before continuing to Phase 2.

=== PHASE 2: BUILD MY PROJECT (after I review Phase 1) ===

Once I confirm the Phase 1 summary, build my project using MY architecture below 
— applying any useful orchestration patterns you found in Phase 1, but with my 
own tech stack, schema, and agent roles. Do not reuse his UI patterns at all 
since my frontend is React web, not React Native.

=== STANDING INSTRUCTION: ORCHESTRATION CHANGES ===

This applies in two ways, every session:

1. AS A BUILDER: Before writing or modifying any code for a new step or 
   phase, first present a short plan — what files/functions you'll create, 
   what each does, and how they fit together. Do NOT write any code until 
   I explicitly approve the plan ("approved" / "go ahead" / similar). This 
   mirrors the human-approval-gate pattern in SUBAGENT_PATTERN_NOTES.md — 
   it applies to you as the orchestrator of this build, not just to 
   features inside the app.

2. AS AN IMPLEMENTER: When building orchestration, pipeline, or 
   agent-chaining logic, apply the design patterns from 
   SUBAGENT_PATTERN_NOTES.md INSIDE the code (human approval gates, atomic 
   versioned outputs, wave-based partial re-runs, session-state-as-resume-point).

3. PARALLELIZATION: If a step has genuinely independent parts (no shared 
   file dependencies), say so in your plan, build them as separate units, 
   then explicitly confirm consistency across them before considering the 
   step done — mirroring the wave + merge pattern.

Read SUBAGENT_PATTERN_NOTES.md before any orchestration work to refresh 
these patterns, every session.

MY TECH STACK:
- Frontend: React (TypeScript)
- Backend: Python (FastAPI)
- Database + Auth: Supabase (PostgreSQL)
- LLM: Groq API (free tier, no card required — OpenAI-SDK-compatible)
  Model assignments per agent:
    - Idea Analyzer              → llama-3.1-8b-instant
    - Feasibility & Tech Advisor → llama-3.1-8b-instant
    - Roadmap Planner            → llama-3.3-70b-versatile
    - Critic & Feedback Agent    → llama-3.3-70b-versatile
  Rationale: Agents 1 & 2 handle classification/personalization and run more
  frequently per session — they use the faster, higher-rate-limit 8B model.
  Agents 3 & 4 are reasoning-heavy and run at most once per session leg —
  they use the larger 70B model despite its tighter free-tier rate limits.
  Env var: GROQ_API_KEY
- Orchestration: custom sequential Python pipeline (no CrewAI)

MY AGENT PIPELINE (runs in this fixed order, each agent's output feeds the next):
1. Idea Analyzer — first classifies input as "vague" or "specific". If vague, 
   generates 2-3 tailored project options. If specific, deep-analyzes the one 
   idea given (relevance, originality, scope check against MCA curriculum).
2. Feasibility & Tech Advisor — runs only after student locks/selects an idea. 
   Assesses complexity against an 8-week timeframe, recommends a tech stack 
   matched to the student's declared skill level.
3. Roadmap Planner — runs only after feasibility is confirmed. Generates a 
   phase-wise 8-week roadmap with weekly milestones.
4. Critic & Feedback Agent — reviews the roadmap, flags unrealistic milestones 
   or gaps, suggests improvements.

REVISION LOGIC: if the student edits their idea after locking it, only re-run 
the Idea Analyzer (or Feasibility Advisor if just the stack/scope changed) — 
not the whole pipeline. If the student requests a roadmap revision, only re-run 
Roadmap Planner + Critic with the feedback text as added context. Each revision 
creates a new versioned row, never overwrites the previous one.

SCOPE BOUNDARIES (explicit, do not build beyond this):
- No code generation or code review — the agents recommend tech stacks and 
  architecture choices only, never write implementation code
- No integration with Jira/GitHub
- No image/diagram upload
- No real-time multi-student collaboration
- Off-topic questions (unrelated to the student's project) should be politely 
  redirected, not answered

DATABASE SCHEMA (Supabase/PostgreSQL):
- profiles: id, auth_user_id, full_name, skill_level, known_stack, created_at
- sessions: id, profile_id, title, status, created_at, updated_at
  (status values: draft → options_presented → idea_locked → feasibility_presented
                  → stack_confirmed → roadmap_ready → revising)
  feasibility_presented: set after Feasibility & Tech Advisor output is shown to
    the student, before they confirm the stack.
  stack_confirmed: set only on explicit student UI action — required gate before
    the Roadmap Planner is allowed to run; must never be inferred from chat text.
- project_ideas: id, session_id, raw_idea_text, created_at
- agent_outputs: id, session_id, idea_analysis (jsonb), feasibility (jsonb), 
  tech_stack (jsonb), critique (jsonb), version (int), created_at
- roadmap_phases: id, agent_output_id, week_number, phase_title, tasks (jsonb), 
  milestone
- feedback_revisions: id, session_id, revision_number, student_feedback, 
  resulting_output_id, created_at

BUILD ORDER — please follow this sequence:
1. Set up Supabase tables matching the schema above
2. Build the FastAPI backend with the four agent functions as separate, 
   independently testable functions (using Groq API)
3. Build the orchestration logic that chains them with the branching/revision 
   rules above
4. Test the full pipeline headless (no frontend) using sample inputs, show me 
   the outputs before building any UI
5. Only after I approve the backend outputs, build the React frontend: chat 
   interface, options display, locked-idea confirmation, roadmap timeline 
   cards, and a session history list

Start with Phase 1 now.