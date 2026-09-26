# Plan Mode — AgentFlow Architecture Rules

This file provides guidance to agents when working with code in this repository.

## Immovable Architectural Constraints

- **Supervisor is the sole orchestrator.** No agent may call another agent, write to the store, or emit SSE. Adding orchestration logic inside an agent breaks the entire coordination model.
- **State machine is pure.** `stateMachine.ts` has zero side effects. All I/O happens in `supervisor.ts` after the transition is computed.
- **Evidence ledger is append-only.** `evidenceLedger.ts` never mutates or deletes entries. Audit integrity depends on this.
- **Human approval gate is mandatory.** The `AWAITING_APPROVAL → VERIFIED` transition requires an explicit `PATCH /api/runs/:id/approve`. Planning tasks that "skip" this gate for speed violates a trust feature.
- **Retries are bounded by `maxRetries`.** Planning any recovery loop must account for the cap. Infinite retries are a demo-blocker.

## Dependency Graph Shape

- Subtask dependencies are a DAG. The scheduler (`scheduler.ts`) only releases a subtask when all its `dependencies[]` entries have `status: "passed"`.
- In the canonical demo: subtasks 001 and 002 run in parallel (Wave 1, no deps); subtask 003 runs in Wave 2 (depends on 001 and 002).
- Plan new features around waves, not a linear queue.

## Communication Topology

```
HTTP routes → supervisor.ts → [agentRunner → agent stubs]
                           ↓
                      runStore (write)
                      sseEmitter (emit)
```
No component outside `supervisor.ts` writes to the store or emits events.

## Type System Constraint

- `contracts.ts` is the shared type boundary. Planning a new data structure means adding it there — never as a local interface in a route or agent file.
- `ApiError.code` is a closed union: `'NOT_FOUND' | 'INVALID_REQUEST' | 'INTERNAL_ERROR' | 'MAX_RETRIES_EXCEEDED'`. Adding new codes requires updating `contracts.ts`.

## In-Memory State Trade-off

- `runStore.ts` uses a `Map<runId, SupervisorTaskState>`. No persistence. A server restart loses all runs.
- This is intentional for demo reliability. Planning a DB layer is out of scope for v0.1.

## Frontend State Contract

- The Zustand store's `applyEvent()` is the single reducer for all SSE events — a discriminated union switch.
- `RunState` in the frontend mirrors `SupervisorTaskState` from `contracts.ts` exactly. Any change to `SupervisorTaskState` requires a corresponding frontend store update.
- `api/sse.ts` must implement reconnect-on-drop and hydrate from replayed ledger entries (not a separate REST fetch).

## UI Polish is Not Optional for This Project

- `PipelineView` with animated status rings and dependency edges is the core demo component — treat it with the same care as the state machine.
- Every `SupervisorState` value must have a distinct `StatusBadge` colour and micro-animation. Undefined states render as a broken demo.
