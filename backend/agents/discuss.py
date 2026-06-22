import json
from groq_client import get_client

_STAGE_MODELS = {
    "idea_analysis": "llama-3.1-8b-instant",
    "feasibility": "llama-3.1-8b-instant",
    "roadmap": "llama-3.1-8b-instant",
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


def classify_revision_scope(message: str, session_status: str, existing_idea: str = "") -> str:
    """
    Classifies the student's revision request into one of three scopes:
      'idea'        — complete pivot to a different project concept
      'feasibility' — wants to change the tech stack or framework
      'roadmap'     — everything else: feature change, timeline, tasks, re-analysis of current idea

    existing_idea is passed so the classifier can distinguish a minor modification
    of the current project from a genuine pivot to a new one.

    Returns one of: 'idea' | 'feasibility' | 'roadmap'
    """
    context = f'Their existing project idea: "{existing_idea}"\n' if existing_idea else ""
    prompt = (
        f"A student is revising their MCA project plan (current stage: {session_status}).\n"
        f"{context}"
        f'Their revision message: "{message}"\n\n'
        "Classify into exactly one category:\n"
        "- idea: they want to COMPLETELY PIVOT to a totally different project (different domain or purpose entirely)\n"
        "- feasibility: they want to change the programming language, framework, or technology stack choices\n"
        "- roadmap: anything else — removing/adding a feature, adjusting scope, changing timeline, or re-analysing the current idea with minor modifications\n\n"
        "Reply with ONLY one word: idea, feasibility, or roadmap"
    )
    response = get_client().chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=10,
    )
    scope = response.choices[0].message.content.strip().lower()
    return scope if scope in ("idea", "feasibility", "roadmap") else "roadmap"


def run_intent_summary_agent(conversation_history: list[dict]) -> str:
    """One-shot call: synthesise 1-2 sentences describing what the student wants to build,
    drawn from their messages across the full discussion."""
    user_lines = []
    for msg in conversation_history:
        if msg["role"] == "user":
            text = msg["content"].get("text") or msg["content"].get("summary") or ""
            if text:
                user_lines.append(text)

    if not user_lines:
        return ""

    context = "\n".join(f"- {line}" for line in user_lines)

    messages = [
        {
            "role": "system",
            "content": (
                "You write a concise project idea brief based on a student's messages. "
                "Describe the project directly — do NOT refer to 'the student' or use third person. "
                "Write it as a project description, starting with what is being built "
                "(e.g. 'A dynamic chatbot that...' or 'The project is a voice-enabled...'). "
                "Include the core concept, key features, and any specific technologies or design "
                "choices mentioned. Be concrete and specific. "
                "3 to 5 sentences is ideal. Do not ask questions."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Here are the messages describing the project idea:\n\n{context}\n\n"
                "Write a project description brief based on these."
            ),
        },
    ]

    response = get_client().chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.3,
        max_tokens=300,
    )
    return response.choices[0].message.content.strip()


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
            "content": f"[PROJECT CONTEXT]\n{json.dumps(project_context, ensure_ascii=False)}",
        })
        messages.append({
            "role": "assistant",
            "content": "I have the project context. What would you like to know?",
        })

    # Replay prior conversation — cap to last 10 exchanges to stay within token limits
    text_history = [
        {"role": row["role"], "content": text}
        for row in conversation_history
        if (text := (row["content"].get("text") or row["content"].get("summary") or ""))
    ]
    for entry in text_history[-10:]:
        messages.append(entry)

    messages.append({"role": "user", "content": student_message})

    response = get_client().chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.5,
    )
    return response.choices[0].message.content.strip()
