# AgentFlow v0.1 — Architecture & Implementation Plan

## Top-Level Overview

AgentFlow is an AI Supervisor for software development workflows. The Supervisor understands
a developer's task, decomposes it into subtasks, assigns them to specialist agents (Code
Intelligence, Test & QA, Debug & Review), manages dependencies, detects failures, triggers
recovery, and maintains an evidence ledger throughout. A polished real-time frontend visualises
the full orchestration live.

**Scope:** Working prototype, version 0.1. Demonstrates the full happy path plus one
controlled failure-and-recovery cycle. Not production-grade infrastructure.

**Approach:** Express + TypeScript backend with Server-Sent Events for real-time push;
React + Vite frontend with a Linear/Vercel-level polish bar. Agents are implemented as
deterministic TypeScript modules that call OpenAI (GPT-4o) for their intelligence layer.
No vector databases, no microservices, no Kafka.

---

## 1. System Architecture

### Major Decisions

| Decision | Choice | Justification |
|---|---|---|
| Runtime | Node.js / TypeScript | Matches existing skeleton, fast iteration, strong typing |
| Backend framework | Express | Minimal, well-understood, no magic; adequate for prototype |
| Real-time transport | Server-Sent Events (SSE) | One-direction server→client; simpler than WebSockets; no extra lib |
| Agent communication | In-process function calls | No network hop, no serialisation overhead, trivially testable; agents are modules not services |
| LLM provider | OpenAI GPT-4o | Best reasoning quality for code tasks; single API key; structured outputs via JSON mode |
| Frontend build | Vite + React + TypeScript | Fastest dev loop, native ESM, excellent HMR |
| State management | Zustand | Tiny, boilerplate-free, co-locates well with SSE event handlers |
| Styling | Tailwind CSS + shadcn/ui | Consistent design tokens, accessible components, Linear-like defaults |
| Monorepo layout | pnpm workspaces | backend/ and frontend/ as separate packages, shared types via a local `packages/shared` |
| Database / persistence | In-memory (Map + array) + JSON snapshot | Good enough for demo; no DB setup time; evidence ledger serialises to disk on completion |
| Auth | None | Out of scope per brief |

### Deliberate Simplifications

- **Agents run in-process** rather than as separate services. Real product would isolate them
  (e.g. worker threads or containers). Acceptable here because the demo doesn't need
  concurrent multi-user isolation.
- **LLM calls are real but bounded** — each agent prompt is designed to return structured
  JSON in one shot, not a multi-turn conversation. Reduces latency and failure surface.
- **Evidence ledger is in-memory** during a run, flushed to a JSON file on completion.
  A real product would use a database. For a demo, file output is inspectable and sufficient.
- **No streaming token output** from agents to the UI — agents return a complete structured
  result. Streaming adds complexity without adding demo value.

---

## 2. Frontend Architecture

### Component Hierarchy

```
App
├── Layout (sidebar + main area)
│   ├── Sidebar
│   │   ├── RunList (past/current runs)
│   │   └── NewRunButton
│   └── MainArea
│       ├── TaskInputPanel (task description input + submit)
│       ├── SupervisorStatusBar (current phase, overall status badge)
│       ├── PipelineView (the main demo centrepiece)
│       │   ├── PhaseTrack (horizontal timeline of phases)
│       │   ├── AgentCard × 3 (Code / Test / Debug)
│       │   │   ├── AgentStatusBadge
│       │   │   ├── AgentTaskList (assigned subtasks)
│       │   │   └── AgentOutputPanel (expandable, shows structured result)
│       │   └── DependencyArrows (SVG connectors between cards)
│       ├── EvidenceLedger (collapsible drawer)
│       │   ├── LedgerEntryList
│       │   └── LedgerEntry (timestamp, agent, event type, payload snippet)
│       └── ApprovalPrompt (modal — appears when Supervisor requests human sign-off)
```

### State Management

Zustand store: `useRunStore`

```
RunStore {
  currentRun: Run | null
  runs: Run[]           // history
  sseConnected: boolean

  actions:
    startRun(taskDescription: string) → void
    handleSseEvent(event: SseEvent) → void   // single dispatcher for all SSE events
    approveRun(runId: string) → void
    rejectRun(runId: string) → void
}
```

All SSE events flow through `handleSseEvent` which patches the relevant slice of `currentRun`.
No Redux, no Context API threading — store is a singleton accessed directly by components.

