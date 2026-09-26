# AgentFlow — v0.1 Architecture & Implementation Plan

## Top-Level Overview

AgentFlow is an AI Supervisor for software development workflows. It receives a developer
task, decomposes it, coordinates three specialised agents (Code Intelligence, Test & QA,
Debug & Review) in parallel where possible, recovers from failures, and produces an
evidence-backed result. The system is a working prototype that demonstrates real
orchestration value to a technical evaluator.

**Scope:** Full-stack TypeScript — Express/Node backend, React/Vite frontend, simulated
LLM agents (deterministic stubs that behave like real agents for demo reliability), SSE
for real-time updates.

**Non-goals (explicit simplifications):** no auth, no DB (in-memory state), no vector
DB, no Kafka, no Docker, no real LLM calls in the core loop (agents are stubbed with
realistic latency), no microservices.

---

## 1. System Architecture

### Key Decisions

| Decision | Choice | Justification |
|---|---|---|
| Runtime | Node 20 + TypeScript strict | Single language across stack, strong typing, fast iteration |
| Backend framework | Express | Minimal, well-understood, no magic — easy to reason about middleware |
| Real-time transport | Server-Sent Events (SSE) | One-directional server→client updates fit perfectly; no WS overhead for a demo |
| State storage | In-memory Map per workflow run | Eliminates DB setup while keeping state fully inspectable; acceptable for a prototype |
| LLM integration | Simulated agents with realistic delay | Deterministic demo + no API key dependency; real LLM calls can be swapped in later |
| Frontend | React 18 + Vite + TailwindCSS | Fast dev, excellent CSS utility classes for achieving Linear/Vercel-level polish |
| State management | Zustand (lightweight) | No Redux boilerplate; readable selectors; works well with SSE streaming |
| Build | ESBuild (via Vite) | Fast cold starts critical for live demo |

### Deliberate Simplifications

- **In-memory state:** A production system would use Redis or Postgres. For this
  prototype the trade-off is acceptable because (a) no horizontal scaling is needed, and
  (b) it removes all DB setup friction during a demo.
- **Simulated agents:** Real LLM calls introduce unpredictable latency and token cost.
  Stubs replicate the full contract surface with controlled timing so the demo is
  always repeatable.
- **No auth:** Out of scope — the evaluator is looking at orchestration sophistication,
  not login flows.

---

## 2. Frontend Architecture

### Component Hierarchy

```
App
├── Layout
│   ├── Sidebar (navigation, recent runs)
│   └── TopBar (run status badge, GitHub-style breadcrumb)
├── pages/
│   ├── NewRunPage          — task input, decomposition preview
│   ├── RunDetailPage       — live workflow view (primary demo screen)
│   └── EvidenceLedgerPage  — read-only audit log for completed run
└── components/
    ├── TaskInput           — textarea + submit, keyboard shortcut
    ├── PipelineView        — horizontal stage swimlane (the "wow" component)
    │   ├── StageNode       — individual agent card with status ring
    │   └── DependencyEdge  — animated connector between stages
    ├── AgentCard           — detailed panel for one agent's live output
    ├── StatusBadge         — colour-coded pill (pending/running/done/failed/recovering)
    ├── EvidenceTable       — sortable ledger rows
    ├── ApprovalBanner      — sticky bar requiring human sign-off
    └── LogStream           — auto-scrolling, syntax-highlighted log panel
```

### State Management (Zustand)

```
useRunStore
  activeRunId: string | null
  runs: Map<string, RunState>
  -- actions --
  createRun(task)
  applyEvent(runId, SSEEvent)   ← single reducer for all SSE events
  approveRun(runId)
```

`RunState` mirrors the backend `WorkflowRun` type exactly (shared via `contracts.ts`).
All SSE events are typed discriminated unions — the reducer switches on `event.type`.

### Data Flow

```
User submits task
  → POST /api/runs
  → GET /api/runs/:id/events  (SSE stream opens)
  → applyEvent() on every message → Zustand store updates
  → Components are reactive via useRunStore selectors
  → ApprovalBanner renders when state === "AWAITING_APPROVAL"
  → User clicks Approve → PATCH /api/runs/:id/approve
```

### Polish Priorities (demo-critical)

