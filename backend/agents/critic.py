import json
from pydantic import ValidationError
from groq_client import get_client
from schemas import CriticInput, CriticOutput

MODEL = "llama-3.3-70b-versatile"

_SYSTEM_PROMPT = """\
You are the Critic & Feedback Agent in an MCA academic project mentor system.

YOUR JOB:
Run a FIXED checklist against the roadmap. Report a pass/fail result for EVERY item \
individually — even when the result is "pass". Do NOT give a holistic summary opinion \
("looks good", "strong roadmap"). A generic verdict without individual checklist \
coverage is invalid output.

MANDATORY CHECKLIST (address every item, no skipping):
1. Is there an explicit testing/QA week or task in the roadmap?
2. Is there an explicit deployment step in the roadmap?
3. Does any week assign a task requiring a skill or tool NOT listed in the \
   recommended_stack provided?
4. Is any week's task list unrealistic for a student who is also balancing other \
   coursework (assume ~15 hrs/week available)?
5. Is every milestone concretely measurable (a specific deliverable), or are any vague \
   (e.g. "make progress on backend")?
6. Are there any single points of failure — a week whose slippage would block all \
   following weeks with no buffer?

REVISION RUNS:
If student_feedback is provided, address it as a 7th item in student_feedback_addressed \
(separate object, not inside the checklist array).

For flags: include the specific week_number.
For milestone suggestions: include both the original_milestone and your suggested_milestone.

SCOPE RULES:
- Critique only — never suggest implementation code.
- Keep suggestions within the 8-week MCA mini-project scope.

OUTPUT FORMAT:
Return ONLY a valid JSON object — no markdown, no explanation text.

{
  "checklist": [
    {"item": "...", "result": "pass | fail", "notes": "required even on pass"}
  ],
  "student_feedback_addressed": {
    "feedback_summary": "...",
    "result": "pass | fail",
    "notes": "..."
  },
  "overall_verdict": "strong | needs-minor-revision | needs-major-revision",
  "flags": [
    {"week_number": <1–8>, "issue": "...", "suggestion": "..."}
  ],
  "missing_elements": ["..."],
  "strengths": ["..."],
  "revised_milestone_suggestions": [
    {"week_number": <1–8>, "original_milestone": "...", "suggested_milestone": "..."}
  ]
}

Set student_feedback_addressed to null if no student_feedback was provided.
"""


def run_critic(input: CriticInput) -> CriticOutput:
    payload: dict = {
        "roadmap": input.roadmap_output.model_dump(),
        "recommended_stack": input.recommended_stack.model_dump(),
    }
    if input.student_feedback:
        payload["student_feedback"] = input.student_feedback

    response = get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Critic returned invalid JSON: {e}\nRaw: {raw}") from e

    try:
        return CriticOutput.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Critic output failed validation:\n{e}") from e