### Data Flow: API → UI

```
User submits task
  → POST /api/runs
  → response: { runId }
  → client opens GET /api/runs/:runId/events (SSE)
  → SSE events mutate Zustand store
  → React re-renders reactively
  → On REQUIRES_APPROVAL event → ApprovalPrompt modal renders
  → User clicks Approve → PUT /api/runs/:runId/approve
  → SSE stream continues with remaining events
  → On COMPLETED/FAILED event → stream closes
```

### Polish / Animation Priorities (demo-critical)

1. **Agent card status transitions** — subtle border glow pulse when an agent changes from
   IDLE → RUNNING (Framer Motion layout animation). Most visible during live demo.
2. **Evidence ledger entry slide-in** — each new entry slides in from the right with a
   200ms ease. Makes the "paper trail" feel alive.
3. **Phase track progress** — smooth fill animation on the horizontal timeline as phases
   complete. Anchors the viewer's eye to overall progress.
4. **Approval modal** — entrance animation + prominent CTA button. Must not feel like a
   browser `alert()`.
5. **Failure state** — agent card turns to a warm amber/red with a shake micro-animation
   on failure. Recovery state turns it blue/purple. Visual narrative of the recovery cycle.

---

## 3. Backend Architecture

### Module Boundaries

```
backend/src/
├── supervisor/
│   ├── supervisor.ts         ← Supervisor class: owns the state machine, coordinates agents
│   ├── stateMachine.ts       ← Pure state transition logic (no side effects)
│   ├── taskDecomposer.ts     ← LLM call: parse task description → SubTask[]
│   ├── dependencyGraph.ts    ← Builds and resolves task dependency order
│   └── evidenceLedger.ts     ← Append-only log, flushes to JSON
│
├── agents/
│   ├── agentRunner.ts        ← Common: executes an agent, wraps errors, returns AgentResult
│   ├── codeIntelligenceAgent.ts
│   ├── testQaAgent.ts
│   └── debugReviewAgent.ts
│
├── llm/
│   ├── client.ts             ← OpenAI client singleton, retry wrapper
│   └── prompts.ts            ← All system/user prompt templates (single source of truth)
│
├── routes/
│   ├── runs.ts               ← POST /api/runs, GET /api/runs, GET /api/runs/:id
│   ├── events.ts             ← GET /api/runs/:id/events (SSE)
│   └── approvals.ts          ← PUT /api/runs/:id/approve, PUT /api/runs/:id/reject
│
├── store/
│   └── runStore.ts           ← In-memory Map<runId, Run>; thread-safe append ops
│
├── types/
│   └── contracts.ts          ← All shared TypeScript interfaces (source of truth for contracts)
│
├── utils/
│   ├── logger.ts             ← Structured console logger (level, timestamp, runId)
│   └── errors.ts             ← Custom error classes: AgentError, SupervisorError, LlmError
│
└── index.ts                  ← Express app bootstrap, middleware, route registration
```

### Supervisor ↔ Agent Communication

Agents are **synchronous async functions** with a typed contract:

```typescript
type AgentFn = (input: AgentInput, ctx: AgentContext) => Promise<AgentResult>
```

The Supervisor calls `agentRunner.ts` which:
1. Validates input
2. Calls the agent function
3. Catches errors and wraps them in `AgentError`
4. Appends result (success or error) to the evidence ledger
5. Emits an SSE event for the frontend
6. Returns `AgentResult`

The Supervisor never calls agents directly — it always goes through `agentRunner`, keeping
side-effect handling (logging, SSE, ledger) in one place.

### Failure Handling

- LLM errors: `client.ts` retries up to 2 times with exponential back-off. After that, throws `LlmError`.
- Agent errors: `agentRunner.ts` catches and returns `AgentResult { status: 'failed', error }`. The Supervisor decides whether to retry or escalate.
- Supervisor retries: bounded by `MAX_RETRIES_PER_SUBTASK = 2`. After exhaustion, the Supervisor transitions to `RECOVERY_REQUESTED` and assigns the subtask to `debugReviewAgent`.
- Recovery failures: if Debug & Review also fails, the Supervisor transitions to `FAILED` and emits a terminal SSE event. No infinite loops.
- Unhandled exceptions: Express error middleware catches and logs; returns `500` with structured error body.

---

## 4. Supervisor State Machine

### States