1. **PipelineView** — the core visual. Smooth status ring animations (CSS keyframes),
   dependency edges that "light up" green/red as stages complete.
2. **LogStream** — real-time streaming feel with typewriter-like append. Gives the
   impression of a live system even with stubs.
3. **StatusBadge** — every state transition must have a distinct colour + micro-animation
   (pulse on RUNNING, checkmark pop on DONE, shake on FAILED).
4. **ApprovalBanner** — high-contrast, sticky, cannot be missed. This is the
   human-in-the-loop moment evaluators will watch closely.
5. **Dark theme** — Linear/Vercel aesthetic. Slate-900 background, subtle borders,
   monospace log font.

---

## 3. Backend Architecture

### Module Boundaries

```
backend/src/
├── server.ts              — Express app factory, middleware, route registration
├── routes/
│   ├── runs.ts            — POST /runs, GET /runs/:id, PATCH /runs/:id/approve
│   └── events.ts          — GET /runs/:id/events (SSE)
├── supervisor/
│   ├── supervisor.ts      — Orchestrator: drives the state machine
│   ├── stateMachine.ts    — Pure state transition functions (no side effects)
│   ├── taskDecomposer.ts  — Splits raw task into subtasks + dependency graph
│   ├── scheduler.ts       — Determines which subtasks are ready to run in parallel
│   └── evidenceLedger.ts  — Append-only log of all agent results + decisions
├── agents/
│   ├── agentRunner.ts     — Spawns agent, wraps result in AgentResult type
│   ├── codeIntelligence.ts — Stub: analyses code, returns findings
│   ├── testQA.ts          — Stub: runs tests, returns pass/fail + coverage
│   └── debugReview.ts     — Stub: reviews failures, proposes fixes
├── types/
│   └── contracts.ts       — ALL shared types (WorkflowRun, AgentResult, SSEEvent, …)
└── store/
    └── runStore.ts        — In-memory Map<runId, WorkflowRun>, thread-safe updates
```

### Communication Pattern

The Supervisor is the **only** component that writes to RunStore and emits SSE events.
Agents are pure async functions: `(input: AgentInput) => Promise<AgentResult>`.
The Supervisor awaits them, writes results to the ledger, then drives the state machine.

```
Supervisor.run(task)
  → taskDecomposer.decompose(task) → SubTask[]
  → loop: scheduler.getReady(subtasks) → parallel Promise.all(agentRunner.run(…))
  → each result → evidenceLedger.append()
  → stateMachine.transition(currentState, event) → nextState
  → runStore.update(runId, nextState)
  → sseEmitter.emit(runId, event)
```

### Failure Handling Location

- **Agent-level errors** are caught in `agentRunner.ts` — always returns `AgentResult`
  (never throws). Failed results have `status: "failed"` and a `reason` string.
- **Retry/recovery logic** lives in `supervisor.ts` — it checks `AgentResult.status`
  and decides whether to invoke `debugReview` agent or escalate.
- **State machine guards** in `stateMachine.ts` prevent invalid transitions (e.g. you
  cannot go from DONE → RUNNING). This is the safety net.

---

## 4. Supervisor State Machine

### States

| State | Meaning |
|---|---|
| `IDLE` | Run created, not yet started |
| `DECOMPOSING` | Task decomposer running |
| `SCHEDULING` | Determining which subtasks are ready |
| `RUNNING` | One or more agents executing in parallel |
| `COLLECTING` | All agents for this wave done, aggregating results |
| `VERIFYING` | Checking all subtasks passed their acceptance criteria |
| `RECOVERY` | A failure was detected; Debug & Review agent invoked |
| `AWAITING_APPROVAL` | All criteria met; waiting for human sign-off |
| `DONE` | Human approved; run complete |
| `FAILED` | Recovery exhausted (max retries hit) |

### Transitions

