# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Identity

AgentFlow is an AI Supervisor for software-development orchestration — a production-quality prototype that demonstrates real orchestration value to a technical evaluator. Treat it as a real internal tool, not a hackathon script.

**Stack:** Node 20 + TypeScript strict, Express backend, React 18 + Vite + TailwindCSS frontend, Zustand state, SSE for real-time transport, in-memory Map store (no database).

---

## Commands

Backend (run from `backend/`):
```
npm run dev          # ts-node + nodemon, port 3001
npm test             # vitest (or jest — TBD when test infra is added)
npx tsc --noEmit     # type-check only
```

Frontend (run from `frontend/`):
```
npm run dev          # Vite dev server, port 5173, proxies /api → localhost:3001
npm run build        # ESBuild via Vite
```

Run a single test (once test runner is configured):
```
npx vitest run tests/stateMachine.test.ts
```

---

## Architecture Constraints (Non-Negotiable)

- **Supervisor is the only writer.** Only `supervisor.ts` writes to `runStore` and emits SSE events. Agents are pure async functions `(input: AgentInput) => Promise<AgentResult>` — they never touch the store or emit events.
- **Agents execute, never orchestrate.** Retry/recovery decisions belong in `supervisor.ts`, not inside agents.
- **`agentRunner.ts` never throws.** All agent errors are caught there; the result always has `status: "SUCCESS" | "FAILURE" | "PARTIAL"`.
- **Retries are bounded.** Always respect `SupervisorTaskState.maxRetries`. No unbounded loops.
- **Human approval is mandatory.** Every task must pass through `AWAITING_APPROVAL → DONE` with an explicit `PATCH /api/runs/:id/approve` call. This gate must never be skipped.
- **State machine is pure.** `stateMachine.ts` contains only transition logic — no side effects, no I/O. Guards reject invalid transitions (e.g., `DONE → RUNNING` must throw).
- **Demo is deterministic.** The canonical demo task (`"Add rate limiting to the /api/auth/login endpoint"`) always decomposes into exactly the same 3 subtasks with the same timing and outcomes. Do not introduce randomness into agent stubs.

---

## Shared Types — Single Source of Truth

**All** Supervisor ↔ Agent ↔ API data structures live in [`backend/src/types/contracts.ts`](backend/src/types/contracts.ts). This is the single source of truth. Key types:

- `SupervisorTaskState` — full run state returned by `GET /api/task/:id`
- `StateTransition` — audit trail / evidence ledger backbone
- `AgentResult` — every agent output, including `status`, `findings`, `testResult`, `failureReport`
- `ApiError` — **every** API error response must use this shape: `{ error, code, taskId? }`

**Never** create parallel type definitions elsewhere. The frontend's `src/types/contracts.ts` is a copy kept in sync manually.

---

## API Conventions

- All responses: `Content-Type: application/json`
- Success: `{ data: T }` (HTTP 200/201)
- Error: `{ error, code, taskId? }` using `ApiError` from `contracts.ts` (HTTP 4xx/5xx)
- Run IDs are server-generated UUIDs
- SSE stream: `data: <JSON>\n\n` framing; `event:` field matches `SSEEvent.type`
- SSE reconnect: on connect, replay all existing ledger entries so client can hydrate without a separate fetch

---

## Error Handling Rules

- Use `ApiError` shape for every API error response — never return a bare string or a different error envelope.
- Never fail silently — every caught error must be logged or surfaced where a developer can debug it.
- Agent-level errors are caught in `agentRunner.ts`; they must not propagate as unhandled exceptions.

---

## Code Style

- TypeScript `strict: true`, `ES2022` target, `module: commonjs` (backend), `module: ESNext` (frontend).
- No `any`. Use `unknown` with a type guard if the shape is truly unknown.
- ISO 8601 strings for all timestamps (no `Date` objects in shared types).
- Prefer named exports; avoid default exports for utilities and types.
- Comment *why* a simpler approach was chosen over a more complex one when the choice is non-obvious.

---

## UI Guidelines

- Dark theme only: slate-900 background, subtle borders, monospace log font.
- Aesthetic target: Linear / Vercel / GitHub / Datadog — high hierarchy, minimal decoration.
- `StatusBadge` must have distinct colour + micro-animation for every state (pulse on RUNNING, checkmark pop on DONE, shake on FAILED).
- `PipelineView` is the primary demo component — invest in CSS keyframe animations for status rings and `DependencyEdge` SVG stroke-dashoffset transitions.
- `ApprovalBanner` must be sticky, high-contrast — it is the human-in-the-loop moment evaluators will watch.

---

## Core Principles (apply to every file touched)

1. **Never claim completion without evidence.** Every "done" state requires an actual test run, file change, or recorded result.
2. **Test execution is independent verification.** A task is not VERIFIED until tests have actually been run and passed.
3. **Recovery is bounded.** Check `maxRetries` before retrying; transition to `FAILED` when exhausted.
4. **Favor clarity over cleverness.** Choose the simpler, more testable implementation; note why in a comment.
5. **Avoid unnecessary dependencies.** Prefer existing packages; justify new ones in a code comment.