| State | Description |
|---|---|
| `IDLE` | No run in progress |
| `DECOMPOSING` | Calling LLM to parse task → subtasks |
| `PLANNING` | Building dependency graph, assigning agents |
| `RUNNING` | Executing subtasks (may be parallel) |
| `AWAITING_APPROVAL` | Human sign-off required before continuing |
| `RECOVERY_REQUESTED` | A subtask failed; Debug agent assigned |
| `RECOVERING` | Debug agent actively working |
| `RETESTING` | Re-running Test agent after a fix |
| `VERIFYING` | Checking all requirements against evidence |
| `COMPLETED` | All requirements verified; run succeeded |
| `FAILED` | Unrecoverable failure (max retries exhausted or recovery agent failed) |

### Transitions

```
IDLE → DECOMPOSING           on: startRun(taskDescription)
DECOMPOSING → PLANNING       on: decomposition succeeded
DECOMPOSING → FAILED         on: LLM error after retries
PLANNING → RUNNING           on: dependency graph built
RUNNING → AWAITING_APPROVAL  on: supervisor decides approval checkpoint reached
RUNNING → RECOVERY_REQUESTED on: any subtask result.status === 'failed'
RUNNING → VERIFYING          on: all subtasks completed successfully
AWAITING_APPROVAL → RUNNING  on: human approved
AWAITING_APPROVAL → FAILED   on: human rejected
RECOVERY_REQUESTED → RECOVERING on: debug agent assigned
RECOVERING → RETESTING       on: debug agent returned a fix
RECOVERING → FAILED          on: debug agent failed (max retries exhausted)
RETESTING → VERIFYING        on: retest passed
RETESTING → RECOVERY_REQUESTED on: retest failed (retry counter not exhausted)
RETESTING → FAILED           on: retest failed (retry counter exhausted)
VERIFYING → COMPLETED        on: all requirements met
VERIFYING → RECOVERY_REQUESTED on: verification found gaps (and retries remain)
VERIFYING → FAILED           on: verification found gaps (retries exhausted)
COMPLETED → IDLE             on: new run started
FAILED → IDLE                on: new run started
```

### Retry Bounding

```
const MAX_RETRIES_PER_SUBTASK = 2
const MAX_RECOVERY_CYCLES = 1   // full RECOVERY → RETEST cycle allowed once per subtask
```

Each subtask carries a `retryCount: number`. Transitions to `RECOVERY_REQUESTED` only fire
if `retryCount < MAX_RETRIES_PER_SUBTASK`. When `retryCount === MAX_RETRIES_PER_SUBTASK`,
the Supervisor transitions directly to `FAILED`. This guarantees termination.

---

## 5. Agent Responsibilities

### Code Intelligence Agent

**Purpose:** Analyse the task, produce implementation code and a file manifest.

**Input:**
```typescript
{
  subtask: SubTask            // the specific subtask assigned
  taskContext: TaskContext    // full original task description + all subtask descriptions
  codebaseSnapshot?: string  // optional: relevant file contents for context
}
```

**Output:**
```typescript
{
  status: 'success' | 'failed'
  files: FileChange[]         // { path: string; content: string; operation: 'create'|'modify'|'delete' }
  summary: string             // human-readable description of what was done
  confidenceScore: number     // 0–1, self-reported
  error?: string
}
```

**"Done" means:** All file changes are specified, summary is present, confidence >= 0.7.
If confidence < 0.7, `agentRunner` treats it as a soft failure and flags for Debug Review.

---

### Test & QA Agent

**Purpose:** Generate tests for the implementation and evaluate whether they pass
(simulated in demo; real product would run them).

**Input:**
```typescript
{
  subtask: SubTask
  implementationFiles: FileChange[]   // from Code Intelligence Agent output
  testRequirements: string[]          // extracted from task context
}
```

**Output:**
```typescript
{
  status: 'success' | 'failed'
  testFiles: FileChange[]
  testResults: TestResult[]   // { name: string; passed: boolean; message?: string }
  passRate: number            // 0–1
  failedTests: string[]       // names of failed tests
  error?: string
}
```

**"Done" means:** `passRate >= 1.0` (all tests pass). Any failure triggers recovery cycle.

---

### Debug & Review Agent

**Purpose:** Given a failure report, diagnose the root cause and produce a fix.

**Input:**
```typescript
{
  subtask: SubTask
  failedTestResults: TestResult[]
  originalImplementation: FileChange[]
  errorContext: string      // combined error messages + stack traces
  previousAttempts: DebugAttempt[]   // history of prior fixes tried
}
```

