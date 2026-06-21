# Pipeline Spec — AI Project Mentor Agent
*Canonical reference for all FastAPI agent functions. Read this before constructing any prompt.*

---

## Pipeline overview

Four agents run in a fixed sequential order. Each agent's output feeds the next.
No agent runs before its gate condition is met.

```
Student input
     ↓
[1] Idea Analyzer          ← runs immediately on any input
     ↓  (idea locked by student)
[2] Feasibility & Tech Advisor
     ↓  (stack confirmed by student)
[3] Roadmap Planner
     ↓
[4] Critic & Feedback Agent
     ↓
Session complete → status: roadmap_ready
```

---

## LLM provider & model assignments

**Provider:** Groq API (free tier)  
**SDK:** `groq` Python package (OpenAI-SDK-compatible; also usable via the `openai` package with a custom `base_url`)

| Agent | Model |
|---|---|
| Idea Analyzer | `llama-3.1-8b-instant` |
| Feasibility & Tech Advisor | `llama-3.1-8b-instant` |
| Roadmap Planner | `llama-3.3-70b-versatile` |
| Critic & Feedback Agent | `llama-3.3-70b-versatile` |

**Model selection rationale:** Agents 1 and 2 handle classification and personalization tasks and run more frequently per session (on every student input and every idea-lock event). They use `llama-3.1-8b-instant` for lower latency and the higher free-tier rate limit. Agents 3 and 4 perform reasoning-heavy generation (phase-wise planning and structured checklist evaluation) and run at most once per session leg or once per revision, so `llama-3.3-70b-versatile` is appropriate despite its tighter free-tier rate limits.

---

## Agent 1 — Idea Analyzer

**Gate:** Runs on any student input. No prior agent output required.

**Job:**  
First, classify the input as `"vague"` or `"specific"`.

- **Vague** (e.g., "something with AI" / "a website" / no clear domain): generate 2–3 distinct
  project options tailored to the student's skill level and MCA curriculum. Each option should
  differ meaningfully in domain and complexity.
- **Specific** (e.g., "a library management system using React and Node"): deep-analyze the
  single idea — assess its relevance to MCA curriculum, originality (is it overused?), and
  whether its scope is achievable in 8 weeks.

**Output JSON schema:**
```json
{
  "classification": "vague" | "specific",
  "options": [                          // present only if classification == "vague"
    {
      "title": "string",
      "description": "string",          // 2–3 sentences
      "domain": "string",               // e.g., "Healthcare", "EdTech", "Finance"
      "estimated_complexity": "low" | "medium" | "high"
    }
  ],
  "analysis": {                         // present only if classification == "specific"
    "relevance_score": 1–10,
    "relevance_notes": "string",
    "originality_score": 1–10,
    "originality_notes": "string",
    "scope_verdict": "well-scoped" | "too-broad" | "too-narrow",
    "scope_notes": "string",
    "recommendation": "proceed" | "revise"
  }
}
```

**Handoff trigger:** Student explicitly locks or selects an idea. This advances session status
to `idea_locked`. The Feasibility Advisor does not run before this confirmation.

> **Pydantic implementation note:** Model this as a discriminated union — a `VagueOutput`
> model (contains `options`, no `analysis`) and a `SpecificOutput` model (contains `analysis`,
> no `options`), discriminated on `classification`. Do not use a single flat model with both
> fields optional.

---

## Agent 2 — Feasibility & Tech Advisor

**Gate:** Runs only after session status is `idea_locked`. Receives: the locked idea text and
the student's declared skill level (`beginner` / `intermediate` / `advanced`) and known stack.

**Job:**
This agent's judgment must be explicitly personalized to the student — it is NOT
a second scope check. The Idea Analyzer already judged whether the idea is
generically well-scoped for an MCA curriculum; this agent must judge whether
THIS SPECIFIC student, given their declared skill level and known stack, can
realistically execute it in 8 weeks.

Every output field must explicitly reference the student's skill level or known
stack by name — a generic verdict that doesn't mention the student's specific
background is invalid output and must be regenerated. If the idea was already
flagged "too-broad" or "too-narrow" by the Idea Analyzer, do not repeat that
finding — instead assess whether the suggested scope adjustment is realistic
given this student's level.