```
IDLE → DECOMPOSING           on: run started
DECOMPOSING → SCHEDULING     on: decomposition complete
SCHEDULING → RUNNING         on: ready tasks identified (≥1)
RUNNING → COLLECTING         on: all parallel agents in wave complete
COLLECTING → VERIFYING       on: results aggregated
VERIFYING → SCHEDULING       on: more subtasks remain (dependency-unblocked)
VERIFYING → RECOVERY         on: any subtask result.status === "failed"
VERIFYING → AWAITING_APPROVAL on: all subtasks passed + criteria met
RECOVERY → SCHEDULING        on: debug agent produced a fix (retry ≤ maxRetries)
RECOVERY → FAILED            on: retries exhausted OR debug agent failed
AWAITING_APPROVAL → DONE     on: human approved
AWAITING_APPROVAL → RECOVERY on: human rejected (treated as a new failure)
DONE → (terminal)
FAILED → (terminal)
```

### Retry Bounding

- Each subtask carries `retryCount: number` (starts at 0).
- `MAX_RETRIES = 2` (configurable constant in `supervisor.ts`).
- On `VERIFYING → RECOVERY`: `retryCount++`; if `retryCount > MAX_RETRIES` →
  transition to `FAILED` instead.
- This guarantees the demo never loops infinitely.

---

## 5. Agent Responsibilities

### Code Intelligence Agent

**Input:**
```typescript
{
  subtaskId: string;
  type: "CODE_ANALYSIS";
  payload: {
    taskDescription: string;
    codeContext: string;      // simulated: a short code snippet
  }
}
```

**Output:**
```typescript
{
  subtaskId: string;
  agentType: "CODE_INTELLIGENCE";
  status: "passed" | "failed";
  findings: Finding[];          // list of identified issues or confirmations
  suggestedChanges: Change[];   // proposed code edits
  durationMs: number;
}
```

**Done means:** All code in scope has been analysed; every finding has a severity;
suggested changes cover all HIGH severity findings.

---

### Test & QA Agent

**Input:**
```typescript
{
  subtaskId: string;
  type: "TEST_EXECUTION";
  payload: {
    taskDescription: string;
    targetModule: string;
    testSuite: string;          // simulated: test identifiers
  }
}
```

**Output:**
```typescript
{
  subtaskId: string;
  agentType: "TEST_QA";
  status: "passed" | "failed";
  testResults: TestResult[];    // per-test pass/fail
  coveragePercent: number;
  failureDetails?: string;      // present when status === "failed"
  durationMs: number;
}
```

**Done means:** All tests in suite executed; coverage reported; no test is in an
ambiguous state.

---

### Debug & Review Agent

**Input:**
```typescript
{
  subtaskId: string;
  type: "DEBUG_REVIEW";
  payload: {
    failedSubtaskId: string;
    failureReason: string;
    agentOutput: AgentResult;   // the failing agent's last output
    retryCount: number;
  }
}
```

**Output:**
```typescript
{
  subtaskId: string;
  agentType: "DEBUG_REVIEW";
  status: "passed" | "failed";
  rootCause: string;
  proposedFix: string;
  confidence: "high" | "medium" | "low";
  durationMs: number;
}
```

**Done means:** Root cause identified; a concrete fix is proposed; the failing subtask
has been re-queued with the fix applied (or escalated if confidence === "low" and
retries exhausted).

---

## 6. Handoff Contracts

### WorkflowRun (primary shared type)

```typescript
interface WorkflowRun {
  id: string;                          // uuid
  task: string;                        // raw developer task
  state: SupervisorState;
  subtasks: SubTask[];
  evidenceLedger: LedgerEntry[];
  createdAt: string;                   // ISO timestamp
  updatedAt: string;
  approvalRequired: boolean;
  approvedAt?: string;
  failureReason?: string;
}
```

### SubTask

```typescript
interface SubTask {
  id: string;
  description: string;
  agentType: AgentType;               // "CODE_INTELLIGENCE" | "TEST_QA" | "DEBUG_REVIEW"
  status: SubTaskStatus;              // "pending" | "running" | "passed" | "failed" | "skipped"
  dependencies: string[];             // ids of subtasks that must pass first
  retryCount: number;
  result?: AgentResult;
}
```

### LedgerEntry (Evidence Ledger)

```typescript
interface LedgerEntry {
  id: string;
  runId: string;
  subtaskId: string;
  agentType: AgentType;
  timestamp: string;
  event: LedgerEventType;             // "AGENT_STARTED" | "AGENT_COMPLETED" | "RETRY_TRIGGERED"
                                      // | "RECOVERY_STARTED" | "APPROVAL_REQUESTED"
                                      // | "APPROVED" | "REJECTED" | "RUN_FAILED"
  payload: AgentResult | Record<string, unknown>;
}
```