**Output:**
```typescript
{
  status: 'success' | 'failed'
  diagnosis: string               // root cause explanation
  fixedFiles: FileChange[]        // corrected implementation
  changeExplanation: string       // what was changed and why
  shouldEscalate: boolean         // true if agent believes human review needed
  error?: string
}
```

**"Done" means:** `status === 'success'`, `fixedFiles` is non-empty, `shouldEscalate === false`.
If `shouldEscalate === true`, Supervisor transitions to `AWAITING_APPROVAL`.

---

## 6. Handoff Contracts

### Shared Types (packages/shared/types.ts or backend/src/types/contracts.ts)

```typescript
// ── Core identifiers ──────────────────────────────────────────────────────────

type RunId = string      // uuid v4
type SubTaskId = string  // uuid v4
type AgentType = 'code-intelligence' | 'test-qa' | 'debug-review'

// ── Run lifecycle ─────────────────────────────────────────────────────────────

type RunStatus =
  | 'IDLE' | 'DECOMPOSING' | 'PLANNING' | 'RUNNING'
  | 'AWAITING_APPROVAL' | 'RECOVERY_REQUESTED' | 'RECOVERING'
  | 'RETESTING' | 'VERIFYING' | 'COMPLETED' | 'FAILED'

interface Run {
  id: RunId
  taskDescription: string
  status: RunStatus
  subtasks: SubTask[]
  evidenceLedger: LedgerEntry[]
  createdAt: string       // ISO 8601
  completedAt?: string
  errorSummary?: string
}

// ── Subtask ───────────────────────────────────────────────────────────────────

type SubTaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'skipped'

interface SubTask {
  id: SubTaskId
  runId: RunId
  title: string
  description: string
  assignedAgent: AgentType
  dependsOn: SubTaskId[]    // ids of subtasks that must complete first
  status: SubTaskStatus
  retryCount: number
  result?: AgentResult
  createdAt: string
  startedAt?: string
  completedAt?: string
}

// ── Agent result ──────────────────────────────────────────────────────────────

interface AgentResult {
  subtaskId: SubTaskId
  agentType: AgentType
  status: 'success' | 'failed'
  payload: CodeIntelligencePayload | TestQaPayload | DebugReviewPayload
  durationMs: number
  error?: string
}

// ── Evidence Ledger ───────────────────────────────────────────────────────────

type LedgerEventType =
  | 'RUN_STARTED' | 'DECOMPOSITION_COMPLETE' | 'PLANNING_COMPLETE'
  | 'SUBTASK_ASSIGNED' | 'SUBTASK_STARTED' | 'SUBTASK_COMPLETED' | 'SUBTASK_FAILED'
  | 'RECOVERY_TRIGGERED' | 'FIX_APPLIED' | 'RETEST_STARTED' | 'RETEST_COMPLETE'
  | 'APPROVAL_REQUESTED' | 'APPROVAL_GRANTED' | 'APPROVAL_REJECTED'
  | 'VERIFICATION_COMPLETE' | 'RUN_COMPLETED' | 'RUN_FAILED'

interface LedgerEntry {
  id: string          // uuid
  runId: RunId
  subtaskId?: SubTaskId
  agentType?: AgentType
  eventType: LedgerEventType
  summary: string
  payload: Record<string, unknown>
  timestamp: string   // ISO 8601
}

// ── SSE Events ────────────────────────────────────────────────────────────────

interface SseEvent {
  type: LedgerEventType | 'HEARTBEAT'
  runId: RunId
  data: Partial<Run>   // always send the full updated run snapshot for simplicity
  timestamp: string
}

// ── File change ───────────────────────────────────────────────────────────────

interface FileChange {
  path: string
  content: string
  operation: 'create' | 'modify' | 'delete'
}
```

### Ledger Append Contract

Every agent result must be appended to the ledger via `evidenceLedger.append(entry)` **before**
any SSE event is emitted. This guarantees the ledger is always ahead of the UI, never behind.

---

## 7. API Design

### Conventions

- All endpoints prefixed: `/api`
- All responses: `Content-Type: application/json` (except SSE)
- Success responses: `{ data: T }`
- Error responses: `{ error: { code: string; message: string; details?: unknown } }`
- HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 409 Conflict, 500 Internal Server Error
- Run IDs in path params: `:runId`

### Endpoints

#### POST /api/runs
Start a new run.