Recommend a concrete tech stack matched to the student's level — explicitly
justify why a more advanced stack was NOT chosen, if relevant (e.g., "Next.js
was considered but skipped since the student has no prior server-side
framework experience").

**Output JSON schema:**
```json
{
  "personalization_check": "string",  // one sentence naming the student's specific 
                                       // skill level/stack and how it shaped this verdict
  "complexity_rating": "low" | "medium" | "high",
  "complexity_notes": "string",
  "feasibility_verdict": "feasible" | "feasible-with-scope-reduction" | "not-feasible",
  "feasibility_notes": "string",      // must reference the student's specific 
                                       // background, not generic scope commentary
  "scope_suggestions": ["string"],
  "recommended_stack": {
    "frontend": "string",
    "backend": "string",
    "database": "string",
    "other": ["string"]
  },
  "stack_rationale": "string",        // must explain why THIS student gets THIS 
                                       // stack, including what was deliberately not chosen
  "eight_week_verdict": "achievable" | "tight" | "not-achievable"
}
```

**Handoff trigger:** Feasibility output is persisted. Session status advances to
`feasibility_presented`. The Roadmap Planner does not run until the student explicitly
confirms the stack — which advances status to `stack_confirmed` via their own action.

---

## Agent 3 — Roadmap Planner

**Gate:** Runs only after session status is `stack_confirmed`. This status is set exclusively
by the student accepting the feasibility verdict and recommended stack — it is never set
automatically when the Feasibility Advisor completes (that sets `feasibility_presented`).
Receives: the locked idea text, the feasibility output (recommended stack + scope
adjustments), and the student's skill level.

**Job:**  
Generate a phase-wise 8-week project roadmap with one milestone per week. Phases should
group related weeks (e.g., Setup & Planning, Core Feature Development, Integration,
Testing & Deployment). Each week has a clear, concrete set of tasks — not vague goals.

**Output JSON schema:**
```json
{
  "phases": [
    {
      "phase_title": "string",
      "weeks": [
        {
          "week_number": 1–8,
          "tasks": ["string"],          // 3–5 concrete tasks for the week
          "milestone": "string"         // one deliverable that marks the week complete
        }
      ]
    }
  ],
  "total_weeks": 8,
  "critical_path_notes": "string"       // any weeks that are high-risk or sequentially critical
}
```

**Handoff trigger:** Roadmap output is persisted. Session status advances to `roadmap_ready`
after the Critic completes. The Critic runs immediately after this agent — no student gate
between them.

---

## Agent 4 — Critic & Feedback Agent

**Gate:** Runs immediately after the Roadmap Planner. Receives: the full roadmap output.
If this is a revision run, also receives the student's feedback text as additional context.

**Job:**
This agent must NOT give a holistic opinion on the roadmap ("looks good" / "strong
roadmap"). It must run a fixed checklist against the roadmap and report a
pass/fail result for each item individually, even when the result is "pass" with
no issue found. A generic summary verdict without checklist coverage is invalid
output and must be regenerated.

Mandatory checklist (must address every item):
1. Is there an explicit testing/QA week or task?
2. Is there an explicit deployment step?
3. Does any week assign a task requiring a skill/tool NOT in the recommended stack?
4. Is any week's task list unrealistic for the hours available to a student
   balancing other coursework?
5. Is every milestone concretely measurable (a specific deliverable), or are
   any vague ("make progress on backend")?
6. Are there any single points of failure — a week whose slippage would block
   all following weeks with no buffer?

For revision runs, the student's feedback text must be addressed explicitly as
its own checklist item, separate from the six above.

**Output JSON schema:**
```json
{
  "checklist": [
    {
      "item": "string",              // one of the 6 fixed checklist questions above
      "result": "pass" | "fail",
      "notes": "string"               // required even on pass — state what was checked
    }
  ],
  "student_feedback_addressed": {     // present only on revision runs
    "feedback_summary": "string",
    "result": "pass" | "fail",
    "notes": "string"
  },
  "overall_verdict": "strong" | "needs-minor-revision" | "needs-major-revision",
  "flags": [
    {
      "week_number": 1-8,
      "issue": "string",
      "suggestion": "string"
    }
  ],
  "missing_elements": ["string"],
  "strengths": ["string"],
  "revised_milestone_suggestions": [
    {
      "week_number": 1-8,
      "original_milestone": "string",
      "suggested_milestone": "string"
    }
  ]
}
```

**Handoff trigger:** Critic output is persisted. Session status advances to `roadmap_ready`.
Pipeline is complete.

---

## Revision routing

When the student requests a revision, the orchestrator does **not** restart the full pipeline.
It routes to the earliest affected agent only.

**The revision type is determined by explicit UI intent, not inferred from free text.** The
frontend presents distinct action buttons — e.g., "Edit my idea", "Change tech stack / scope",
"Give feedback on roadmap" — and passes the selected intent as a structured field to the
backend. The orchestrator reads this intent field to determine which row below applies; it
never attempts to classify ambiguous free-text input into a revision type.

| UI intent / what changed | Agents that re-run |
|---|---|
| "Edit my idea" | Idea Analyzer → Feasibility Advisor → Roadmap Planner → Critic |
| "Change tech stack / scope" | Feasibility Advisor → Roadmap Planner → Critic |
| "Give feedback on roadmap" | Roadmap Planner (with feedback as context) → Critic |

Every re-run creates a new versioned row in `agent_outputs` (version integer increments).
The previous version is never overwritten or deleted.

Session status is set to `revising` at the start of a re-run and advances back to
`roadmap_ready` when the Critic completes.

---

## Human approval gates

The pipeline has three mandatory student confirmation points where execution pauses:

| Gate | Status before | What must happen | Status after |
|---|---|---|---|
| **Idea lock** | `draft` or `options_presented` | Student explicitly selects/confirms an idea | `idea_locked` |
| **Stack confirmation** | `feasibility_presented` | Student explicitly accepts the stack — or rejects it (see below) | `stack_confirmed` or re-enters `feasibility_presented` after re-run |
| **Roadmap revision** | `roadmap_ready` | Student selects a revision intent button and submits feedback text | `revising` |

**If the student rejects the stack at the Stack Confirmation gate:** No roadmap exists yet,
so the "Give feedback on roadmap" intent does not apply. Instead, the student uses the
"Change tech stack / scope" intent (defined in Revision routing) with their rejection note
as the feedback text. This re-runs the Feasibility Advisor with that note as additional
context, and the session status returns to `feasibility_presented` until the student accepts
a revised stack.

The orchestrator must not advance past a gate without the corresponding student action
recorded in the database. No agent auto-advances the pipeline on the student's behalf.

**Full `sessions.status` enum:** `draft` → `options_presented` → `idea_locked` →
`feasibility_presented` → `stack_confirmed` → `roadmap_ready` → `revising`

---

## Scope boundaries — all agents must enforce these

Every agent must check whether the student's input falls within scope before generating
a substantive response. If it does not, return a polite redirect instead of engaging with
the out-of-scope request.

**Never do:**
- Generate implementation code (functions, classes, SQL queries, config files)
- Review existing code the student pastes
- Recommend specific GitHub repositories or open-source projects to copy
- Suggest integration with Jira, GitHub Actions, CI/CD pipelines
- Respond to questions unrelated to the student's current project (general programming
  help, homework, exam prep)

**Off-topic redirect template** (adapt tone as needed):
> "I'm here to help you plan your MCA project — I can help with idea selection,
> feasibility assessment, tech stack recommendations, and your 8-week roadmap.
> For [the student's off-topic request], I'd suggest [a general pointer to where
> they can find that help]. Want to continue working on your project plan?"

**Always do:**
- Stay within the student's declared skill level when recommending tools or complexity
- Scope suggestions to an 8-week MCA mini-project (not a production system)
- Recommend tech stacks only; never write the code that implements them
- Redirect off-topic questions without being dismissive

---

## Context each agent receives (summary)

| Agent | Receives |
|---|---|
| Idea Analyzer | Student's raw input text, student's skill level and known stack (from profile) |
| Feasibility Advisor | Locked idea text, student skill level + known stack, Idea Analyzer output |
| Roadmap Planner | Locked idea text, student skill level, Feasibility Advisor output (stack + scope) |
| Critic | Roadmap Planner output; optionally: student feedback text (revision runs only) |

No agent receives the full conversation history. Each receives only the structured outputs
of the agents that preceded it, plus the student's profile fields.

---

## LLM call pattern

Groq's API is OpenAI-SDK-compatible. Prefer the `groq` Python package; the `openai` package
with a custom `base_url` is an equally valid alternative.

**Initialization — `groq` SDK (preferred):**
```python
import os
from groq import Groq

client = Groq(api_key=os.environ["GROQ_API_KEY"])
```

**Initialization — `openai` SDK with Groq endpoint:**
```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)
```

**Calling an agent (example — Roadmap Planner using `llama-3.3-70b-versatile`):**
```python
import json

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {"role": "system", "content": ROADMAP_PLANNER_SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user_context)},
    ],
    response_format={"type": "json_object"},
)
output = json.loads(response.choices[0].message.content)
```

All four agents use `response_format={"type": "json_object"}` and a system prompt that
instructs the model to return only valid JSON matching the per-agent schema defined above.
Swap `model` to `"llama-3.1-8b-instant"` for Agents 1 and 2.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API key (free tier) — used by all four agent functions |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only; never exposed to frontend) |
