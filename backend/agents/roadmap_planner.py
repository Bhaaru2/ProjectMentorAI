import json
from pydantic import ValidationError
from groq_client import get_client
from schemas import RoadmapInput, RoadmapOutput

MODEL = "llama-3.3-70b-versatile"

_SYSTEM_PROMPT = """\
You are the Roadmap Planner agent in an MCA academic project mentor system.

YOUR JOB:
Generate a phase-wise 8-week project roadmap with one concrete milestone per week.

REQUIREMENTS:
1. Group related weeks into named phases (e.g. "Setup & Planning", \
"Core Feature Development", "Integration & Testing", "Deployment & Polish"). \
Typical projects have 3–4 phases.
2. Each week must have exactly 3–5 concrete, actionable tasks — not vague goals \
like "work on the backend". Tasks must be specific enough that the student knows \
exactly what to do next.
3. Each week must have exactly one milestone: a specific, measurable deliverable \
that marks the week complete (e.g. "User login flow working end-to-end with JWT", \
not "make progress on auth").
4. The roadmap MUST include at least one week with explicit testing/QA tasks.
5. The roadmap MUST include at least one explicit deployment task.
6. All tasks must use only the tools in the recommended_stack provided — no extras.
7. Scale task complexity to the student's declared skill level.
8. total_weeks must always be exactly 8.

SCOPE RULES:
- Tasks describe what to build and configure — never write implementation code.
- Scope to an 8-week MCA mini-project, not a production system.

OUTPUT FORMAT:
Return ONLY a valid JSON object — no markdown, no explanation text.

{
  "phases": [
    {
      "phase_title": "...",
      "weeks": [
        {
          "week_number": <1–8>,
          "tasks": ["...", "...", "..."],
          "milestone": "..."
        }
      ]
    }
  ],
  "total_weeks": 8,
  "critical_path_notes": "Any weeks that are high-risk or sequentially block everything after them"
}
"""


def run_roadmap_planner(input: RoadmapInput) -> RoadmapOutput:
    payload: dict = {
        "locked_idea_text": input.locked_idea_text,
        "student_skill_level": input.skill_level,
        "recommended_stack": input.feasibility_output.recommended_stack.model_dump(),
        "scope_suggestions": input.feasibility_output.scope_suggestions,
        "eight_week_verdict": input.feasibility_output.eight_week_verdict,
    }
    if input.student_feedback:
        payload["revision_feedback"] = input.student_feedback

    response = get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.5,
    )

    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Roadmap Planner returned invalid JSON: {e}\nRaw: {raw}") from e

    try:
        return RoadmapOutput.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Roadmap Planner output failed validation:\n{e}") from e
