# Sub-Agent Workflow Pattern Notes

---

## What kind of "sub-agent" system this is

This is **not** a multi-LLM-agent system (no agent-to-agent API calls at runtime). Instead, it
is a structured protocol for splitting work into independent scoped tasks and running those
tasks as discrete units — either in parallel or sequentially depending on dependencies.

The pattern's real contribution is the **up-front dependency analysis + approval gate**
discipline — it prevents the common failure mode where an automated system produces a lot of
output before a human can verify the inputs are correct.

---

## Agent roles

There is one meta-role and two operational roles:

| Role | Job |
|---|---|
| **Orchestrator** | Reads the feature spec, breaks it into tasks, identifies file dependencies, proposes the wave plan, waits for human approval, then spawns agents and monitors completion |
| **Task agent (parallel)** | Receives a scoped prompt: exactly which files to create/modify, what they must do, which design spec section to match. Builds only those files, commits its own work, stops. |
| **Merge agent (sequential)** | Runs after all parallel agents in a wave complete. Checks cross-file correctness (imports, no boundary violations), runs the gate condition (e.g., type-checks), and makes a single merge commit if needed. |

There is no dedicated "critic" or "reviewer" role as a separate agent. Review happens through
the human approval gate before execution starts, and the merge agent does a consistency pass
at the end.

---

## Trigger and handoff logic

The workflow proceeds in this fixed sequence:

```
1. Human gives a task or phase description
        ↓
2. Orchestrator reads CLAUDE.md (always, before doing anything)
        ↓
3. Orchestrator produces a "strategy":
   - which sub-agents it will spawn
   - what each one builds / produces
   - which agents are parallel vs sequential (the "wave plan")
        ↓
4. Human must explicitly approve ("approved" / "go ahead")
   — no work begins before this gate
        ↓
5. Wave 1: run all independent agents in parallel
        ↓
6. Wave 2 (if needed): run agents that depended on Wave 1's output
        ↓
7. Merge / consolidation step: confirm consistency across outputs → finalize
        ↓
8. Session ends; NEXT_SESSION.md updated with exact resume point
```

Parallelism is determined by **file-level dependency**: two tasks can run in parallel if they
touch no shared files. If Agent B needs to import something Agent A creates, Agent B is
sequential (Wave 2 or later).

---

## How state and context are carried between agents

**Persistent context (shared by all agents):**  
A CLAUDE.md at the project root is the single source of truth. Every sub-agent reads this
before doing anything. It contains: the scope rules, the agent roles, the output formats,
and the architectural constraints. This file acts as the "world model" every agent operates
from.

**Session-to-session handoff:**  
A NEXT_SESSION.md captures exactly where work stopped. Its structure encodes:
- What task or phase comes next
- The wave plan already worked out (Wave 1 parallel / Wave 2 sequential / etc.)
- Any preconditions confirmed (to avoid re-deriving them at the start of the next session)

This means the next session starts with zero re-derivation cost — the orchestrator reads
NEXT_SESSION.md and can immediately propose the strategy.

**No runtime shared state between agents:**  
Sub-agents do not pass messages to each other. Context flows only through the outputs one
agent writes (which become inputs to the next wave's agents) and through CLAUDE.md.
There is no shared in-memory state, no event bus, no structured handoff object at runtime.

---

## Retry and loop-back logic

This pattern does not implement automated retry loops. The human approval gate at Step 4 is
the primary quality control point. If an agent's output is wrong, the correction happens by:
1. Reviewing the agent's output
2. Either asking the agent to fix it in the same session, or noting the fix in NEXT_SESSION.md
   for the next session

The workflow is intentionally linear per session: one phase, one output set, stop. The
"revision" mechanism is state-based, not a programmatic loop.

---

## Design choices worth adapting

### 1. Human approval gate before any code
The orchestrator explicitly describes its plan and waits. No autonomous coding starts
without sign-off. This is the most important pattern — it eliminates the "AI wrote 500
lines before I could say no" problem.

**Adapt to my project:** Before running any agent in the pipeline (Idea Analyzer,
Feasibility Advisor, etc.), confirm with the student that the inputs are correct
(e.g., "you've selected idea X — shall I proceed to feasibility analysis?").

### 2. Wave-based parallelism with explicit dependency analysis
The wave plan is written down before execution. The orchestrator identifies which tasks
share files and which don't, groups independent ones into the same wave, and runs them
together. This is faster and produces cleaner commits than doing everything sequentially.

**Adapt to my project:** The four agents in my pipeline are inherently sequential (each
feeds the next), so there's no intra-run parallelism. But the wave idea applies to
partial re-runs: if only the Roadmap Planner + Critic need to re-run (because the student
revised feedback), those two can be treated as a "wave" that runs without touching the
earlier outputs.

### 3. One CLAUDE.md that every sub-agent reads first
CLAUDE.md is always read before any sub-agent runs. It defines conventions, protected
boundaries, and architectural rules. This prevents agents from drifting away from the
agreed design as the project grows.

**Adapt to my project:** A PIPELINE_SPEC.md (or similar) read by every FastAPI agent
function before constructing its prompt. It defines: what each agent is allowed to
output, what scope it must stay within, how it should format its JSON output, and what
it should refuse (off-topic questions, code generation).

### 4. Per-agent atomic commits with no bundling
Each sub-agent commits only its own files. The history stays clean: you can see exactly
what each agent produced and roll back one agent's work without losing others'.

**Adapt to my project:** Each agent output is stored as a versioned row in `agent_outputs`
(never overwriting the previous one), which serves the same purpose in a database-backed
pipeline. The revision logic (re-run only the affected agents, create a new version)
directly mirrors this atomic commit discipline.

### 5. Structured session-end document (NEXT_SESSION.md)
Instead of relying on conversation history, a machine-readable NEXT_SESSION.md is written
at the end of each session. It contains the exact wave plan, not just "what needs to be
done," so the next session can parse it and propose a strategy immediately.

**Adapt to my project:** Store session state explicitly in the `sessions` table
(`status` column) and `agent_outputs` (versioned rows). When a student returns to a
session, the backend reads these rows to know exactly where the pipeline left off and
what the next step is — no re-derivation, no re-prompting.

### 6. Protected components that agents must never modify
Certain components are explicitly marked as off-limits to any agent, ever. This prevents
drift from erasing carefully crafted logic.

**Adapt to my project:** The orchestration controller (the function that chains agents
and routes partial re-runs) should be clearly marked as the one piece of logic that is
not regenerated by any agent call — agents produce content (JSON outputs), they don't
modify the pipeline itself.