Request:
```json
{ "taskDescription": "string (required, 10–2000 chars)" }
```

Response 201:
```json
{ "data": { "runId": "uuid", "status": "DECOMPOSING" } }
```

Error 400: task description missing or out of bounds
Error 409: a run is already active (demo constraint: one run at a time)

---

#### GET /api/runs
List all runs (for sidebar history).

Response 200:
```json
{
  "data": [
    { "id": "uuid", "taskDescription": "...", "status": "COMPLETED", "createdAt": "..." }
  ]
}
```

---

#### GET /api/runs/:runId
Get full run state (used on page load / reconnect).

Response 200:
```json
{ "data": Run }
```

Error 404: run not found

---

#### GET /api/runs/:runId/events
SSE stream. Client opens once after creating a run and keeps it open.

Event format:
```
event: agentflow
data: { "type": "SUBTASK_STARTED", "runId": "...", "data": { ...Run snapshot... }, "timestamp": "..." }
```

Heartbeat every 15s:
```
event: agentflow
data: { "type": "HEARTBEAT", "runId": "...", "data": {}, "timestamp": "..." }
```

Stream closes when run reaches `COMPLETED` or `FAILED`.

---

#### PUT /api/runs/:runId/approve
Human approves a run waiting at `AWAITING_APPROVAL`.

Response 200:
```json
{ "data": { "runId": "uuid", "status": "RUNNING" } }
```

Error 409: run is not in `AWAITING_APPROVAL` state

---

#### PUT /api/runs/:runId/reject
Human rejects a run waiting at `AWAITING_APPROVAL`.

Response 200:
```json
{ "data": { "runId": "uuid", "status": "FAILED" } }
```

Error 409: run is not in `AWAITING_APPROVAL` state

---

## 8. Folder Structure

```
agentflow/
├── package.json                      ← pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                          ← OPENAI_API_KEY, PORT
│   ├── src/
│   │   ├── index.ts                  ← Express bootstrap
│   │   ├── supervisor/
│   │   │   ├── supervisor.ts
│   │   │   ├── stateMachine.ts
│   │   │   ├── taskDecomposer.ts
│   │   │   ├── dependencyGraph.ts
│   │   │   └── evidenceLedger.ts
│   │   ├── agents/
│   │   │   ├── agentRunner.ts
│   │   │   ├── codeIntelligenceAgent.ts
│   │   │   ├── testQaAgent.ts
│   │   │   └── debugReviewAgent.ts
│   │   ├── llm/
│   │   │   ├── client.ts
│   │   │   └── prompts.ts
│   │   ├── routes/
│   │   │   ├── runs.ts
│   │   │   ├── events.ts
│   │   │   └── approvals.ts
│   │   ├── store/
│   │   │   └── runStore.ts
│   │   ├── types/
│   │   │   └── contracts.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── errors.ts
│   └── tests/
│       ├── supervisor.test.ts
│       ├── stateMachine.test.ts
│       ├── dependencyGraph.test.ts
│       └── agents.test.ts
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Layout.tsx
│       │   │   └── Sidebar.tsx
│       │   ├── pipeline/
│       │   │   ├── PipelineView.tsx
│       │   │   ├── PhaseTrack.tsx
│       │   │   ├── AgentCard.tsx
│       │   │   ├── AgentTaskList.tsx
│       │   │   ├── AgentOutputPanel.tsx
│       │   │   └── DependencyArrows.tsx
│       │   ├── ledger/
│       │   │   ├── EvidenceLedger.tsx
│       │   │   └── LedgerEntry.tsx
│       │   ├── task/
│       │   │   ├── TaskInputPanel.tsx
│       │   │   └── SupervisorStatusBar.tsx
│       │   └── shared/
│       │       ├── StatusBadge.tsx
│       │       ├── ApprovalPrompt.tsx
│       │       └── LoadingSpinner.tsx
│       ├── store/
│       │   └── useRunStore.ts
│       ├── api/
│       │   ├── client.ts             ← fetch wrapper with error normalisation
│       │   ├── runs.ts
│       │   └── sse.ts                ← SSE connection manager
│       ├── types/
│       │   └── contracts.ts          ← re-export or copy from backend contracts
│       └── styles/
│           └── globals.css
│
└── ecommerce-demo/
    └── README.md                     ← Documents the deterministic demo scenario
```

---

## 9. Demo Scenario

### The Scenario: "Add Product Search with Filtering"

