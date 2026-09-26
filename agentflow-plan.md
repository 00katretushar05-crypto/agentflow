# AgentFlow v0.1 — Architecture & Implementation Plan

## Top-Level Overview

AgentFlow is an AI Supervisor for software development workflows. A developer
submits a task; the Supervisor decomposes it, assigns work to specialised agents
in parallel where possible, collects structured results, detects failures, drives
recovery, and maintains a tamper-evident evidence ledger. The result is a polished
internal developer tool — not a demo script.

**Scope:** Full-stack TypeScript monorepo. Express backend + React/Vite frontend.
LLM calls via the OpenAI SDK (model-agnostic wrapper so the model can be swapped).
No databases — in-memory state only for v0.1 (explicitly acceptable: this is a
prototype; persistence adds no demo value and significant setup cost).

**Deliberate simplifications (and why each is acceptable):**
- In-memory state store: eliminates DB setup/seeding; state is reset on server
  restart which is fine because the demo is a single session.
- No auth: reduces setup and noise; the evaluator is looking at orchestration
  logic, not login flows.
- **No real LLM calls** — all agents run in fully simulated/stub mode with no
  external API dependencies. Stub responses are pre-scripted but include light
  phrase variation each run (structure and outcomes are deterministic; wording
  is slightly varied so it doesn't look canned). This is an explicit design
  choice: the demo must work offline, and the sophistication is in the
  orchestration logic, not in the LLM prompts. The `llmClient.ts` wrapper is
  still designed as if it would call a real LLM, so swapping in a real key
  is a one-line change.
- Simulated agent execution time via configurable async delays (`DEMO_AGENT_DELAY_MS`)
  keeps the UI lively and makes parallelism visually legible.
- Single Node process: no worker threads or queues needed at prototype scale.
- No RAG or vector DBs: agents receive task context in the prompt directly.
- **Frontend tests out of scope** for v0.1. Backend state machine and agent
  contracts are tested (vitest). Frontend correctness is validated visually
  during demo hardening.
- **shadcn/ui** used for base UI components (Button, Badge, Card, Dialog) so
  development effort stays on AgentFlow-specific UI, not generic primitives.

---

## 1. System Architecture

```
Developer Browser
      │
      ▼
  React (Vite)          ← Port 5173 (dev proxy → 3001)
      │  REST + SSE
      ▼
  Express API           ← Port 3001
      │
      ├── Supervisor (state machine)
      │       ├── Code Intelligence Agent
      │       ├── Test & QA Agent
      │       └── Debug & Review Agent
      │
      └── Evidence Ledger (in-memory append-only log)
```

**Why Express not Fastify/Hono:** Evaluators universally know Express; zero
onboarding cost. Fastify would save ~5% latency irrelevant at prototype scale.

**Why SSE not WebSockets:** SSE is unidirectional server→client, which is all
we need (clients POST commands, server streams events back). Simpler to implement
and debug than WS; no socket library needed.

**Why in-process agents not separate processes:** Inter-process communication
adds orchestration overhead with no demo benefit. The sophistication is in the
logic, not the topology.

**Why Vite not CRA/Next:** Fast HMR, zero config, no SSR overhead needed.

---

## 2. Frontend Architecture

### Component Hierarchy

```
App
├── Layout
│   ├── Sidebar (workflow list + status badges)
│   └── MainPanel
│       ├── TaskInputPanel          ← submit a new task
│       ├── WorkflowView            ← active/selected workflow
│       │   ├── SupervisorTimeline  ← state transitions with timestamps
│       │   ├── AgentGrid           ← 3 agent cards (parallel view)
│       │   │   └── AgentCard       ← status, current action, output preview
│       │   ├── EvidenceLedger      ← scrollable append-only log
│       │   └── ApprovalBanner      ← human approval prompt (when state=AWAITING_APPROVAL)
│       └── ResultPanel             ← final structured output
└── ToastStack                      ← non-blocking notifications
```

### State Management

- **Zustand** store (single `useWorkflowStore`) — lightweight, no boilerplate,
  TypeScript-native. Redux would be overkill; React Context would cause
  unnecessary re-renders across the tree.
- Store shape mirrors the backend `WorkflowRun` type exactly, so API responses
  can be merged directly with no transformation layer.
- SSE listener lives in a custom hook (`useWorkflowStream`) that patches the
  store on every event.

### Data Flow

```
POST /api/workflows        → creates WorkflowRun → store.setActive(run)
SSE /api/workflows/:id/stream → patches store on each event
GET /api/workflows/:id     → full state fetch on reconnect/refresh
POST /api/workflows/:id/approve → sends human approval
```

### Polish priorities (matters for live demo)
1. **Agent cards animate in parallel** when agents start — entering with a
   staggered slide-up so it's visually clear they are running concurrently.
2. **State transitions** on the SupervisorTimeline use a subtle pulse/glow on
   the active node to show the system is live, not frozen.
3. **Evidence ledger** rows stream in one at a time (appear as events arrive)
   with a fade-in — makes the "audit trail" feel real-time and credible.
4. **Recovery path** is highlighted in amber/orange so the failure→recovery
   cycle is visually distinct from the happy path — the evaluator sees it without
   having to read logs.
5. **ApprovalBanner** is full-width, high-contrast (indigo) with a short
   countdown timer — creates a moment of real human-in-the-loop drama.

---

## 3. Backend Architecture

### Module Boundaries

```
backend/src/
├── server.ts                   ← Express bootstrap, CORS, SSE middleware
├── routes/
│   └── workflows.ts            ← REST handlers (thin: validate → call service)
├── supervisor/
│   ├── supervisor.ts           ← State machine driver
│   ├── stateMachine.ts         ← Pure transition table (no side effects)
│   ├── taskDecomposer.ts       ← LLM call: task → subtasks[]
│   ├── requirementVerifier.ts  ← LLM call: results → pass/fail verdict
│   └── approvalGate.ts         ← Holds state until human unblocks
├── agents/
│   ├── agentRunner.ts          ← Shared runner: manages timeouts, retries, events
│   ├── codeIntelligenceAgent.ts
│   ├── testQaAgent.ts
│   └── debugReviewAgent.ts
├── ledger/
│   └── evidenceLedger.ts       ← Append-only in-memory log with typed entries
├── stream/
│   └── eventBus.ts             ← In-process pub/sub for SSE fan-out
├── types/
│   └── contracts.ts            ← All shared types (single source of truth)
└── llm/
    └── llmClient.ts            ← OpenAI wrapper: one function, retries, error types
```

### Supervisor ↔ Agent Communication

The Supervisor calls `agentRunner.run(agentType, task, context)` which:
1. Emits `agent:started` event to the event bus
2. Calls the agent's `execute()` function
3. Emits `agent:progress` events during execution
4. Returns a typed `AgentResult` or throws a typed `AgentError`
5. Emits `agent:completed` or `agent:failed`

No message queues. Direct async function calls within the same process. Simple
and fully debuggable.

### Failure Handling Location

- **LLM timeouts/API errors** → `llmClient.ts` catches, retries up to 2×,
  then throws `LlmError` with a structured message.
- **Agent logic failures** → `agentRunner.ts` catches `AgentError`, emits
  `agent:failed`, returns to Supervisor as a typed failure.
- **Supervisor recovery** → `supervisor.ts` detects failure, transitions to
  `RECOVERY` state, calls `debugReviewAgent`, then decides retry or abandon.
- **Unhandled promise rejections** → global handler in `server.ts` logs and
  emits an error event; never silently swallowed.

---

## 4. Supervisor State Machine

### States

| State | Meaning |
|---|---|
| `IDLE` | No active workflow |
| `DECOMPOSING` | LLM breaking task into subtasks |
| `PLANNING` | Building dependency graph, identifying parallel work |
| `EXECUTING` | Agents running (one or more in parallel) |
| `COLLECTING` | Waiting for all parallel agents to complete |
| `VERIFYING` | LLM checking results against original requirements |
| `RECOVERY` | Debug agent diagnosing a failure |
| `AWAITING_APPROVAL` | Human must approve before proceeding |
| `COMPLETE` | Workflow finished successfully |
| `FAILED` | Workflow abandoned (retry budget exhausted) |

### Transitions

```
IDLE           → DECOMPOSING        on: task submitted
DECOMPOSING    → PLANNING           on: subtasks produced
DECOMPOSING    → FAILED             on: LLM error (non-retryable)
PLANNING       → EXECUTING          on: dependency graph ready
EXECUTING      → COLLECTING         on: all parallel batches launched
COLLECTING     → VERIFYING          on: all agents in batch completed
COLLECTING     → RECOVERY           on: any agent failed
VERIFYING      → AWAITING_APPROVAL  on: requirements met
VERIFYING      → RECOVERY           on: requirements not met
RECOVERY       → EXECUTING          on: fix produced, retry approved (auto)
RECOVERY       → FAILED             on: retry budget exhausted (max 2 retries)
AWAITING_APPROVAL → COMPLETE        on: human approves
AWAITING_APPROVAL → FAILED          on: human rejects
```

### Retry Bounding

- Each subtask carries a `retryCount: number` (starts at 0).
- `RECOVERY` increments `retryCount`. If `retryCount >= 2`, transition to `FAILED`.
- The recovery loop is bounded: maximum 2 recovery cycles per subtask, then the
  workflow surfaces the failure for human review rather than looping forever.
- This prevents infinite loops in a live demo where an LLM might keep producing
  subtly wrong output.

---

## 5. Agent Responsibilities

### Code Intelligence Agent

**Purpose:** Understand the codebase context relevant to the task.

**Input:**
```ts
{
  taskDescription: string;
  relevantFiles?: string[];   // hints from decomposer
  projectContext: ProjectContext;
}
```

**Output:**
```ts
{
  codeAnalysis: {
    affectedAreas: string[];
    suggestedImplementation: string;
    potentialRisks: string[];
    estimatedComplexity: "low" | "medium" | "high";
  };
  generatedCode?: {
    files: Array<{ path: string; content: string; action: "create" | "modify" }>;
  };
}
```

**Done when:** Output includes at minimum `codeAnalysis.affectedAreas` and
`codeAnalysis.suggestedImplementation` with non-empty values. If code generation
was requested, `generatedCode.files` must be non-empty.

---

### Test & QA Agent

**Purpose:** Generate and evaluate tests for the produced code.

**Input:**
```ts
{
  taskDescription: string;
  codeOutput: CodeIntelligenceOutput;  // from Code Intelligence Agent
  testRequirements?: string[];
}
```

**Output:**
```ts
{
  testResults: {
    totalTests: number;
    passing: number;
    failing: number;
    coverage: number;           // 0–100
    failureDetails?: Array<{
      testName: string;
      reason: string;
      affectedCode: string;
    }>;
  };
  generatedTests?: {
    files: Array<{ path: string; content: string }>;
  };
}
```

**Done when:** `testResults.totalTests > 0`. If `failing > 0`, the agent is
done but signals failure — the Supervisor decides whether to recover, not the
agent.

---

### Debug & Review Agent

**Purpose:** Diagnose failures and produce a fix recommendation.

**Input:**
```ts
{
  failedAgent: AgentType;
  failureReason: string;
  originalTask: string;
  previousOutput: AgentOutput;   // the output that caused the failure
  retryCount: number;
}
```

**Output:**
```ts
{
  diagnosis: string;
  fixRecommendation: string;
  patchedOutput?: AgentOutput;    // corrected version of previousOutput
  shouldRetry: boolean;
  confidence: "low" | "medium" | "high";
}
```

**Done when:** `diagnosis` and `fixRecommendation` are non-empty strings, and
`shouldRetry` has been set explicitly.

---

## 6. Handoff Contracts

All data passed between Supervisor and agents, and into the ledger, is typed in
`backend/src/types/contracts.ts` — single source of truth, imported everywhere.

### WorkflowRun (top-level container)

```ts
interface WorkflowRun {
  id: string;                    // uuid
  taskDescription: string;
  status: SupervisorState;
  subtasks: Subtask[];
  agentResults: Map<string, AgentResult>;
  retryCount: number;
  ledger: LedgerEntry[];
  createdAt: string;             // ISO 8601
  updatedAt: string;
  approvalRequired: boolean;
  finalOutput?: FinalOutput;
}
```

### Subtask

```ts
interface Subtask {
  id: string;
  description: string;
  assignedAgent: AgentType;
  dependsOn: string[];           // other subtask IDs
  status: "pending" | "running" | "completed" | "failed";
  retryCount: number;
  output?: AgentOutput;
}
```

### AgentResult

```ts
interface AgentResult {
  subtaskId: string;
  agentType: AgentType;
  success: boolean;
  output?: AgentOutput;
  error?: AgentError;
  durationMs: number;
  completedAt: string;
}
```

### LedgerEntry (append-only evidence)

```ts
interface LedgerEntry {
  id: string;                    // sequential integer as string
  timestamp: string;             // ISO 8601
  category: "supervisor" | "agent" | "llm" | "human" | "system";
  event: string;                 // human-readable description
  data: Record<string, unknown>; // structured supporting data
  workflowId: string;
}
```

### SSE Event shape (server → browser)

```ts
interface WorkflowEvent {
  type:
    | "state:changed"
    | "agent:started"
    | "agent:progress"
    | "agent:completed"
    | "agent:failed"
    | "ledger:entry"
    | "approval:required"
    | "workflow:complete"
    | "workflow:failed";
  workflowId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
```

---

## 7. API Design

### Conventions
- All responses: `Content-Type: application/json`
- All error responses follow: `{ error: { code: string; message: string; details?: unknown } }`
- 4xx = client error (bad input), 5xx = server/agent error
- Timestamps: ISO 8601 strings throughout

### Endpoints

#### POST /api/workflows
Start a new workflow.

**Request:**
```json
{ "taskDescription": "string (required, 10–2000 chars)" }
```
**Response 201:**
```json
{
  "workflowId": "uuid",
  "status": "DECOMPOSING",
  "createdAt": "ISO 8601"
}
```
**Errors:** 400 (validation), 503 (LLM unavailable)

---

#### GET /api/workflows/:id
Full workflow state snapshot.

**Response 200:** Full `WorkflowRun` object (serialised — Map → object)
**Errors:** 404 (not found)

---

#### GET /api/workflows/:id/stream
SSE stream of `WorkflowEvent` objects for this workflow.

**Response:** `text/event-stream`  
Each event: `data: <JSON WorkflowEvent>\n\n`
**Errors:** 404 (workflow not found)

---

#### POST /api/workflows/:id/approve
Human approval gate.

**Request:**
```json
{ "decision": "approve" | "reject", "comment"?: "string" }
```
**Response 200:**
```json
{ "workflowId": "uuid", "newStatus": "COMPLETE" | "FAILED" }
```
**Errors:** 404, 409 (workflow not in AWAITING_APPROVAL state)

---

#### GET /api/workflows
List all workflows (for sidebar).

**Response 200:**
```json
{
  "workflows": [
    { "id": "uuid", "taskDescription": "...", "status": "...", "createdAt": "..." }
  ]
}
```

---

#### GET /api/health
Health check.

**Response 200:** `{ "status": "ok", "uptime": number }`

---

## 8. Folder Structure

```
agentflow/
├── README.md
├── agentflow-plan.md
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   └── workflows.ts
│   │   ├── supervisor/
│   │   │   ├── supervisor.ts
│   │   │   ├── stateMachine.ts
│   │   │   ├── taskDecomposer.ts
│   │   │   ├── requirementVerifier.ts
│   │   │   └── approvalGate.ts
│   │   ├── agents/
│   │   │   ├── agentRunner.ts
│   │   │   ├── codeIntelligenceAgent.ts
│   │   │   ├── testQaAgent.ts
│   │   │   └── debugReviewAgent.ts
│   │   ├── ledger/
│   │   │   └── evidenceLedger.ts
│   │   ├── stream/
│   │   │   └── eventBus.ts
│   │   ├── llm/
│   │   │   └── llmClient.ts
│   │   └── types/
│   │       └── contracts.ts
│   └── tests/
│       ├── supervisor.test.ts
│       ├── stateMachine.test.ts
│       └── agents.test.ts
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── store/
        │   └── workflowStore.ts
        ├── hooks/
        │   ├── useWorkflowStream.ts
        │   └── useWorkflowActions.ts
        ├── api/
        │   └── workflowApi.ts
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx
        │   │   └── MainPanel.tsx
        │   ├── workflow/
        │   │   ├── TaskInputPanel.tsx
        │   │   ├── WorkflowView.tsx
        │   │   ├── SupervisorTimeline.tsx
        │   │   ├── AgentGrid.tsx
        │   │   ├── AgentCard.tsx
        │   │   ├── EvidenceLedger.tsx
        │   │   └── ApprovalBanner.tsx
        │   ├── result/
        │   │   └── ResultPanel.tsx
        │   └── ui/
        │       ├── Badge.tsx
        │       ├── Button.tsx
        │       ├── Card.tsx
        │       ├── Spinner.tsx
        │       └── Toast.tsx
        ├── types/
        │   └── contracts.ts      ← copy/mirror of backend types (or shared pkg)
        └── styles/
            └── globals.css
```

---

## 9. Demo Scenario

**Task:** "Add a user profile endpoint to the Express API that returns
username, email, and last login time. Include input validation and tests."

This scenario is deterministic because:
- The task is concrete and unambiguous — the LLM always produces a consistent
  decomposition.
- The demo script pre-seeds a small number of controlled steps.
- The failure is **injected artificially** at the Test & QA Agent on the first
  run (a feature flag `DEMO_INJECT_TEST_FAILURE=true` in the env) so the
  recovery path always fires.

### Happy Path + Controlled Recovery

**Step 1 — Task submission**
Developer types the task and clicks "Run". Supervisor enters `DECOMPOSING`.

**Step 2 — Decomposition**
Supervisor LLM call produces 3 subtasks:
1. `Analyse API structure` → Code Intelligence Agent
2. `Implement /users/:id/profile endpoint` → Code Intelligence Agent
3. `Write and run tests for the endpoint` → Test & QA Agent

Subtasks 1 and 2 run in parallel (no dependency between them).

**Step 3 — Parallel execution visible**
UI shows both Code Intelligence Agent cards animating simultaneously.
Evidence ledger streams entries.

**Step 4 — Injected test failure**
Test & QA Agent reports `failing: 2` (injected). Supervisor transitions to
`RECOVERY`. AgentCard for Test & QA turns amber. Timeline shows the recovery
branch.

**Step 5 — Debug & Review Agent activates**
Diagnosis: "Test assertions use wrong response shape — `user.id` instead of
`user.userId`." Fix recommendation produced.

**Step 6 — Retry**
Supervisor replays Test & QA Agent with patched output. `retryCount` goes to 1.
This time all tests pass (injection only fires on `retryCount === 0`).

**Step 7 — Verification**
Supervisor LLM verifies results meet original requirements. Passes.

**Step 8 — Approval gate**
`AWAITING_APPROVAL` state. ApprovalBanner appears with the full result summary.
Developer clicks "Approve". Workflow moves to `COMPLETE`.

**Step 9 — Final output**
ResultPanel shows the generated code, test results, and full evidence ledger.

### Environment variable for demo control

```
DEMO_INJECT_TEST_FAILURE=true    # inject failure on first test run
DEMO_AGENT_DELAY_MS=1200         # artificial delay per agent step (for UX)
```

---

## 10. Implementation Order

Each phase ends with a demoable state, even if incomplete.

### Phase 1 — Backend skeleton + core types
**Goal:** Server starts, types defined, state machine pure logic works.
- Define all types in `contracts.ts`
- Implement pure `stateMachine.ts` (transition table, no LLM)
- Bootstrap `server.ts` with health endpoint
- Implement `evidenceLedger.ts`
- Implement `eventBus.ts`
- **Demoable:** `GET /api/health` returns 200; state machine unit tests pass

### Phase 2 — LLM client + agent stubs
**Goal:** Agents can be called and return structured (stubbed) output.
- Implement `llmClient.ts` with retry logic
- Implement all 3 agents with real LLM prompts but fallback stubs
- Implement `agentRunner.ts`
- **Demoable:** Can call each agent in isolation and get structured output

### Phase 3 — Supervisor orchestration loop
**Goal:** Full workflow runs end-to-end in the terminal (no UI yet).
- Implement `taskDecomposer.ts`
- Implement `requirementVerifier.ts`
- Implement `supervisor.ts` (full state machine driver)
- Wire up recovery path
- **Demoable:** `POST /api/workflows` triggers a full run; events logged to console

### Phase 4 — REST API + SSE
**Goal:** Backend fully accessible via HTTP.
- Implement all REST routes in `workflows.ts`
- Implement SSE stream endpoint
- In-memory workflow store (simple Map)
- **Demoable:** Can drive the full flow from curl / Postman

### Phase 5 — Frontend foundation
**Goal:** App loads, shows a workflow, streams events.
- Vite + React + Tailwind setup
- Zustand store wired to API
- `useWorkflowStream` hook consuming SSE
- Basic layout: Sidebar + WorkflowView (unstyled but functional)
- **Demoable:** Submit task from browser; see events in WorkflowView

### Phase 6 — Frontend polish
**Goal:** Looks like a real product.
- SupervisorTimeline with state glow animations
- AgentGrid with staggered parallel animation
- EvidenceLedger streaming rows
- ApprovalBanner with countdown
- ResultPanel with code diff view
- Responsive layout, dark-friendly colour scheme
- **Demoable:** Full happy path + recovery is visually compelling

### Phase 7 — Demo hardening
**Goal:** The demo never fails unexpectedly.
- Inject failure flag implemented and tested
- All edge cases in state machine exercised
- Agent prompts tuned for consistent output shape
- README with setup instructions and demo script
- **Demoable:** Repeatable demo run, every time

---

## Sub-Tasks for Implementation

### Sub-Task 1: Project Scaffolding & Shared Types
**Status:** [ ] pending

**Intent:** Set up both workspaces (backend + frontend) with correct configs,
install dependencies, and define all shared types in `contracts.ts`. Every
subsequent sub-task depends on this.

**Expected Outcomes:**
- `backend/package.json` with Express, uuid, zod, ts-node, vitest (no OpenAI SDK — fully stubbed)
- `frontend/package.json` with React, Vite, Tailwind CSS, Zustand, Framer Motion, shadcn/ui
- `backend/tsconfig.json` with strict mode
- `frontend/tsconfig.json` + `vite.config.ts`
- `backend/src/types/contracts.ts` fully populated with all types from Section 6
- `backend/.env.example`

**Todo:**
- [ ] Create `backend/package.json`
- [ ] Create `backend/tsconfig.json`
- [ ] Create `backend/.env.example`
- [ ] Create `frontend/package.json`
- [ ] Create `frontend/tsconfig.json`
- [ ] Create `frontend/vite.config.ts`
- [ ] Create `frontend/index.html`
- [ ] Populate `backend/src/types/contracts.ts`
- [ ] Create `frontend/src/types/contracts.ts` (mirrored frontend types)

**Relevant Context:** `backend/src/types/contracts.ts` exists but is empty.

---

### Sub-Task 2: Backend Core Infrastructure
**Status:** [ ] pending

**Intent:** Implement the non-agent backend modules: server bootstrap, event bus,
evidence ledger, and state machine. These are the foundation everything else calls.

**Expected Outcomes:**
- `server.ts` starts on port 3001 with CORS and JSON middleware
- `GET /api/health` returns `{ status: "ok", uptime: number }`
- `eventBus.ts` has typed `emit`, `on`, `off` methods
- `evidenceLedger.ts` appends entries and returns them by workflowId
- `stateMachine.ts` pure transition function passes unit tests
- `llmClient.ts` wraps OpenAI with retries and typed errors

**Todo:**
- [ ] Implement `src/server.ts`
- [ ] Implement `src/stream/eventBus.ts`
- [ ] Implement `src/ledger/evidenceLedger.ts`
- [ ] Implement `src/supervisor/stateMachine.ts`
- [ ] Implement `src/llm/llmClient.ts`
- [ ] Write `tests/stateMachine.test.ts`

**Relevant Context:** Section 3 (Backend Architecture), Section 4 (State Machine).

---

### Sub-Task 3: Agent Implementations
**Status:** [ ] pending

**Intent:** Implement all three agents in fully stubbed simulation mode — no real LLM
calls. Agents return pre-scripted structured JSON with light phrase variation. Implement
the shared `agentRunner.ts`.

**Expected Outcomes:**
- `agentRunner.ts` emits lifecycle events, handles timeouts, returns typed results
- Each agent returns deterministic-structure output with minor wording variation per run
- `llmClient.ts` is a no-op wrapper (architecture ready for a real key later)
- `tests/agents.test.ts` tests each agent's output shape and pass/fail contracts

**Todo:**
- [ ] Implement `src/agents/agentRunner.ts`
- [ ] Implement `src/agents/codeIntelligenceAgent.ts`
- [ ] Implement `src/agents/testQaAgent.ts`
- [ ] Implement `src/agents/debugReviewAgent.ts`
- [ ] Write `tests/agents.test.ts`

**Relevant Context:** Section 5 (Agent Responsibilities), Section 6 (Handoff Contracts).

---

### Sub-Task 4: Supervisor Orchestration
**Status:** [ ] pending

**Intent:** Implement the full Supervisor state machine driver — decomposition,
parallel scheduling, recovery, verification, approval gate.

**Expected Outcomes:**
- `supervisor.ts` drives a workflow from `IDLE` to `COMPLETE` or `FAILED`
- Recovery fires when an agent fails; retryCount is bounded at 2
- All state transitions emit events to the event bus
- All significant events are written to the evidence ledger
- Demo injection flag causes test failure on first run

**Todo:**
- [ ] Implement `src/supervisor/taskDecomposer.ts`
- [ ] Implement `src/supervisor/requirementVerifier.ts`
- [ ] Implement `src/supervisor/approvalGate.ts`
- [ ] Implement `src/supervisor/supervisor.ts`
- [ ] Write `tests/supervisor.test.ts`

**Relevant Context:** Section 4 (State Machine), Section 9 (Demo Scenario).

---

### Sub-Task 5: REST API & SSE Layer
**Status:** [ ] pending

**Intent:** Expose the Supervisor via HTTP. Add the in-memory workflow store and
all REST/SSE endpoints.

**Expected Outcomes:**
- All 5 endpoints from Section 7 are implemented and return correct shapes
- SSE streams `WorkflowEvent` objects live as the workflow runs
- Input validation uses Zod; errors return the standard error shape
- Full flow is driveable from curl with no UI

**Todo:**
- [ ] Add in-memory workflow store to `server.ts` (or a `store/workflowStore.ts`)
- [ ] Implement `src/routes/workflows.ts`
- [ ] Wire SSE: subscribe per-workflow to event bus, fan out to HTTP response
- [ ] Add Zod validation to all request bodies
- [ ] Test all endpoints manually via curl

**Relevant Context:** Section 7 (API Design), Section 3 (Backend Architecture).

---

### Sub-Task 6: Frontend Foundation
**Status:** [ ] pending

**Intent:** React app loads, connects to backend, and streams workflow events
into a functional (not yet polished) UI.

**Expected Outcomes:**
- App starts at localhost:5173
- Sidebar shows workflow list
- TaskInputPanel posts a new workflow
- WorkflowView renders agent states from SSE stream
- EvidenceLedger renders entries as they arrive
- ApprovalBanner appears when `status === AWAITING_APPROVAL`
- No visual polish required at this stage — just functional

**Todo:**
- [ ] Bootstrap Vite + React + Tailwind
- [ ] Implement `src/store/workflowStore.ts` (Zustand)
- [ ] Implement `src/api/workflowApi.ts`
- [ ] Implement `src/hooks/useWorkflowStream.ts`
- [ ] Implement `src/hooks/useWorkflowActions.ts`
- [ ] Implement layout components (Sidebar, MainPanel)
- [ ] Implement WorkflowView, AgentGrid, AgentCard (functional)
- [ ] Implement EvidenceLedger (functional)
- [ ] Implement ApprovalBanner (functional)
- [ ] Implement ResultPanel (functional)

**Relevant Context:** Section 2 (Frontend Architecture).

---

### Sub-Task 7: Frontend Polish & Animation
**Status:** [ ] pending

**Intent:** Make the UI look and feel like a professional internal tool. Apply
the polish priorities from Section 2.

**Expected Outcomes:**
- Design system: consistent colours (indigo primary, slate greys, amber for
  warnings), Inter font, clean spacing
- SupervisorTimeline: active state pulses with a glow ring
- AgentGrid: cards animate in with staggered slide-up (Framer Motion)
- EvidenceLedger: rows fade in as they stream
- ApprovalBanner: high-contrast, with a 30-second countdown timer
- Recovery path: AgentCard turns amber, then green on resolution
- ResultPanel: code blocks with syntax highlighting
- Overall: comparable in visual quality to Linear or Vercel dashboards

**Todo:**
- [ ] Set up Tailwind design tokens (colours, fonts, spacing)
- [ ] Style layout components
- [ ] Animate SupervisorTimeline (Framer Motion)
- [ ] Animate AgentGrid cards (staggered entrance)
- [ ] Animate EvidenceLedger rows (fade-in)
- [ ] Style and animate ApprovalBanner with countdown
- [ ] Style AgentCard state variants (running/success/failure/recovery)
- [ ] Add syntax highlighting to ResultPanel (using `highlight.js` or `prism`)
- [ ] Polish Sidebar with status badges
- [ ] Responsive: ensure 1280px+ layout works for demo

**Relevant Context:** Section 2 (Frontend Architecture — Polish priorities).

---

### Sub-Task 8: Demo Hardening & README
**Status:** [ ] pending

**Intent:** Make the demo fully repeatable and reliable. Write the README.

**Expected Outcomes:**
- `DEMO_INJECT_TEST_FAILURE` flag correctly injects and recovers
- `DEMO_AGENT_DELAY_MS` makes progress visible in the UI
- README has: setup steps, env var explanations, demo script
- Full demo run (happy path + recovery) completes without errors

**Todo:**
- [ ] Verify demo injection flag works end-to-end
- [ ] Tune agent delays for good demo pacing
- [ ] Write root `README.md` with setup and demo script
- [ ] Final end-to-end test run

**Relevant Context:** Section 9 (Demo Scenario).
