# Agent Mode — AgentFlow Coding Rules

This file provides guidance to agents when working with code in this repository.

## Boundary: Supervisor vs Agent (enforce in every edit)

- `supervisor.ts` is the only place that calls `runStore.update()` and `sseEmitter.emit()`.
- Agent files (`codeIntelligence.ts`, `testQA.ts`, `debugReview.ts`) are pure async functions — no store access, no SSE, no side effects beyond returning `AgentResult`.
- `agentRunner.ts` wraps every agent call in try/catch and always returns `AgentResult` (never rethrows).

## Type Source of Truth

- Import all shared types from `backend/src/types/contracts.ts` — never redefine `SupervisorTaskState`, `StateTransition`, `AgentResult`, or `ApiError` locally.
- Frontend copies `contracts.ts` manually; update both files when types change.

## State Machine Rule

- `stateMachine.ts` must be side-effect free — no I/O, no imports from store or emitter.
- Invalid state transitions (e.g., `DONE → RUNNING`) must throw, not silently no-op.

## Retry Guard (copy this pattern exactly)

```typescript
// In supervisor.ts — always check before retrying
if (state.retryCount >= state.maxRetries) {
  return transition(state, 'RETRIES_EXHAUSTED'); // → FAILED
}
```

## API Error Shape

Every error response must use `ApiError` from `contracts.ts`:
```typescript
res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND', taskId: id } satisfies ApiError);
```

## Demo Determinism

- Agent stubs use fixed `setTimeout` delays — no `Math.random()`.
- `taskDecomposer.ts` always returns the same 3 subtasks for the canonical demo task. Pattern-match on the task string; return hardcoded subtasks.
- `testQA` stub fails on `retryCount === 0`, passes on retry — controlled by `AgentTask.context.retryCount`.

## SSE Replay on Connect

`GET /api/runs/:id/events` must replay all existing `evidenceLedger` entries as SSE events before switching to live stream — this is how the client hydrates on page reload.

## Logging

- Never `console.error` only. Log the error and surface it in the `ApiError` response or the evidence ledger entry.
- Use ISO timestamps (`new Date().toISOString()`) — never `Date.now()` in types that will be serialized.