A deterministic, repeatable scenario for the ecommerce-demo domain. All agent responses
are seeded: the Supervisor uses a `DEMO_MODE=true` env flag that substitutes real LLM
calls with deterministic fixtures stored in `backend/src/demo/fixtures.ts`.

This guarantees the demo never fails due to LLM variability or API outages.

### Task Description (what the evaluator types in)

```
Add a product search endpoint to the ecommerce API that supports filtering by
category and price range. Include unit tests. The search must handle empty results
gracefully and return structured error responses for invalid inputs.
```

### Full Happy Path

1. **DECOMPOSING** (2s): Supervisor calls task decomposer → 3 subtasks produced:
   - S1: `implement-search-endpoint` (Code Intelligence, no deps)
   - S2: `write-search-tests` (Test & QA, depends on S1)
   - S3: `review-error-handling` (Debug & Review, depends on S1)

2. **PLANNING** (0.5s): Dependency graph resolves S1 first, then S2 + S3 in parallel.

3. **RUNNING — S1** (3s): Code Intelligence Agent produces `ProductSearchController.ts`,
   `SearchService.ts`, updates `routes.ts`. Evidence ledger records the file manifest.

4. **AWAITING_APPROVAL** (human action): Supervisor pauses after S1 completes — an
   "architecture checkpoint" before generating tests. Approval prompt appears in UI.
   Evaluator clicks **Approve**.

5. **RUNNING — S2 + S3 in parallel** (4s):
   - Test & QA generates tests. **Controlled failure:** one test fails —
     `"should return 400 for negative price"` — because the fixture is designed to
     omit negative-price validation.
   - Debug & Review reviews error handling, returns clean result (success path).

6. **RECOVERY_REQUESTED** (0.5s): Supervisor detects S2 failure, transitions to recovery.
   Assigns Debug & Review agent to diagnose. Evidence ledger records `RECOVERY_TRIGGERED`.

7. **RECOVERING** (3s): Debug agent diagnoses missing validation, produces fixed
   `SearchService.ts` with the guard added. Records `FIX_APPLIED`.

8. **RETESTING** (2s): Test & QA reruns against fixed implementation. All tests pass.
   `passRate = 1.0`. Records `RETEST_COMPLETE`.

9. **VERIFYING** (1s): Supervisor checks all requirements against ledger entries:
   - ✅ Endpoint implemented
   - ✅ Category + price filtering present
   - ✅ Empty results handled
   - ✅ Invalid input returns structured errors
   - ✅ Unit tests pass

10. **COMPLETED**: Run completes. Ledger flushed to JSON. UI shows green completion state.

### Total Demo Time: ~16–18 seconds

### Failure Reproduction

The failure in step 5 is triggered by the fixture returning `passRate: 0.75` with one
named failing test. It is hardcoded in `backend/src/demo/fixtures.ts`. The recovery
fixture always succeeds. This cycle is 100% deterministic.

---

## 10. Implementation Order

Tasks are sequenced so a demoable core loop exists as early as possible. Polish is layered last.

### Phase 1 — Foundation (must have before anything is demoable)

**Sub-Task 1: Project Scaffolding**
- Intent: Set up pnpm workspaces, TypeScript configs, Vite frontend, Express backend, shared types
- Outcomes: `pnpm install` works, both packages compile without errors, `/api/runs` returns `[]`
- Status: [ ] pending

**Sub-Task 2: Contracts & Types**
- Intent: Define all shared TypeScript interfaces in `contracts.ts` (Run, SubTask, AgentResult, LedgerEntry, SseEvent, all payload types)
- Outcomes: No `any` types, all agent I/O shapes are typed, frontend can import from the same source
- Status: [ ] pending

**Sub-Task 3: In-Memory Run Store + Basic Routes**
- Intent: Implement `runStore.ts`, POST /api/runs, GET /api/runs, GET /api/runs/:runId
- Outcomes: Can create a run via curl, retrieve it, get 404 on missing id
- Status: [ ] pending

### Phase 2 — Core Orchestration Loop

**Sub-Task 4: State Machine**
- Intent: Implement `stateMachine.ts` as a pure transition function `(state, event) → state`
- Outcomes: Unit tests pass for all valid and invalid transitions; no async code in this module
- Status: [ ] pending

**Sub-Task 5: Evidence Ledger**
- Intent: Implement append-only ledger with in-memory store + JSON flush
- Outcomes: Entries are appended correctly; flush produces valid JSON file; read-back works
- Status: [ ] pending