### SSEEvent (stream to frontend)

```typescript
type SSEEvent =
  | { type: "RUN_STATE_CHANGED"; runId: string; state: SupervisorState }
  | { type: "SUBTASK_UPDATED"; runId: string; subtask: SubTask }
  | { type: "LEDGER_ENTRY_ADDED"; runId: string; entry: LedgerEntry }
  | { type: "APPROVAL_REQUIRED"; runId: string }
  | { type: "RUN_COMPLETE"; runId: string; state: "DONE" | "FAILED" };
```

---

## 7. API Design

### Conventions

- All responses: `Content-Type: application/json`
- Success: HTTP 200/201 with `{ data: T }`
- Error: HTTP 4xx/5xx with `{ error: { code: string; message: string } }`
- Run IDs are UUIDs generated server-side
- SSE stream uses `data: <JSON>\n\n` framing; `event:` field matches `SSEEvent.type`

### Endpoints

#### POST /api/runs
Create and start a new workflow run.

Request:
```json
{ "task": "Add rate limiting to the /api/users endpoint" }
```
Response 201:
```json
{ "data": { "id": "uuid", "state": "IDLE", "task": "...", "subtasks": [], "evidenceLedger": [] } }
```
Error 400: `{ "error": { "code": "INVALID_TASK", "message": "task must be a non-empty string" } }`

---

#### GET /api/runs/:id
Fetch current snapshot of a run (for page load / reconnect).

Response 200: `{ "data": WorkflowRun }`
Error 404: `{ "error": { "code": "RUN_NOT_FOUND", "message": "..." } }`

---

#### GET /api/runs/:id/events
SSE stream of all events for this run from current time forward.
On connect, replays all existing `LedgerEntry` events so the client can hydrate.

Headers: `Accept: text/event-stream`
Stream format:
```
event: SUBTASK_UPDATED
data: {"type":"SUBTASK_UPDATED","runId":"...","subtask":{...}}

event: RUN_STATE_CHANGED
data: {"type":"RUN_STATE_CHANGED","runId":"...","state":"RUNNING"}
```

---

#### PATCH /api/runs/:id/approve
Human approval (or rejection) of a run awaiting sign-off.

Request:
```json
{ "approved": true }
```
Response 200: `{ "data": { "id": "uuid", "state": "DONE" } }`
Error 409: `{ "error": { "code": "NOT_AWAITING_APPROVAL", "message": "..." } }`

---

#### GET /api/runs
List recent runs (for sidebar).

Response 200: `{ "data": [{ id, task, state, createdAt }] }`

---

## 8. Folder Structure

```
agentflow/
├── agentflow-plan.md
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── server.ts
│   │   ├── store/
│   │   │   └── runStore.ts
│   │   ├── supervisor/
│   │   │   ├── supervisor.ts
│   │   │   ├── stateMachine.ts
│   │   │   ├── taskDecomposer.ts
│   │   │   ├── scheduler.ts
│   │   │   └── evidenceLedger.ts
│   │   ├── agents/
│   │   │   ├── agentRunner.ts
│   │   │   ├── codeIntelligence.ts
│   │   │   ├── testQA.ts
│   │   │   └── debugReview.ts
│   │   ├── routes/
│   │   │   ├── runs.ts
│   │   │   └── events.ts
│   │   └── types/
│   │       └── contracts.ts
│   └── tests/
│       ├── stateMachine.test.ts
│       ├── taskDecomposer.test.ts
│       ├── scheduler.test.ts
│       └── supervisor.integration.test.ts
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── store/
│       │   └── runStore.ts
│       ├── api/
│       │   ├── client.ts          — typed fetch wrapper
│       │   └── sse.ts             — SSE connection manager
│       ├── pages/
│       │   ├── NewRunPage.tsx
│       │   ├── RunDetailPage.tsx
│       │   └── EvidenceLedgerPage.tsx
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   ├── TopBar.tsx
│       │   ├── TaskInput.tsx
│       │   ├── PipelineView/
│       │   │   ├── index.tsx
│       │   │   ├── StageNode.tsx
│       │   │   └── DependencyEdge.tsx
│       │   ├── AgentCard.tsx
│       │   ├── StatusBadge.tsx
│       │   ├── EvidenceTable.tsx
│       │   ├── ApprovalBanner.tsx
│       │   └── LogStream.tsx
│       └── types/
│           └── contracts.ts       — symlinked or copied from backend types
```

