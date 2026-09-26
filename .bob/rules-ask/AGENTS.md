# Ask Mode — AgentFlow Documentation Context

This file provides guidance to agents when working with code in this repository.

## Where Things Actually Live

- **`agentflow-plan.md`** in the project root is the canonical architecture reference — more detailed than the README (which is currently empty).
- **`backend/src/types/contracts.ts`** is the only file that currently exists in the backend — all other backend modules are yet to be built.
- The frontend directory does not yet exist; it is described in `agentflow-plan.md` Section 8.

## Counterintuitive Structure Notes

- `frontend/src/types/contracts.ts` is a manual copy of the backend types — there is no symlink or shared package. Both files must be kept in sync by hand.
- The backend runs on port **3001**, not the typical 3000. The Vite dev server proxies `/api` to `localhost:3001`.
- The SSE endpoint (`GET /api/runs/:id/events`) replays historical ledger entries on connect — it is not a pure forward-only stream. This is the hydration mechanism (no separate fetch needed).

## State Machine vs Plan States

- `agentflow-plan.md` Section 4 shows states like `IDLE`, `DECOMPOSING`, `COLLECTING` — these are planning-level names.
- The actual `SupervisorState` type in `contracts.ts` uses: `RECEIVED`, `PLANNING`, `ANALYZING`, `IMPLEMENTING`, `TESTING`, `FAILED`, `RECOVERING`, `RETESTING`, `VERIFYING`, `AWAITING_APPROVAL`, `VERIFIED`.
- `VERIFIED` corresponds to what the plan calls `DONE`. When answering questions about states, use the `contracts.ts` names.

## Agent Naming

- Plan uses `"CODE_INTELLIGENCE"`, `"TEST_QA"`, `"DEBUG_REVIEW"` — these match the `AgentName` type in `contracts.ts` exactly.
- The plan's `SubTask.agentType` field uses `AgentType` (string union) — same values.

## Demo Scenario

- The canonical demo task is: `"Add rate limiting to the /api/auth/login endpoint to prevent brute-force attacks"`.
- It always decomposes into exactly 3 subtasks; `subtask-002` (TEST_QA) always fails on first run and passes on retry. This is intentional and hardcoded.
- Total visible demo runtime is ~14 seconds.