**Sub-Task 6: Demo Fixtures**
- Intent: Implement `backend/src/demo/fixtures.ts` with deterministic agent responses for the ecommerce scenario
- Outcomes: Full scenario playback works without LLM calls when `DEMO_MODE=true`
- Status: [ ] pending

**Sub-Task 7: Agent Runner + Agents (Demo Mode)**
- Intent: Implement `agentRunner.ts` and all three agent modules backed by fixtures in demo mode
- Outcomes: Each agent can be called with the demo inputs and returns the typed demo output
- Status: [ ] pending

**Sub-Task 8: Supervisor Orchestration**
- Intent: Implement `supervisor.ts` wiring state machine, agents, ledger, and dependency graph together
- Outcomes: Calling `supervisor.run(taskDescription)` completes the full demo scenario end-to-end in Node.js (no HTTP yet)
- Status: [ ] pending

**Sub-Task 9: SSE Route**
- Intent: Implement GET /api/runs/:runId/events with proper SSE headers, heartbeat, and clean close
- Outcomes: Browser EventSource receives all run events in order; stream closes on COMPLETED
- Status: [ ] pending

### Phase 3 — Frontend Core

**Sub-Task 10: Frontend Scaffold + Store**
- Intent: Vite app with Tailwind, shadcn/ui, Zustand store, API client, SSE connection manager
- Outcomes: SSE events from backend update the Zustand store; React DevTools confirms state updates
- Status: [ ] pending

**Sub-Task 11: Pipeline View (Functional)**
- Intent: PipelineView, PhaseTrack, AgentCard — shows real data, minimal styling
- Outcomes: Full demo scenario is visible in the browser end-to-end (ugly is OK at this step)
- Status: [ ] pending

**Sub-Task 12: Evidence Ledger Panel**
- Intent: Collapsible drawer showing live ledger entries
- Outcomes: Each ledger event appears in the UI as it happens; entries are human-readable
- Status: [ ] pending

**Sub-Task 13: Approval Prompt**
- Intent: Modal that blocks progress and lets user approve/reject
- Outcomes: Clicking Approve calls PUT /api/runs/:id/approve; run resumes; modal dismisses
- Status: [ ] pending

### Phase 4 — LLM Integration

**Sub-Task 14: LLM Client + Prompts**
- Intent: OpenAI client with retry logic; prompt templates for all three agents; structured JSON output
- Outcomes: Each agent can run in real mode (DEMO_MODE=false) and return valid typed output
- Status: [ ] pending

### Phase 5 — Polish (layer on top of working demo)

**Sub-Task 15: UI Polish — Animations & States**
- Intent: Framer Motion transitions on agent cards; phase track fill; ledger entry slide-in; failure/recovery visual states
- Outcomes: Demo feels like a polished developer tool; failure state is visually distinct from recovery
- Status: [ ] pending

**Sub-Task 16: UI Polish — Layout & Typography**
- Intent: Final sidebar, typography, colour system, empty/loading states, responsive layout
- Outcomes: Screenshot-worthy UI comparable to Linear/Vercel in visual quality
- Status: [ ] pending

**Sub-Task 17: Tests**
- Intent: Unit tests for stateMachine, dependencyGraph, evidenceLedger, agentRunner
- Outcomes: `pnpm test` passes; core orchestration logic has coverage
- Status: [ ] pending

**Sub-Task 18: README & Demo Script**
- Intent: README with setup instructions; ecommerce-demo/README.md with step-by-step demo script
- Outcomes: A new person can clone, install, and run the demo in under 5 minutes
- Status: [ ] pending

---

## Confirmed Decisions

1. **Shared types location:** ✅ Copy `contracts.ts` into both packages — simpler, no symlink or workspace setup overhead.

2. **DEMO_MODE default:** ✅ `DEMO_MODE=false` — real LLM calls by default. Demo fixtures available via `DEMO_MODE=true` as a fallback. README must document both clearly.

3. **LLM model:** ✅ `gpt-4o-mini` — faster, cheaper, fully adequate for structured JSON outputs in this context.

4. **Parallel subtask execution:** ✅ `Promise.all` in-process — explicitly a prototype simplification; real product would use a work queue. Noted in code comments.

5. **Frontend routing:** ✅ Single-page, no React Router — fastest to build, sufficient for live demo.
