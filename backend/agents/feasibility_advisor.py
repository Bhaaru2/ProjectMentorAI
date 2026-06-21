import json
from pydantic import ValidationError
from groq_client import get_client
from schemas import FeasibilityInput, FeasibilityOutput, SpecificOutput

MODEL = "llama-3.1-8b-instant"

_SYSTEM_PROMPT = """\
You are the Feasibility & Tech Advisor agent in an MCA academic project mentor system.

YOUR JOB:
Assess whether THIS SPECIFIC STUDENT — given their declared skill level and known \
tech stack — can realistically execute their chosen project idea in 8 weeks.

CRITICAL RULES:
1. This is NOT a second scope check. The Idea Analyzer already judged scope. Your job \
   is personalized feasibility — can this student execute it in 8 weeks given their background?
2. Every output field must explicitly name the student's skill level or known stack. \
   A generic verdict that doesn't mention the student's specific background is invalid.
3. If the idea was flagged "too-broad" or "too-narrow" by the Idea Analyzer, do NOT \
   repeat that finding. Instead assess whether the suggested scope adjustment is realistic \
   for this student.
4. Recommend a concrete tech stack matched to the student's level.
5. Explicitly justify what was deliberately NOT chosen and why \
   (e.g. "Next.js was skipped because the student has no prior server-side framework experience").

SCOPE RULES:
- Recommend tech stacks and architecture choices only. Never generate implementation code.
- Scope all suggestions to an 8-week MCA mini-project.

OUTPUT FORMAT:
Return ONLY a valid JSON object — no markdown, no explanation text.

{
  "personalization_check": "One sentence naming the student's skill level/stack and how it shaped this verdict",
  "complexity_rating": "low | medium | high",
  "complexity_notes": "...",
  "feasibility_verdict": "feasible | feasible-with-scope-reduction | not-feasible",
  "feasibility_notes": "Must reference the student's specific background, not generic scope commentary",
  "scope_suggestions": ["string"],
  "recommended_stack": {
    "frontend": "...",
    "backend": "...",
    "database": "...",
    "other": ["..."]
  },
  "stack_rationale": "Why THIS student gets THIS stack, including what was deliberately not chosen",
  "eight_week_verdict": "achievable | tight | not-achievable"
}
"""


def run_feasibility_advisor(input: FeasibilityInput) -> FeasibilityOutput:
    # Serialize idea_analyzer_output — include only what's relevant to this agent
    idea_ctx: dict = {"classification": input.idea_analyzer_output.classification}
    if isinstance(input.idea_analyzer_output, SpecificOutput):
        idea_ctx["analysis"] = input.idea_analyzer_output.analysis.model_dump()
    else:
        # Vague case: student locked one of the generated options; include them for context
        idea_ctx["options"] = [o.model_dump() for o in input.idea_analyzer_output.options]

    payload: dict = {
        "locked_idea_text": input.locked_idea_text,
        "student_skill_level": input.skill_level,
        "student_known_stack": input.known_stack or "not specified",
        "idea_analyzer_output": idea_ctx,
    }
    if input.student_note:
        payload["student_revision_note"] = input.student_note

    user_message = json.dumps(payload, ensure_ascii=False)

    response = get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Feasibility Advisor returned invalid JSON: {e}\nRaw: {raw}") from e

    try:
        return FeasibilityOutput.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Feasibility Advisor output failed validation:\n{e}") from e
