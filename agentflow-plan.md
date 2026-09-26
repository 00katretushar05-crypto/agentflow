# AgentFlow — Architecture & Implementation Plan

> Version 0.1 — Working Prototype  
> Audience: Technical evaluators deciding whether this approach is worth investing in  
> Goal: A polished, demoable AI Supervisor for software development workflows

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Supervisor State Machine](#4-supervisor-state-machine)
5. [Agent Responsibilities](#5-agent-responsibilities)
6. [Handoff Contracts](#6-handoff-contracts)
7. [API Design](#7-api-design)
8. [Folder Structure](#8-folder-structure)
9. [Demo Scenario](#9-demo-scenario)
10. [Implementation Order](#10-implementation-order)
11. [Sub-Tasks](#11-sub-tasks)

---

## 1. System Architecture

### Overview

AgentFlow is a monorepo containing:
- **Backend** — Node.js + TypeScript, Express, SSE for real-time updates
- **Frontend** — React + TypeScript, Vite, TailwindCSS + shadcn/ui
- **Shared types** — a `contracts.ts` file shared between frontend and backend via a local import

### Major Decisions

| Decision | Choice | Justification | Alternative Considered |
|---|---|---|---|
| Runtime | Node.js + Express | Familiar, minimal overhead, easy to stream SSE | Fastify is faster but adds config; Bun is fast but less stable on Windows |
| Frontend framework | React + Vite | Most evaluators know React; Vite gives instant HMR | Next.js adds SSR complexity we don't need for a demo |
| Styling | Tailwind CSS + shadcn/ui | Looks like a real product instantly; highly customizable | MUI/Chakra feel "template-y"; raw CSS is too slow |
| Real-time updates | Server-Sent Events (SSE) | One-directional server→client fits the "stream of events" model; no WS upgrade needed | WebSockets add bidirectional complexity for no gain here |
| Agent communication | In-process function calls | For a prototype, agents run in-process; no network overhead, easy to trace and debug | Message queues (BullMQ/Redis) would be correct at scale but over-engineer this |
| AI calls | OpenAI API (GPT-4o) with structured outputs | Most reliable structured JSON output today; `zod` schema validation on every response | Anthropic, local LLM — swappable via an adapter interface |
| State persistence | In-memory (Map) + optional JSON file flush | Zero infrastructure dependency; demo-safe | PostgreSQL is overkill; SQLite is reasonable but adds setup friction |
| Testing | Vitest for backend unit tests | Same config as Vite, fast, TypeScript-native | Jest works but requires more config |

### Deliberate Simplifications

- **No authentication** — session is identified by a `runId` UUID; acceptable for a single-user demo
- **No database** — all run state lives in a `RunStore` (in-memory Map); the demo never needs history across restarts
- **Agents run in-process** — realistic orchestration logic without the operational overhead of separate services
- **LLM calls are real but bounded** — each agent call uses a focused, short prompt; if the API is slow we can swap in a mock adapter with one flag
- **No file system access** — code is passed as strings in the demo scenario; a real product would use git checkout

---

## 2. Frontend Architecture

### Stack

- **React 18** + **TypeScript** (strict)
- **Vite** (build + dev server)
- **TailwindCSS v3** + **shadcn/ui** (component primitives)
- **Zustand** (lightweight global state — no Redux boilerplate for a prototype)
- **React Query (TanStack Query v5)** (data fetching, loading/error states, cache)
- **React Router v6** (two routes: `/` dashboard, `/runs/:runId`)

### Component Hierarchy

```
App
├── Layout
│   ├── Sidebar (nav + recent runs)
│   └── Header (branding + status chip)
├── DashboardPage  (route: /)
│   ├── NewRunForm (task input, submit)
│   └── RunHistoryList (recent runs with status badges)
└── RunDetailPage  (route: /runs/:runId)
    ├── RunHeader (task summary, overall status, elapsed time)
    ├── SupervisorPanel
    │   ├── StateBadge (current supervisor state)
    │   └── PlanView (decomposed sub-tasks list)
    ├── AgentLane (repeated for each agent)
    │   ├── AgentHeader (name, status icon, pulse animation)
    │   ├── AgentLogStream (scrolling event log, monospace)
    │   └── AgentResultCard (structured output when done)
    ├── EvidenceLedger (collapsible table of all evidence items)
    └── ApprovalGate (conditional — shown only when Supervisor awaits human)
```

### State Management

| Concern | Solution | Why |
|---|---|---|
| Run list | React Query + `/api/runs` | Cache + refetch on focus |
| Active run state | Zustand `useRunStore` | SSE events mutate this store; components subscribe selectively |
| SSE connection | Custom hook `useRunStream` | Opens `EventSource`, dispatches events into Zustand store, cleans up on unmount |
| Form state | React Hook Form | Minimal re-renders, built-in validation |
| UI component state | Local `useState` | Dropdowns, modals — no global concern |

### Data Flow

```
User submits task
  → POST /api/runs  →  RunDetailPage opens
  → useRunStream opens EventSource to /api/runs/:runId/stream
  → SSE events arrive (supervisor_state_changed, agent_started, agent_result, evidence_added, approval_required, run_completed)
  → useRunStore.dispatch() updates normalized state
  → Components re-render selectively
```

### Where Polish Matters for the Demo

1. **AgentLane pulse animation** — a glowing ring on active agents; evaluators immediately see parallelism
2. **SupervisorPanel state transitions** — smooth badge color change + subtle slide animation per state
3. **EvidenceLedger row entry** — each new evidence item slides in; makes the ledger feel "live"
4. **ApprovalGate** — prominent card with a gentle attention-seeking animation; human-in-the-loop moment is the most important UX beat
5. **AgentLogStream** — streaming log lines that auto-scroll; feels like a real CI/CD tool
6. **Run completion** — confetti or checkmark animation on success; red flash on unrecoverable failure

---

## 3. Backend Architecture

### Stack

- **Node.js 20 LTS** + **TypeScript** (strict, `moduleResolution: bundler`)
- **Express 4** (HTTP server + SSE middleware)
- **Zod** (schema validation for all LLM responses and request bodies)
- **OpenAI Node SDK** (with a `MockLLMAdapter` behind an interface for offline testing)
- **Vitest** (unit tests for Supervisor logic and agent adapters)

### Module Boundaries

```
backend/src/
├── server.ts           — Express app factory, mounts routes
├── routes/             — Thin HTTP handlers; no business logic
├── supervisor/         — Orchestration engine (state machine + scheduler)
├── agents/             — One file per agent; each exports a pure async function
├── llm/                — LLM adapter interface + OpenAI implementation + Mock
├── store/              — RunStore (in-memory state for all active runs)
├── ledger/             — EvidenceLedger (append-only log of artifacts)
├── events/             — SSE broadcaster; typed event union
└── types/              — Shared contracts (re-exported from root contracts.ts)
```

### Communication Flow

```
Route Handler
  → creates Run in RunStore
  → starts Supervisor.run(runId, task)
  → returns runId immediately (202 Accepted)

Supervisor.run()
  → calls LLM to decompose task into SubTasks
  → identifies parallel groups
  → for each group: calls agents concurrently via Promise.allSettled()
  → collects AgentResult objects
  → writes to EvidenceLedger
  → emits SSE events at every state transition
  → on test failure: transitions to RECOVERY state, re-assigns
  → on all requirements verified: transitions to AWAITING_APPROVAL
  → on human approval: transitions to COMPLETED

Agents (CodeIntelligenceAgent, TestQAAgent, DebugReviewAgent)
  → receive a typed AgentInput
  → call LLM with a focused, structured prompt
  → return a typed AgentResult
  → all LLM calls are wrapped: timeout + retry (max 2) + zod parse
```

### Failure Handling

| Failure Type | Location | Handling |
|---|---|---|
| LLM API timeout/error | `llm/openai-adapter.ts` | Retry once; if second fails, return `AgentResult { status: "error", error: "LLM unavailable" }` |
| LLM response fails Zod parse | `llm/openai-adapter.ts` | Retry once with "please return valid JSON" reminder; if still fails, return error result |
| Agent returns error status | `supervisor/scheduler.ts` | Supervisor transitions to RECOVERY, re-assigns to DebugReviewAgent |
| Test failure detected | `supervisor/index.ts` | Transition to TEST_FAILURE state, request fix from CodeIntelligenceAgent, re-trigger TestQAAgent |
| Max retries exceeded | `supervisor/index.ts` | Transition to FAILED state, emit final event, stop |
| Unhandled promise | `server.ts` | Global `process.on('unhandledRejection')` logs + marks run as FAILED |

---

## 4. Supervisor State Machine

### States

```
IDLE → DECOMPOSING → PLANNING → EXECUTING → TESTING → REVIEWING
     ↓                                        ↓
     ...                              TEST_FAILURE → RECOVERY → EXECUTING (retry)
                                                           ↓ (max retries)
                                                        FAILED
REVIEWING → AWAITING_APPROVAL → COMPLETED
          ↓ (requirements not met)
        RECOVERY → EXECUTING (retry)
```

### State Definitions

| State | Entry Condition | Exit Condition | Actions |
|---|---|---|---|
| `IDLE` | Run created | Task submitted | Emit `run_created` |
| `DECOMPOSING` | Task submitted | LLM returns SubTask list | Call LLM planner; emit `supervisor_state_changed` |
| `PLANNING` | SubTasks received | Parallel groups identified | Build execution plan; emit `plan_ready` |
| `EXECUTING` | Plan ready OR recovery complete | All agents in current group return results | Dispatch agents; emit `agent_started` per agent |
| `TESTING` | Code agent results received | Test agent returns result | Dispatch TestQAAgent with code results |
| `TEST_FAILURE` | TestQAAgent returns `status: "fail"` | — | Emit `test_failure`; transition to RECOVERY |
| `RECOVERY` | Test failure OR review rejection | Fix dispatched | Dispatch DebugReviewAgent + CodeIntelligenceAgent fix; increment retry counter |
| `REVIEWING` | All tests pass | Review complete | Dispatch DebugReviewAgent for final review |
| `AWAITING_APPROVAL` | Review passes requirements check | Human approves or rejects | Emit `approval_required`; block until HTTP POST approval |
| `COMPLETED` | Human approves | — | Emit `run_completed`; finalize evidence ledger |
| `FAILED` | Retry count ≥ `MAX_RETRIES` (3) | — | Emit `run_failed`; record failure reason |

### Retry Bounding

- `MAX_RETRIES = 3` — hard cap, not configurable at runtime (avoids live-demo infinite loop)
- Retry counter is per-run and per-subtask
- On `FAILED`, the Supervisor stops all pending work and emits a structured failure event with the last error

---

## 5. Agent Responsibilities

### Code Intelligence Agent

**Role:** Generates or modifies code based on a sub-task specification.

**Input:**
```typescript
{
  subtaskId: string
  description: string       // "Implement addToCart function"
  context: string           // existing code or interface contract
  constraints: string[]     // e.g. ["must be pure function", "TypeScript strict"]
}
```

**Output:**
```typescript
{
  subtaskId: string
  status: "success" | "error"
  artifact: {
    filename: string
    language: string
    code: string
    explanation: string
  } | null
  error?: string
}
```

**Done when:** Code artifact passes Zod validation, `status === "success"`, explanation is non-empty.

---

### Test & QA Agent

**Role:** Writes and validates tests for a code artifact; simulates test execution and reports results.

**Input:**
```typescript
{
  subtaskId: string
  codeArtifact: CodeArtifact   // output from CodeIntelligenceAgent
  requirements: string[]       // acceptance criteria to test against
}
```

**Output:**
```typescript
{
  subtaskId: string
  status: "pass" | "fail" | "error"
  testSuite: {
    totalTests: number
    passed: number
    failed: number
    testCases: Array<{
      name: string
      status: "pass" | "fail"
      message?: string
    }>
  }
  coverageNotes: string
  error?: string
}
```

**Done when:** `status === "pass"` and all required behaviors are covered by test cases.

---

### Debug & Review Agent

**Role:** Reviews code quality, identifies bugs, checks requirements alignment, and in recovery mode diagnoses test failures.

**Input:**
```typescript
{
  subtaskId: string
  mode: "review" | "debug"
  codeArtifact: CodeArtifact
  testResult?: TestResult       // required when mode === "debug"
  requirements: string[]
}
```

**Output:**
```typescript
{
  subtaskId: string
  status: "approved" | "rejected" | "fix_provided"
  findings: Array<{
    severity: "critical" | "warning" | "info"
    message: string
    line?: number
  }>
  fixSuggestion?: string        // populated when status === "fix_provided"
  requirementsMet: boolean
  error?: string
}
```

**Done when:** `status === "approved"` and `requirementsMet === true`.

---

## 6. Handoff Contracts

### Run Object (stored in RunStore)

```typescript
interface Run {
  id: string                    // UUID
  task: string                  // original developer task
  status: SupervisorState
  plan: SubTask[]
  results: Map<string, AgentResult>
  retryCount: number
  createdAt: string             // ISO 8601
  updatedAt: string
  completedAt?: string
  failureReason?: string
}
```

### SubTask

```typescript
interface SubTask {
  id: string
  description: string
  assignedAgent: AgentType      // "code" | "test" | "debug"
  dependsOn: string[]           // subtask IDs that must complete first
  parallelGroup: number         // agents in same group run concurrently
  requirements: string[]
  status: "pending" | "in_progress" | "done" | "failed"
}
```

### Evidence Ledger Entry

```typescript
interface EvidenceLedgerEntry {
  id: string
  runId: string
  subtaskId: string
  agentType: AgentType
  timestamp: string             // ISO 8601
  type: "code_artifact" | "test_result" | "review_finding" | "supervisor_decision"
  payload: CodeArtifact | TestResult | ReviewResult | SupervisorDecision
  metadata: {
    retryAttempt: number
    durationMs: number
  }
}
```

### SSE Event Union

```typescript
type RunEvent =
  | { type: "run_created";            runId: string; task: string }
  | { type: "supervisor_state_changed"; runId: string; from: SupervisorState; to: SupervisorState }
  | { type: "plan_ready";             runId: string; plan: SubTask[] }
  | { type: "agent_started";          runId: string; subtaskId: string; agentType: AgentType }
  | { type: "agent_result";           runId: string; subtaskId: string; result: AgentResult }
  | { type: "evidence_added";         runId: string; entry: EvidenceLedgerEntry }
  | { type: "test_failure";           runId: string; subtaskId: string; failureDetail: string }
  | { type: "recovery_started";       runId: string; retryAttempt: number }
  | { type: "approval_required";      runId: string; summary: ApprovalSummary }
  | { type: "run_completed";          runId: string; ledgerEntryCount: number }
  | { type: "run_failed";             runId: string; reason: string }
```

---

## 7. API Design

### Base URL: `/api`

### Error Response Convention

Every error response uses this shape — no ad hoc strings:

```typescript
interface ApiError {
  error: {
    code: string        // machine-readable e.g. "RUN_NOT_FOUND"
    message: string     // human-readable
    details?: unknown   // optional extra context
  }
}
```

HTTP status → error code mapping is consistent:
- `400` → validation errors (`VALIDATION_ERROR`)
- `404` → resource not found (`RUN_NOT_FOUND`, `TASK_NOT_FOUND`)
- `409` → conflict (`RUN_ALREADY_COMPLETED`)
- `500` → internal server error (`INTERNAL_ERROR`)

---

### Endpoints

#### `POST /api/runs`

Start a new supervised run.

**Request:**
```typescript
{ task: string }   // min 10 chars, max 2000 chars
```

**Response `202`:**
```typescript
{
  runId: string
  status: "IDLE"
  createdAt: string
}
```

---

#### `GET /api/runs`

List all runs (most recent first).

**Response `200`:**
```typescript
{
  runs: Array<{
    id: string
    task: string
    status: SupervisorState
    createdAt: string
    updatedAt: string
    retryCount: number
  }>
}
```

---

#### `GET /api/runs/:runId`

Get full run detail including plan and all results.

**Response `200`:** Full `Run` object (with results serialized as an array).

**Response `404`:** `RUN_NOT_FOUND`

---

#### `GET /api/runs/:runId/stream`

Server-Sent Events stream. Client connects and receives all `RunEvent` payloads as `data: <JSON>\n\n`.

Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`

Sends a `ping` comment every 15s to keep connection alive.

**Response `404`:** `RUN_NOT_FOUND` (sent before headers are set, as JSON)

---

#### `POST /api/runs/:runId/approve`

Human approves the run at `AWAITING_APPROVAL`.

**Request:** `{}` (empty body, approval is binary for the prototype)

**Response `200`:**
```typescript
{ runId: string; status: "COMPLETED" }
```

**Response `409`:** `RUN_NOT_AWAITING_APPROVAL`

---

#### `POST /api/runs/:runId/reject`

Human rejects and requests revision.

**Request:**
```typescript
{ reason: string }
```

**Response `200`:**
```typescript
{ runId: string; status: "RECOVERY" }
```

---

#### `GET /api/runs/:runId/ledger`

Retrieve the full evidence ledger for a run.

**Response `200`:**
```typescript
{ entries: EvidenceLedgerEntry[] }
```

---

#### `GET /api/health`

Health check for the demo.

**Response `200`:**
```typescript
{ status: "ok"; uptime: number }
```

---

## 8. Folder Structure

### Backend

```
backend/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── src/
    ├── server.ts                     # Express app factory + startup
    ├── agents/
    │   ├── code-intelligence.ts      # CodeIntelligenceAgent
    │   ├── test-qa.ts                # TestQAAgent
    │   ├── debug-review.ts           # DebugReviewAgent
    │   └── index.ts                  # re-exports all agents
    ├── llm/
    │   ├── types.ts                  # LLMAdapter interface
    │   ├── openai-adapter.ts         # OpenAI implementation
    │   └── mock-adapter.ts           # Deterministic mock for offline/demo mode
    ├── supervisor/
    │   ├── index.ts                  # Supervisor class (state machine)
    │   ├── planner.ts                # Task decomposition logic
    │   ├── scheduler.ts              # Parallel group execution
    │   └── states.ts                 # State enum + transition helpers
    ├── store/
    │   └── run-store.ts              # In-memory RunStore
    ├── ledger/
    │   └── evidence-ledger.ts        # EvidenceLedger (append-only)
    ├── events/
    │   └── sse-broadcaster.ts        # SSE connection registry + emit
    ├── routes/
    │   ├── runs.ts                   # /api/runs routes
    │   └── health.ts                 # /api/health route
    └── types/
        └── contracts.ts              # All shared types (Run, SubTask, AgentInput/Output, etc.)
```

### Frontend

```
frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
└── src/
    ├── main.tsx                      # React root mount
    ├── App.tsx                       # Router setup
    ├── api/
    │   ├── client.ts                 # fetch wrapper with error normalization
    │   ├── runs.ts                   # React Query hooks for run endpoints
    │   └── types.ts                  # Frontend-facing API types (mirrors contracts.ts)
    ├── hooks/
    │   └── useRunStream.ts           # SSE EventSource hook → Zustand dispatch
    ├── store/
    │   └── run-store.ts              # Zustand store for active run state
    ├── pages/
    │   ├── DashboardPage.tsx         # Route: /
    │   └── RunDetailPage.tsx         # Route: /runs/:runId
    ├── components/
    │   ├── layout/
    │   │   ├── AppLayout.tsx
    │   │   ├── Sidebar.tsx
    │   │   └── Header.tsx
    │   ├── dashboard/
    │   │   ├── NewRunForm.tsx
    │   │   └── RunHistoryList.tsx
    │   ├── run/
    │   │   ├── RunHeader.tsx
    │   │   ├── SupervisorPanel.tsx
    │   │   ├── AgentLane.tsx
    │   │   ├── AgentLogStream.tsx
    │   │   ├── AgentResultCard.tsx
    │   │   ├── EvidenceLedger.tsx
    │   │   └── ApprovalGate.tsx
    │   └── ui/                       # shadcn/ui primitives (auto-generated)
    ├── lib/
    │   └── utils.ts                  # cn() + misc helpers
    └── styles/
        └── globals.css               # Tailwind base + custom CSS variables
```

---

## 9. Demo Scenario

### Scenario: "Add Shopping Cart to E-Commerce API"

This is a fixed, deterministic scenario. It is embedded in `mock-adapter.ts` and does not require live LLM calls unless `DEMO_MODE=live` is set.

### Task String (exact)
```
Add a shopping cart feature to the e-commerce API. The cart must support:
adding items with quantity, removing items, clearing the cart, and calculating 
the total price. Each cart is scoped to a userId.
```

### Execution Script (deterministic)

**Phase 1 — Decompose + Plan**
- Supervisor calls LLM planner → returns 3 sub-tasks
- Sub-task 1: `Implement CartService with addItem, removeItem, clearCart, getTotal` (Code Agent)
- Sub-task 2: `Write unit tests for CartService` (Test Agent) — depends on Sub-task 1
- Sub-task 3: `Review CartService for correctness and edge cases` (Debug Agent) — depends on Sub-task 2

**Phase 2 — Execute (Sub-task 1)**
- CodeIntelligenceAgent generates `CartService` TypeScript class
- SSE events: `agent_started`, then `agent_result` with code artifact
- Evidence entry #1 added

**Phase 3 — Test (Sub-task 2) — CONTROLLED FAILURE**
- TestQAAgent runs; mock returns `status: "fail"` for first attempt
- Failing test: `"getTotal() should return 0 for empty cart"` — mock says `getTotal` is missing null guard
- SSE events: `agent_result` (fail), `test_failure`, `recovery_started`
- Supervisor transitions: `TESTING → TEST_FAILURE → RECOVERY`

**Phase 4 — Recovery**
- DebugReviewAgent (debug mode) returns `fix_provided`: "Add null check in getTotal"
- CodeIntelligenceAgent regenerates with fix applied
- Evidence entries #2 (test fail), #3 (debug fix), #4 (revised code)

**Phase 5 — Retest**
- TestQAAgent runs again; mock returns `status: "pass"`, 6/6 tests pass
- Evidence entry #5

**Phase 6 — Review**
- DebugReviewAgent (review mode) returns `status: "approved"`, `requirementsMet: true`
- Evidence entry #6

**Phase 7 — Approval Gate**
- Supervisor transitions to `AWAITING_APPROVAL`
- Frontend shows `ApprovalGate` with summary
- Human clicks "Approve"
- POST `/api/runs/:runId/approve`
- Run transitions to `COMPLETED`

### Why This Scenario Works for a Demo

- **Concrete and relatable** — every evaluator understands "shopping cart"
- **Covers the full loop** — all three agents are used, parallelism is planned (even if sub-tasks are sequential here)
- **Controlled failure** — the test failure on first attempt is always triggered by the mock; never unpredictable
- **Human moment** — the Approval Gate gives the presenter a natural pause to explain the human-in-the-loop design
- **Repeatable** — same mock responses every time; no LLM variance in the demo path

---

## 10. Implementation Order

### Phase 1 — Core Loop (backend + minimal UI)

Goal: a working end-to-end loop exists even if it looks rough.

1. **Backend scaffold** — `package.json`, `tsconfig.json`, Express server, `/api/health`, CORS
2. **Types & contracts** — populate `contracts.ts` with all shared types (Run, SubTask, AgentInput/Output, RunEvent, etc.)
3. **RunStore + EvidenceLedger** — in-memory implementations
4. **SSE broadcaster** — connection registry + `emit()` helper
5. **LLM adapter interface + Mock adapter** — deterministic mock for demo scenario
6. **Agents** — CodeIntelligenceAgent, TestQAAgent, DebugReviewAgent (using mock adapter)
7. **Supervisor state machine** — planner, scheduler, full state transitions, retry logic
8. **Routes** — `/api/runs` POST + GET, `/api/runs/:runId` GET, `/api/runs/:runId/stream`, approve/reject
9. **Frontend scaffold** — `package.json`, Vite, React, Tailwind, shadcn/ui setup
10. **Minimal RunDetailPage** — raw JSON dump of SSE events (proves the loop works end-to-end)

### Phase 2 — Polish & Demo Path

Goal: looks like a real product; demo scenario runs perfectly.

11. **AppLayout + Sidebar + Header** — professional shell
12. **DashboardPage** — NewRunForm + RunHistoryList with React Query
13. **SupervisorPanel** — state badge with animated transitions
14. **AgentLane** — one lane per agent with pulse animation and log stream
15. **AgentResultCard** — code artifact display with syntax highlighting (Prism or Shiki)
16. **EvidenceLedger** — animated row insertion
17. **ApprovalGate** — prominent, polished card
18. **OpenAI adapter** — real LLM calls behind the same interface (for `DEMO_MODE=live`)
19. **Error boundary + 404 page** — graceful frontend failures

### Phase 3 — Hardening (if time allows)

20. **Vitest unit tests** — Supervisor state transitions, planner, scheduler
21. **Zod validation** — all request bodies, all LLM responses
22. **Reconnection logic** — SSE auto-reconnect with `Last-Event-ID`
23. **README** — how to run, how to demo, environment variables

---

## 11. Sub-Tasks

Each sub-task below is scoped for one focused implementation session.

---

### ST-01: Backend Scaffold & Health Route

**Intent:** Get a working Express server that returns health and accepts CORS from the frontend.

**Expected Outcomes:**
- `GET /api/health` returns `{ status: "ok", uptime: number }`
- TypeScript compiles cleanly (`tsc --noEmit`)
- `npm run dev` starts the server with hot reload (ts-node-dev or tsx watch)

**Todo List:**
- [ ] Create `backend/package.json` with `express`, `typescript`, `tsx`, `@types/express`, `@types/node`, `zod`, `openai`, `uuid`, `cors`
- [ ] Create `backend/tsconfig.json` (strict, `moduleResolution: bundler`, `target: ES2022`)
- [ ] Create `backend/src/server.ts` — Express app factory with CORS, JSON body parser, error middleware
- [ ] Create `backend/src/routes/health.ts` — health endpoint
- [ ] Add `npm run dev`, `npm run build`, `npm run typecheck` scripts

**Relevant Context:** `backend/src/` scaffold already exists with empty directories.

**Status:** `[ ] pending`

---

### ST-02: Shared Types & Contracts

**Intent:** Define all data shapes in one place before any logic is written, so types guide implementation.

**Expected Outcomes:**
- `contracts.ts` exports all types: `Run`, `SubTask`, `AgentType`, `SupervisorState`, `AgentInput`, `AgentOutput` variants, `EvidenceLedgerEntry`, `RunEvent` union, all API request/response shapes

**Todo List:**
- [ ] Populate `backend/src/types/contracts.ts` with all types listed in sections 4–7 of this plan
- [ ] Ensure all types are exported and have JSDoc comments
- [ ] Run `tsc --noEmit` to verify no issues

**Relevant Context:** Types from sections 5, 6, 7 of this plan.

**Status:** `[ ] pending`

---

### ST-03: RunStore + EvidenceLedger

**Intent:** Provide in-memory state storage and the append-only evidence ledger that all other modules write to.

**Expected Outcomes:**
- `RunStore` can create, get, update, and list runs
- `EvidenceLedger` can append entries and retrieve by `runId`
- Both are plain classes with no side effects — easy to unit test

**Todo List:**
- [ ] Create `backend/src/store/run-store.ts` — `RunStore` class with `createRun`, `getRun`, `updateRun`, `listRuns`, `setResult`
- [ ] Create `backend/src/ledger/evidence-ledger.ts` — `EvidenceLedger` class with `append`, `getByRunId`
- [ ] Both use `Map<string, T>` internally

**Relevant Context:** `Run` and `EvidenceLedgerEntry` types from ST-02.

**Status:** `[ ] pending`

---

### ST-04: SSE Broadcaster

**Intent:** Allow the Supervisor to emit typed events to all connected frontend clients for a given run.

**Expected Outcomes:**
- `SSEBroadcaster` class manages per-run `Response` connections
- `emit(runId, event)` serializes `RunEvent` and writes to all connections for that run
- Connections clean up properly on client disconnect
- Ping interval keeps connections alive

**Todo List:**
- [ ] Create `backend/src/events/sse-broadcaster.ts`
- [ ] `register(runId, res)` — adds an Express `Response` to the set for that run, sets SSE headers, sets up cleanup on `res.on("close")`
- [ ] `emit(runId, event: RunEvent)` — serializes to `data: <JSON>\n\n`
- [ ] `ping()` — sends `: ping\n\n` comment every 15s via `setInterval`
- [ ] Export a singleton instance

**Relevant Context:** `RunEvent` type from ST-02.

**Status:** `[ ] pending`

---

### ST-05: LLM Adapter Interface + Mock

**Intent:** Decouple all agent logic from a specific LLM provider. The mock adapter drives the deterministic demo scenario.

**Expected Outcomes:**
- `LLMAdapter` interface defines `complete(prompt, schema) → Promise<T>`
- `MockLLMAdapter` returns hardcoded demo-scenario responses keyed by prompt type
- `OpenAIAdapter` implements the same interface (can be wired in later)
- A factory `getLLMAdapter()` reads `process.env.DEMO_MODE` and returns the right adapter

**Todo List:**
- [ ] Create `backend/src/llm/types.ts` — `LLMAdapter<T>` interface
- [ ] Create `backend/src/llm/mock-adapter.ts` — responses for planner, code agent, test agent (fail then pass), debug agent
- [ ] Create `backend/src/llm/openai-adapter.ts` — real OpenAI call with zod parse + 1 retry
- [ ] Create `backend/src/llm/index.ts` — `getLLMAdapter()` factory

**Relevant Context:** Demo scenario in section 9 of this plan defines the exact mock responses needed.

**Status:** `[ ] pending`

---

### ST-06: Agents

**Intent:** Implement the three agents as pure async functions that accept typed input, call the LLM adapter, parse the response, and return typed output.

**Expected Outcomes:**
- `codeIntelligenceAgent(input)` returns `CodeAgentResult`
- `testQAAgent(input)` returns `TestAgentResult`
- `debugReviewAgent(input)` returns `ReviewAgentResult`
- Each agent validates LLM output via Zod; returns `status: "error"` on parse failure
- All prompts are co-located with their agent file

**Todo List:**
- [ ] Create `backend/src/agents/code-intelligence.ts`
- [ ] Create `backend/src/agents/test-qa.ts`
- [ ] Create `backend/src/agents/debug-review.ts`
- [ ] Create `backend/src/agents/index.ts` — re-exports
- [ ] Write Zod schemas for each agent output

**Relevant Context:** Agent contracts from section 5 of this plan; LLM adapter from ST-05.

**Status:** `[ ] pending`

---

### ST-07: Supervisor State Machine

**Intent:** Implement the orchestration engine that drives the full workflow: decompose → plan → execute → test → (recover) → review → await approval → complete.

**Expected Outcomes:**
- `Supervisor.run(runId, task)` drives the full state machine asynchronously
- State transitions emit SSE events via `SSEBroadcaster`
- Test failure triggers recovery with bounded retries (`MAX_RETRIES = 3`)
- Every state transition is logged to the `EvidenceLedger`
- `AWAITING_APPROVAL` blocks until `approve()` or `reject()` is called on the Supervisor instance

**Todo List:**
- [ ] Create `backend/src/supervisor/states.ts` — `SupervisorState` enum + `isTerminalState()`
- [ ] Create `backend/src/supervisor/planner.ts` — `decompose(task)` → calls LLM planner → returns `SubTask[]` with parallel groups
- [ ] Create `backend/src/supervisor/scheduler.ts` — `executeGroup(subtasks, run)` → `Promise.allSettled()` over agents
- [ ] Create `backend/src/supervisor/index.ts` — `Supervisor` class with `run()`, `approve()`, `reject()` methods
- [ ] Wire `SSEBroadcaster`, `RunStore`, `EvidenceLedger` into Supervisor via constructor injection

**Relevant Context:** State machine from section 4; handoff contracts from section 6; SSE events from ST-04.

**Status:** `[ ] pending`

---

### ST-08: Run Routes

**Intent:** Expose the full API surface so the frontend can start a run, stream events, approve, and query history.

**Expected Outcomes:**
- `POST /api/runs` creates a run, starts the Supervisor async, returns `202`
- `GET /api/runs` returns run list
- `GET /api/runs/:runId` returns full run detail
- `GET /api/runs/:runId/stream` registers SSE connection
- `POST /api/runs/:runId/approve` calls `supervisor.approve()`
- `POST /api/runs/:runId/reject` calls `supervisor.reject(reason)`
- `GET /api/runs/:runId/ledger` returns evidence entries
- All 404/409/400 responses use the standard `ApiError` shape

**Todo List:**
- [ ] Create `backend/src/routes/runs.ts` — all run-related routes
- [ ] Mount routes in `server.ts`
- [ ] Add `validateBody(schema)` middleware using Zod for request validation
- [ ] Test all endpoints manually via curl or a `.http` file

**Relevant Context:** API design from section 7; error conventions from section 7.

**Status:** `[ ] pending`

---

### ST-09: Frontend Scaffold

**Intent:** Get a React + Vite + Tailwind + shadcn/ui project running with the AppLayout shell.

**Expected Outcomes:**
- `npm run dev` starts frontend at port 5173 with hot reload
- AppLayout renders with Sidebar + Header
- React Router is configured with `/` and `/runs/:runId` routes
- Tailwind + shadcn/ui tokens are configured (dark-capable color scheme)
- API base URL proxied to `localhost:3001` in Vite config

**Todo List:**
- [ ] Create `frontend/package.json` with `react`, `react-dom`, `react-router-dom`, `zustand`, `@tanstack/react-query`, `react-hook-form`, `tailwindcss`, `shadcn/ui` deps
- [ ] Create `frontend/vite.config.ts` with React plugin and proxy to backend
- [ ] Create `frontend/tsconfig.json` (strict, path aliases)
- [ ] Run `shadcn/ui` init, configure theme tokens (neutral gray + brand accent — electric indigo or slate-blue)
- [ ] Create AppLayout, Sidebar, Header components
- [ ] Create App.tsx with Router and routes

**Relevant Context:** Component hierarchy from section 2.

**Status:** `[ ] pending`

---

### ST-10: Dashboard Page

**Intent:** Give the user a landing page to submit tasks and see run history.

**Expected Outcomes:**
- `NewRunForm` validates input (min 10 chars) and calls `POST /api/runs`, then navigates to `/runs/:runId`
- `RunHistoryList` shows all runs with status badge, task excerpt, and relative timestamp
- Loading and error states are handled

**Todo List:**
- [ ] Create `frontend/src/api/client.ts` — fetch wrapper that normalizes `ApiError`
- [ ] Create `frontend/src/api/runs.ts` — `useRuns()`, `useCreateRun()` React Query hooks
- [ ] Create `NewRunForm.tsx` — textarea + submit button + validation
- [ ] Create `RunHistoryList.tsx` — table/card list with `StatusBadge`
- [ ] Create `DashboardPage.tsx`

**Relevant Context:** API from ST-08; error conventions from section 7.

**Status:** `[ ] pending`

---

### ST-11: Run Detail Page — Live View

**Intent:** The main demo screen. Shows the Supervisor state, agent lanes, evidence ledger, and approval gate in real time.

**Expected Outcomes:**
- `useRunStream` hook connects to SSE and dispatches events into Zustand store
- `SupervisorPanel` shows current state with animated badge
- `AgentLane` shows each agent with pulse animation while active, result card when done
- `AgentLogStream` streams event log lines per agent
- `EvidenceLedger` table updates live with slide-in animation
- `ApprovalGate` appears when `approval_required` event arrives
- Approve/Reject buttons work and update UI

**Todo List:**
- [ ] Create `frontend/src/store/run-store.ts` — Zustand store for `activeRun` state + `dispatch(event)` reducer
- [ ] Create `frontend/src/hooks/useRunStream.ts` — `EventSource` hook
- [ ] Create `RunHeader.tsx`, `SupervisorPanel.tsx`, `AgentLane.tsx`, `AgentLogStream.tsx`, `AgentResultCard.tsx`
- [ ] Add syntax highlighting to `AgentResultCard` (Shiki or Prism)
- [ ] Create `EvidenceLedger.tsx` with Tailwind transition on row entry
- [ ] Create `ApprovalGate.tsx` with approve/reject + reason input
- [ ] Wire everything into `RunDetailPage.tsx`

**Relevant Context:** SSE events from section 6; component hierarchy from section 2; demo scenario from section 9.

**Status:** `[ ] pending`

---

### ST-12: Polish Pass

**Intent:** Elevate the UI to "professional internal tool" quality for the live demo.

**Expected Outcomes:**
- Agent pulse animation (glowing ring) works during active state
- State badge transitions use `transition-colors duration-300`
- Evidence ledger rows animate in (`slide-down` + `fade-in`)
- ApprovalGate has an attention-grabbing but tasteful animation
- Run completion shows a success state; FAILED state shows red with reason
- Typography, spacing, and color are consistent throughout
- No layout shifts or flickering during SSE updates

**Todo List:**
- [ ] Define CSS animation utilities in `globals.css`: `pulse-ring`, `slide-down-fade-in`
- [ ] Apply animations to `AgentLane`, `EvidenceLedger`, `ApprovalGate`
- [ ] Audit color tokens — ensure status colors (success/warning/error/info) are consistent
- [ ] Test the full demo scenario end-to-end and fix any visual glitches
- [ ] Add empty states for dashboard and ledger

**Relevant Context:** Polish priorities from section 2.

**Status:** `[ ] pending`

---

### ST-13: OpenAI Adapter + Live Mode

**Intent:** Wire in real LLM calls so the system can handle tasks beyond the fixed demo scenario.

**Expected Outcomes:**
- `OpenAIAdapter` calls `gpt-4o` with structured output (JSON mode or function calling)
- Zod validation on every response; retry once on parse failure
- `DEMO_MODE=live` in `.env` switches the factory to `OpenAIAdapter`
- `OPENAI_API_KEY` is read from environment; server errors gracefully if missing

**Todo List:**
- [ ] Implement `backend/src/llm/openai-adapter.ts`
- [ ] Add timeout (30s) via `AbortController`
- [ ] Create `backend/.env.example`
- [ ] Test with the shopping cart scenario in live mode

**Relevant Context:** LLM adapter interface from ST-05.

**Status:** `[ ] pending`

---

### ST-14: Hardening + Tests

**Intent:** Make the codebase robust enough for a live demo without production infrastructure.

**Expected Outcomes:**
- Vitest unit tests for Supervisor state transitions (all happy path + test failure recovery)
- Zod validation on all route request bodies (returns `400 VALIDATION_ERROR`)
- SSE reconnection with `Last-Event-ID` header replays missed events
- `process.on('unhandledRejection')` logs and marks affected run as FAILED
- Frontend `ErrorBoundary` catches render errors
- README documents how to run both frontend and backend

**Todo List:**
- [ ] Create `backend/tests/supervisor.test.ts` — state machine unit tests
- [ ] Create `backend/tests/agents.test.ts` — agent output validation tests
- [ ] Add `Last-Event-ID` support to SSE broadcaster
- [ ] Add `process.on('unhandledRejection')` handler in `server.ts`
- [ ] Create `frontend/src/components/ErrorBoundary.tsx`
- [ ] Write `README.md` with setup + demo instructions

**Relevant Context:** Demo scenario from section 9 (use as test fixture).

**Status:** `[ ] pending`

---

*End of plan — 14 sub-tasks covering full implementation from scaffold to hardening.*