---

## 9. Demo Scenario

### The Scenario: "Add Rate Limiting to the Auth Endpoint"

This scenario is **fully deterministic** — all timing and outcomes are hard-coded in
agent stubs. No randomness.

**Task submitted:** `"Add rate limiting to the /api/auth/login endpoint to prevent brute-force attacks"`

**Decomposed subtasks (always exactly these 3):**

| # | ID | Description | Agent | Dependencies |
|---|---|---|---|---|
| 1 | `subtask-001` | Analyse current auth endpoint code for security issues | CODE_INTELLIGENCE | none |
| 2 | `subtask-002` | Run security test suite against auth endpoint | TEST_QA | none |
| 3 | `subtask-003` | Review and verify rate limiting implementation | CODE_INTELLIGENCE | 001, 002 |

**Happy Path (Wave 1: subtasks 1 & 2 run in parallel):**
- `subtask-001` completes in ~2.5s → status: passed
- `subtask-002` completes in ~3.5s → status: **FAILED** (test "should reject after 5 attempts" fails)

**Recovery Cycle (the controlled failure):**
- Supervisor transitions to RECOVERY
- Debug & Review agent invoked for `subtask-002` (~2s)
- Root cause: "Rate limit middleware not yet applied; test expectation correct"
- Fix proposed: "Apply express-rate-limit to /api/auth/login before handler"
- `subtask-002` retried → passes (~2s)

**Wave 2:**
- `subtask-003` runs (both dependencies now passed) → passes (~2s)
- Supervisor transitions to AWAITING_APPROVAL
- ApprovalBanner appears

**Human approves → DONE**

**Total demo runtime:** ~14 seconds of visible activity, fully repeatable.

### Why This Works as a Demo
- Evaluators see: task decomposition, parallel execution, real-time pipeline view,
  a test failure, automatic recovery, retry success, and human approval — the full loop.
- Nothing is random — every state transition is deterministic.
- The failure is obviously meaningful (test fails because the feature isn't implemented
  yet), making the recovery narrative easy to follow.

---

## 10. Implementation Order

Each sub-task below is designed to be implemented and verified independently.
A demoable core loop exists after Sub-Task 4.

### Sub-Task 1: Shared Types & Contracts [ ] pending
**Intent:** Define all TypeScript interfaces in `contracts.ts`. Everything else depends
on these shapes. Getting them right first prevents type-churn throughout the build.

**Expected Outcomes:**
- `backend/src/types/contracts.ts` exports all types: `WorkflowRun`, `SubTask`,
  `AgentResult`, `LedgerEntry`, `SSEEvent`, `SupervisorState`, `AgentType`, etc.
- Types compile with `strict: true`, no `any`.
- Frontend `src/types/contracts.ts` is identical (copied; kept in sync manually for now).

**Todo List:**
1. Write all types in `backend/src/types/contracts.ts`
2. Copy to `frontend/src/types/contracts.ts`
3. Run `tsc --noEmit` to confirm zero errors

**Relevant Context:** Section 6 (Handoff Contracts) defines the exact shapes.

---

### Sub-Task 2: Backend Scaffold + In-Memory Store [ ] pending
**Intent:** Stand up the Express server, configure middleware, register route placeholders,
and implement `runStore.ts`. This is the skeleton everything else attaches to.

**Expected Outcomes:**
- `npm run dev` starts server on port 3001
- `GET /api/runs` returns `{ data: [] }`
- `runStore.ts` exposes typed CRUD: `create`, `get`, `getAll`, `update`
- All routes return correct error shapes for missing resources

