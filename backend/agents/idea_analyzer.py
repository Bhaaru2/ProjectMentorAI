import json
from pydantic import TypeAdapter, ValidationError
from groq_client import get_client
from schemas import IdeaAnalyzerInput, IdeaAnalyzerOutput

MODEL = "llama-3.1-8b-instant"

_SYSTEM_PROMPT = """\
You are the Idea Analyzer agent in an MCA (Master of Computer Applications) \
academic project mentor system.

YOUR JOB:
Step 1 — Classify the student's input as exactly "vague" or "specific".
  - Vague: lacks a clear domain, feature set, or direction
    (e.g. "something with AI", "a website", "I want to do ML").
  - Specific: names a concrete application with an implied domain and feature set
    (e.g. "a library management system using React and Node").

Step 2a — If VAGUE: generate exactly 2 or 3 distinct project options.
  - Each must differ meaningfully in domain and complexity.
  - Tailor options to the student's declared skill level and MCA curriculum.
  - All options must be achievable as an 8-week mini-project.

Step 2b — If SPECIFIC: deep-analyze the single idea:
  - relevance_score (1–10): how well it fits an MCA curriculum
  - originality_score (1–10): how overused/fresh the idea is
  - scope_verdict: "well-scoped" | "too-broad" | "too-narrow" for 8 weeks
  - recommendation: "proceed" | "revise"

SCOPE RULES (enforce strictly — politely redirect if violated):
- Never generate implementation code.
- Never answer questions unrelated to the student's project planning.
- Keep all suggestions scoped to an 8-week MCA mini-project, not a production system.

OUTPUT FORMAT:
Return ONLY a valid JSON object — no markdown, no explanation text.

If vague:
{
  "classification": "vague",
  "options": [
    {
      "title": "...",
      "description": "2-3 sentence description",
      "domain": "e.g. Healthcare / EdTech / Finance",
      "estimated_complexity": "low | medium | high"
    }
  ]
}

If specific:
{
  "classification": "specific",
  "analysis": {
    "relevance_score": <1-10>,
    "relevance_notes": "...",
    "originality_score": <1-10>,
    "originality_notes": "...",
    "scope_verdict": "well-scoped | too-broad | too-narrow",
    "scope_notes": "...",
    "recommendation": "proceed | revise"
  }
}
"""

_adapter = TypeAdapter(IdeaAnalyzerOutput)


def run_idea_analyzer(input: IdeaAnalyzerInput) -> IdeaAnalyzerOutput:
    user_message = json.dumps({
        "raw_idea_text": input.raw_idea_text,
        "student_skill_level": input.skill_level,
        "student_known_stack": input.known_stack or "not specified",
    }, ensure_ascii=False)

    response = get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )

    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Idea Analyzer returned invalid JSON: {e}\nRaw: {raw}") from e

    try:
        return _adapter.validate_python(data)
    except ValidationError as e:
        raise ValueError(f"Idea Analyzer output failed validation:\n{e}") from e
