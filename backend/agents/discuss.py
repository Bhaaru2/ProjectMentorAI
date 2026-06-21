import json
from groq_client import get_client

_STAGE_MODELS = {
    "idea_analysis": "llama-3.1-8b-instant",
    "feasibility": "llama-3.1-8b-instant",
    "roadmap": "llama-3.3-70b-versatile",
}

_SYSTEM_PROMPT = """\
You are the AI Project Mentor, helping an MCA student plan their academic project.

You are in DISCUSSION MODE — answer the student's question in plain conversational text.
You have their full project context and prior conversation history.

RULES:
- Answer only questions related to the student's specific project (idea, feasibility, tech stack, roadmap).
- If asked something off-topic, politely redirect back to the project plan.
- Never generate implementation code, only discuss architecture and planning choices.
- Keep all advice within an 8-week MCA mini-project scope.
- Be concise and direct — 2-4 sentences unless the student explicitly asks for more detail.
"""


def run_discuss_agent(
    stage: str,
    project_context: dict,
    conversation_history: list[dict],
    student_message: str,
) -> str:
    model = _STAGE_MODELS.get(stage, "llama-3.1-8b-instant")

    messages: list[dict] = [{"role": "system", "content": _SYSTEM_PROMPT}]

    if project_context:
        messages.append({
            "role": "user",
            "content": f"[PROJECT CONTEXT — for your reference only]\n{json.dumps(project_context, indent=2, ensure_ascii=False)}",
        })
        messages.append({
            "role": "assistant",
            "content": "I have the project context. What would you like to know?",
        })

    # Replay prior conversation
    for row in conversation_history:
        text = row["content"].get("text") or row["content"].get("summary") or ""
        if text:
            messages.append({"role": row["role"], "content": text})

    messages.append({"role": "user", "content": student_message})

    response = get_client().chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.5,
    )
    return response.choices[0].message.content.strip()