**Todo List:**
1. Create `backend/package.json` with deps: express, cors, uuid; devDeps: ts-node, nodemon, @types/*
2. Create `backend/tsconfig.json` (strict, ES2022 target, module commonjs)
3. Write `server.ts`: app factory, json middleware, cors, route mounting
4. Write `runStore.ts`: Map-based store with typed helpers
5. Write placeholder routes for all 5 endpoints
6. Verify with curl/httpie that all routes respond with correct shapes

**Relevant Context:** Section 3 (Backend Architecture), Section 7 (API Design).

---

### Sub-Task 3: State Machine + Task Decomposer + Scheduler [ ] pending
**Intent:** Implement the pure orchestration logic — no agents, no HTTP yet. These are
the most important functions and the easiest to unit-test in isolation.

**Expected Outcomes:**
- `stateMachine.ts`: `transition(state, event)` returns correct next state for all valid
  transitions; throws for invalid transitions.
- `taskDecomposer.ts`: given the demo task string, always returns exactly the 3 defined
  subtasks with correct dependencies.
- `scheduler.ts`: `getReadySubtasks(subtasks)` returns only subtasks whose dependencies
  are all `"passed"` and whose own status is `"pending"`.
- All three modules have passing unit tests.

**Todo List:**
1. Implement `stateMachine.ts` with full transition table
2. Implement `taskDecomposer.ts` (hardcoded demo decomposition; extensible later)
3. Implement `scheduler.ts`
4. Write `tests/stateMachine.test.ts`
5. Write `tests/taskDecomposer.test.ts`
6. Write `tests/scheduler.test.ts`
7. Run tests: all pass

**Relevant Context:** Section 4 (State Machine), Section 9 (Demo Scenario).

---

### Sub-Task 4: Agent Stubs + Supervisor + SSE Emitter [ ] pending
**Intent:** Wire the Supervisor loop using the stubs. After this sub-task the full backend
pipeline runs end-to-end: submit a task → supervisor drives state machine → agents
execute → evidence ledger updated → SSE stream emits events.

**Expected Outcomes:**
- All three agent stubs implement the correct input/output contracts with realistic delays.
- `supervisor.ts` drives the full demo scenario including the controlled failure and recovery.
- `evidenceLedger.ts` appends entries at every key event.
- SSE stream on `GET /api/runs/:id/events` emits typed events in real time.
- `POST /api/runs` + `GET /api/runs/:id/events` can be tested with curl and produce the
  full demo sequence.
- Integration test in `tests/supervisor.integration.test.ts` passes.

**Todo List:**
1. Implement `agentRunner.ts` (wraps agent call, catches errors, returns `AgentResult`)
2. Implement `codeIntelligence.ts` stub (subtask-001 behavior)
3. Implement `testQA.ts` stub (subtask-002: fails on first call, passes on retry)
4. Implement `debugReview.ts` stub (subtask-003 / recovery behavior)
5. Implement `evidenceLedger.ts` (append-only, emits events on append)
6. Implement `supervisor.ts` (full orchestration loop with retry logic)
7. Implement SSE route in `routes/events.ts` with replay-on-connect
8. Wire approval route in `routes/runs.ts`
9. Write `tests/supervisor.integration.test.ts`
10. Manual end-to-end test with curl confirming full demo sequence

**Relevant Context:** Sections 3, 4, 5, 6, 7, 9.

---

### Sub-Task 5: Frontend Scaffold + Store + API Client [ ] pending
**Intent:** Create the Vite/React project, implement Zustand store, typed API client,
and SSE connection manager. No UI polish yet — just the data layer.

**Expected Outcomes:**
- `npm run dev` starts frontend on port 5173 with proxy to backend 3001
- `useRunStore` correctly applies all SSE event types
- `api/client.ts` typed fetch wrapper returns discriminated union (success/error)
- `api/sse.ts` connects to stream, calls `applyEvent` on each message, reconnects on drop
- Basic routing: `/` → NewRunPage, `/runs/:id` → RunDetailPage

**Todo List:**
1. Create `frontend/package.json`: react, react-dom, zustand, react-router-dom; devDeps: vite, tailwindcss, @types/*
2. Create `vite.config.ts` with `/api` proxy to localhost:3001
3. Configure TailwindCSS
4. Write `store/runStore.ts` Zustand store
5. Write `api/client.ts` typed fetch wrapper
6. Write `api/sse.ts` SSE manager
7. Write `App.tsx` with router
8. Write stub page components (empty but routable)

**Relevant Context:** Section 2 (Frontend Architecture), Section 6 (SSEEvent types).

---

### Sub-Task 6: Core UI — PipelineView + AgentCard + StatusBadge [ ] pending
**Intent:** Build the primary demo screen. This is what evaluators will watch. Polish is
critical here. Invest time in animations and visual clarity.

**Expected Outcomes:**
- `RunDetailPage` shows PipelineView with 3 stage nodes connected by edges
- Each `StageNode` shows: agent name, status ring (animated pulse when RUNNING), duration
- `StatusBadge` has distinct colour + animation for all 5 states
- `DependencyEdge` animates green when upstream completes
- `AgentCard` expands on click showing full agent output
- `LogStream` auto-scrolls with real-time appended entries
- Layout is dark-themed, matches Linear/Vercel aesthetic

**Todo List:**
1. Implement `StatusBadge` with Tailwind animations
2. Implement `StageNode` with status ring
3. Implement `DependencyEdge` (SVG line with stroke-dashoffset animation)
4. Implement `PipelineView` (positions nodes in dependency order using flexbox)
5. Implement `AgentCard` (expandable detail panel)
6. Implement `LogStream` (auto-scroll, monospace, colour-coded by event type)
7. Assemble `RunDetailPage`
8. Test against live backend: visual confirmation of all state transitions

**Relevant Context:** Section 2 (Component Hierarchy, Polish Priorities).

---

### Sub-Task 7: Remaining UI — NewRunPage + ApprovalBanner + EvidenceLedgerPage [ ] pending
**Intent:** Complete the UI surface. The Approval flow is demo-critical.

**Expected Outcomes:**
- `NewRunPage` has polished task input with submit shortcut (Cmd+Enter)
- On submit, navigates to RunDetailPage and opens SSE stream
- `ApprovalBanner` is sticky, high-contrast, appears only in AWAITING_APPROVAL state,
  buttons call PATCH /api/runs/:id/approve
- `EvidenceLedgerPage` shows sortable table of all ledger entries with event type badges
- `Sidebar` shows recent runs with status indicators
- `TopBar` shows current run state and breadcrumb

**Todo List:**
1. Implement `TaskInput` + `NewRunPage`
2. Navigate-on-submit to RunDetailPage
3. Implement `ApprovalBanner` (conditional render from store state)
4. Implement `EvidenceLedgerPage` + `EvidenceTable`
5. Implement `Sidebar` with run list
6. Implement `TopBar`
7. Wire `Layout` wrapping all pages
8. Final visual pass: spacing, typography, dark theme consistency

**Relevant Context:** Section 2 (Component Hierarchy, Data Flow), Section 7 (PATCH endpoint).

---

### Sub-Task 8: Tests, Error Handling, and Demo Hardening [ ] pending
**Intent:** Ensure the demo never breaks. Add error boundaries, loading states, reconnect
logic, and verify the full scenario runs cleanly from scratch.

**Expected Outcomes:**
- All unit tests pass (`npm test`)
- Frontend shows loading skeleton while SSE connects
- SSE reconnects automatically if connection drops
- API errors display inline (not console.error only)
- React error boundary catches render failures
- Full demo scenario runs clean 3 times in a row from `POST /api/runs`
- README documents how to run the project locally

**Todo List:**
1. Add React error boundary to RunDetailPage
2. Add loading skeleton to PipelineView
3. Verify SSE reconnect in `api/sse.ts`
4. Add inline error display to TaskInput
5. Run full test suite; fix any failures
6. Run demo scenario 3 times, confirm identical output each time
7. Write README: prerequisites, `npm install`, `npm run dev` for both, demo instructions

**Relevant Context:** Sections 3 (Failure Handling), 2 (Data Flow), 9 (Demo Scenario).

---

## Status Summary

| Sub-Task | Description | Status |
|---|---|---|
| 1 | Shared Types & Contracts | [ ] pending |
| 2 | Backend Scaffold + Store | [ ] pending |
| 3 | State Machine + Decomposer + Scheduler | [ ] pending |
| 4 | Agent Stubs + Supervisor + SSE | [ ] pending |
| 5 | Frontend Scaffold + Store + API | [ ] pending |
| 6 | Core UI — PipelineView + AgentCard | [ ] pending |
| 7 | Remaining UI — NewRunPage + Approval | [ ] pending |
| 8 | Tests + Error Handling + Demo Hardening | [ ] pending |
