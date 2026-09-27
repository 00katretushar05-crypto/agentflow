// ─── API-aligned Types ─────────────────────────────────────────────────────────
// Matches GET /api/task/:id, GET /api/task/:id/evidence, GET /api/tasks

export type SupervisorState =
  | "RECEIVED"
  | "PLANNING"
  | "ANALYZING"
  | "IMPLEMENTING"
  | "TESTING"
  | "FAILED"
  | "RECOVERING"
  | "RETESTING"
  | "VERIFYING"
  | "AWAITING_APPROVAL"
  | "VERIFIED";

/** Per-agent status from agentStatus array — real API values */
export type AgentRunStatus = "SUCCESS" | "FAILURE" | "PARTIAL" | "SKIPPED";

/** UI-side agent status (used by AgentCard for visual states) */
export type AgentStatus = "IDLE" | "ACTIVE" | "THINKING" | "ERROR" | "DONE" | "PARTIAL" | "SKIPPED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EvidenceStatus = "PASS" | "FAIL" | "IN_PROGRESS" | "PENDING";

// ─── GET /api/task/:id ─────────────────────────────────────────────────────────

export interface HistoryEntry {
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}

/** Single entry from the agentStatus array */
export interface AgentStatusEntry {
  agent: string;
  status: AgentRunStatus;
  updatedAt: string;
}

export interface AgentFindings {
  affectedFiles: string[];
  affectedFunctions: string[];
  riskLevel: string;
  recommendation: string;
}

export interface TestResult {
  totalTests: number;
  passed: number;
  failed: number;
  failures: string[];
  executedAt: string;
}

export interface AgentResult {
  agent: string;
  status: string;
  task: {
    taskId: string;
    agent: string;
    goal: string;
    context?: Record<string, unknown>;
    assignedAt: string;
  };
  /** CODE_INTELLIGENCE findings */
  findings?: AgentFindings;
  /** TEST_QA test results */
  testResult?: TestResult;
  /** DEBUG_REVIEW failure report */
  failureReport?: {
    testFailure: string;
    stackTrace: string;
    relevantCode: string;
    rootCause: string;
    confidence: string;
  };
  filesExamined: string[];
  filesModified: string[];
  proposedModifications?: string[];
  confidence: string;
  recommendedNextAction: string;
  completedAt: string;
}

export interface Verification {
  requirementsMet: boolean;
  testsExecuted: number;
  testsPassed: number;
  regressionPassed: boolean;
  codeReviewed: boolean;
}

export interface RiskAssessment {
  filesAffected: number;
  functionsAffected: number;
  testsCovered: number;
  dependencyImpact: string;
  riskPercent: number;
  recommendation: string;
}

export interface TaskDetail {
  taskId: string;
  goal: string;
  status: SupervisorState;
  history: HistoryEntry[];
  /** Real API: array of { agent, status, updatedAt } */
  agentStatus: AgentStatusEntry[];
  agentResults: Record<string, AgentResult | null>;
  retryCount: number;
  maxRetries: number;
  verification: Verification | null;
  riskAssessment: RiskAssessment | null;
  createdAt: string;
  updatedAt: string;
}

// ─── GET /api/task/:id/evidence ────────────────────────────────────────────────

export interface EvidenceLogItem {
  seq: number;
  type: "TRANSITION" | "AGENT_RESULT" | string;
  timestamp: string;
  summary: string;
  payload?: unknown;
}

export interface EvidenceResponse {
  taskId: string;
  items: EvidenceLogItem[];
}

// ─── GET /api/tasks ────────────────────────────────────────────────────────────

export interface TaskSummary {
  taskId: string;
  goal: string;
  status: SupervisorState;
  createdAt: string;
  updatedAt: string;
}

export interface TasksResponse {
  tasks: TaskSummary[];
}

// ─── Legacy Agent type (used by AgentCard) ─────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  model: string;
  tasksCompleted: number;
  currentTask: string | null;
  lastActive: string;
  successRate: number;
}

// ─── ActivityEntry (used by ActivityFeed) ──────────────────────────────────────
// Derived from HistoryEntry — feed maps history[].reason as the message

export interface ActivityEntry {
  id: string;
  timestamp: string;
  agent: string;
  type: "info" | "success" | "warning" | "error" | "code";
  message: string;
}

// ─── WorkflowStage (used by WorkflowTimeline) ──────────────────────────────────

export type WorkflowStage =
  | "Planning"
  | "Analyzing"
  | "Implementing"
  | "Testing"
  | "Verification"
  | "Approval";

// Maps SupervisorState → WorkflowStage for the timeline
export function supervisorStateToStage(state: SupervisorState): WorkflowStage {
  const map: Record<SupervisorState, WorkflowStage> = {
    RECEIVED: "Planning",
    PLANNING: "Planning",
    ANALYZING: "Analyzing",
    IMPLEMENTING: "Implementing",
    TESTING: "Testing",
    RETESTING: "Testing",
    RECOVERING: "Testing",
    FAILED: "Testing",
    VERIFYING: "Verification",
    AWAITING_APPROVAL: "Approval",
    VERIFIED: "Approval",
  };
  return map[state] ?? "Planning";
}

// ─── Mock: GET /api/task/:id ───────────────────────────────────────────────────

export const MOCK_TASK: TaskDetail = {
  taskId: "322a7d8f-5536-451a-92ec-ad5b74c9c7fc",
  goal: "Add a 10% discount for premium customers without breaking checkout",
  status: "AWAITING_APPROVAL",
  history: [
    {
      from: "RECEIVED",
      to: "RECEIVED",
      reason: "Task created with goal: \"Add a 10% discount for premium customers without breaking checkout\"",
      timestamp: "2026-09-27T04:34:12.143Z",
    },
    {
      from: "RECEIVED",
      to: "PLANNING",
      reason: "Supervisor accepted the task and is decomposing it into subtasks.",
      timestamp: "2026-09-27T04:34:12.155Z",
    },
    {
      from: "PLANNING",
      to: "ANALYZING",
      reason: "Task decomposed into 3 subtasks: CODE_INTELLIGENCE, TEST_QA, DEBUG_REVIEW.",
      timestamp: "2026-09-27T04:34:12.155Z",
    },
    {
      from: "ANALYZING",
      to: "IMPLEMENTING",
      reason: "Code Intelligence analysis complete. Proceeding to implementation phase.",
      timestamp: "2026-09-27T04:34:30.911Z",
    },
    {
      from: "IMPLEMENTING",
      to: "TESTING",
      reason: "Implementation complete. Running test suite to verify correctness.",
      timestamp: "2026-09-27T04:34:31.413Z",
    },
    {
      from: "TESTING",
      to: "FAILED",
      reason: "TEST_QA reported 1 test failure(s): getDiscount — integration via checkout should give premium customers a 10% discount via checkout",
      timestamp: "2026-09-27T04:34:32.787Z",
    },
    {
      from: "FAILED",
      to: "RECOVERING",
      reason: "Recovery attempt 1/2. Dispatching DEBUG_REVIEW agent to diagnose failure.",
      timestamp: "2026-09-27T04:34:32.787Z",
    },
    {
      from: "RECOVERING",
      to: "RETESTING",
      reason: "DEBUG_REVIEW complete. Root cause: \"Field-name mismatch between checkout.js and discountService.js: checkout.js passes { type: customer.type } to getDiscount(), but discountService.js checks customer.membership. Because membership is always undefined at runtime, the premium branch is never entered and premium customers receive 0% discount instead of 10%.\n\nProposed minimal fix: In src/checkout/checkout.js, change:\n  getDiscount({ type: customer.type })\nto:\n  getDiscount({ membership: customer.type })\". Re-running test suite.",
      timestamp: "2026-09-27T04:34:32.790Z",
    },
    {
      from: "RETESTING",
      to: "VERIFYING",
      reason: "All 10 tests passed after recovery attempt 1. Proceeding to verification.",
      timestamp: "2026-09-27T04:34:33.945Z",
    },
    {
      from: "VERIFYING",
      to: "AWAITING_APPROVAL",
      reason: "Verification passed: all 10 tests pass, regression clear, requirements met. Waiting for human approval before marking VERIFIED. Note: this run required 1 recovery attempt(s) — review DEBUG_REVIEW's diagnosis before approving.",
      timestamp: "2026-09-27T04:34:34.253Z",
    },
  ],
  agentStatus: [
    { agent: "CODE_INTELLIGENCE", status: "SUCCESS", updatedAt: "2026-09-27T04:34:12.208Z" },
    { agent: "TEST_QA", status: "SUCCESS", updatedAt: "2026-09-27T04:34:33.945Z" },
    { agent: "DEBUG_REVIEW", status: "SUCCESS", updatedAt: "2026-09-27T04:34:32.790Z" },
  ],
  agentResults: {
    CODE_INTELLIGENCE: {
      agent: "CODE_INTELLIGENCE",
      status: "SUCCESS",
      task: {
        taskId: "322a7d8f-5536-451a-92ec-ad5b74c9c7fc:CODE_INTELLIGENCE:dbc56519-7224-48a5-bac8-6cce3f7398ab",
        agent: "CODE_INTELLIGENCE",
        goal: "Analyse the codebase to understand the current implementation relevant to adding premium discount.",
        context: { phase: "analysis" },
        assignedAt: "2026-09-27T04:34:12.155Z",
      },
      findings: {
        affectedFiles: [
          "src/checkout/checkout.js",
          "src/discounts/discountService.js",
          "src/orders/orderService.js",
          "src/users/userService.js",
        ],
        affectedFunctions: ["checkout", "getDiscount", "createOrder", "getUserById"],
        riskLevel: "MEDIUM",
        recommendation: "4 file(s) are relevant. Dependency edges: src/checkout/checkout.js → [src/discounts/discountService.js, src/orders/orderService.js, src/users/userService.js]. Risk is MEDIUM — review all callers before modifying shared services.",
      },
      filesExamined: [
        "src/checkout/checkout.js",
        "src/discounts/discountService.js",
        "src/orders/orderService.js",
        "src/users/userService.js",
      ],
      filesModified: [],
      proposedModifications: [
        "src/checkout/checkout.js",
        "src/discounts/discountService.js",
        "src/orders/orderService.js",
        "src/users/userService.js",
      ],
      confidence: "MEDIUM",
      recommendedNextAction: "Proceed to Test & QA analysis.",
      completedAt: "2026-09-27T04:34:12.208Z",
    },
    TEST_QA: {
      agent: "TEST_QA",
      status: "SUCCESS",
      task: {
        taskId: "322a7d8f-5536-451a-92ec-ad5b74c9c7fc:TEST_QA:9f98f6e9-5ffb-474c-8586-a0f3c3749417",
        agent: "TEST_QA",
        goal: "Run the full test suite and provide a pass/fail baseline.",
        context: { phase: "baseline-testing", retryCount: 1 },
        assignedAt: "2026-09-27T04:34:32.790Z",
      },
      testResult: {
        totalTests: 10,
        passed: 10,
        failed: 0,
        failures: [],
        executedAt: "2026-09-27T04:34:33.944Z",
      },
      filesExamined: [
        "tests/checkout.test.js",
        "tests/discount.test.js",
        "tests/order.test.js",
      ],
      filesModified: [],
      confidence: "HIGH",
      recommendedNextAction: "All tests pass.",
      completedAt: "2026-09-27T04:34:33.945Z",
    },
    DEBUG_REVIEW: {
      agent: "DEBUG_REVIEW",
      status: "SUCCESS",
      task: {
        taskId: "322a7d8f-5536-451a-92ec-ad5b74c9c7fc:DEBUG_REVIEW:384984c0-8bfe-4bc1-83a2-6fd5072e547a",
        agent: "DEBUG_REVIEW",
        goal: "If tests fail after implementation, diagnose root cause and propose a fix.",
        context: { phase: "post-implementation-debug" },
        assignedAt: "2026-09-27T04:34:32.787Z",
      },
      failureReport: {
        testFailure: "getDiscount — integration via checkout should give premium customers a 10% discount via checkout",
        stackTrace: "Expected: 10\nReceived: 0",
        relevantCode: "FAIL  getDiscount — integration via checkout should give premium customers a 10% discount via checkout\n  Expected: 10\n  Received: 0",
        rootCause: "Field-name mismatch between checkout.js and discountService.js: checkout.js passes { type: customer.type } to getDiscount(), but discountService.js checks customer.membership. Because membership is always undefined at runtime, the premium branch is never entered and premium customers receive 0% discount instead of 10%.\n\nProposed minimal fix: In src/checkout/checkout.js, change:\n  getDiscount({ type: customer.type })\nto:\n  getDiscount({ membership: customer.type })",
        confidence: "HIGH",
      },
      filesExamined: ["src/checkout/checkout.js", "src/discounts/discountService.js"],
      filesModified: ["src/checkout/checkout.js"],
      confidence: "HIGH",
      recommendedNextAction: "Fix applied — rerun TEST_QA to confirm the regression is resolved.",
      completedAt: "2026-09-27T04:34:32.790Z",
    },
  },
  retryCount: 1,
  maxRetries: 2,
  verification: {
    requirementsMet: true,
    testsExecuted: 10,
    testsPassed: 10,
    regressionPassed: true,
    codeReviewed: true,
  },
  riskAssessment: {
    filesAffected: 4,
    functionsAffected: 4,
    testsCovered: 10,
    dependencyImpact: "MEDIUM",
    riskPercent: 75,
    recommendation: "High risk: manual review required before proceeding.",
  },
  createdAt: "2026-09-27T04:34:12.143Z",
  updatedAt: "2026-09-27T04:34:34.253Z",
};

// ─── Mock: GET /api/task/:id/evidence ─────────────────────────────────────────

export const MOCK_EVIDENCE: EvidenceResponse = {
  taskId: "322a7d8f-5536-451a-92ec-ad5b74c9c7fc",
  items: [
    {
      seq: 1,
      type: "TRANSITION",
      timestamp: "2026-09-27T04:34:12.143Z",
      summary: "Task created with goal: \"Add a 10% discount for premium customers without breaking checkout\"",
    },
    {
      seq: 2,
      type: "TRANSITION",
      timestamp: "2026-09-27T04:34:12.155Z",
      summary: "Supervisor accepted the task and is decomposing it into subtasks.",
    },
    {
      seq: 3,
      type: "AGENT_RESULT",
      timestamp: "2026-09-27T04:34:12.208Z",
      summary: "CODE_INTELLIGENCE completed analysis. 4 files affected, risk MEDIUM.",
    },
    {
      seq: 4,
      type: "TRANSITION",
      timestamp: "2026-09-27T04:34:31.413Z",
      summary: "Implementation complete. Running test suite to verify correctness.",
    },
    {
      seq: 5,
      type: "AGENT_RESULT",
      timestamp: "2026-09-27T04:34:32.787Z",
      summary: "TEST_QA reported 1 failure: getDiscount — integration via checkout.",
    },
    {
      seq: 6,
      type: "AGENT_RESULT",
      timestamp: "2026-09-27T04:34:32.790Z",
      summary: "DEBUG_REVIEW identified field-name mismatch. Fix applied to src/checkout/checkout.js.",
    },
    {
      seq: 7,
      type: "AGENT_RESULT",
      timestamp: "2026-09-27T04:34:33.945Z",
      summary: "TEST_QA re-run: 10/10 tests passed after recovery.",
    },
    {
      seq: 8,
      type: "TRANSITION",
      timestamp: "2026-09-27T04:34:34.253Z",
      summary: "Verification passed. Awaiting human approval.",
    },
  ],
};

// ─── Mock: GET /api/tasks ──────────────────────────────────────────────────────

export const MOCK_TASKS: TasksResponse = {
  tasks: [
    {
      taskId: "322a7d8f-5536-451a-92ec-ad5b74c9c7fc",
      goal: "Add premium customer discount",
      status: "AWAITING_APPROVAL",
      createdAt: "2026-09-27T04:34:12.143Z",
      updatedAt: "2026-09-27T04:34:34.253Z",
    },
    {
      taskId: "AF-1023",
      goal: "Fix payment bug",
      status: "VERIFIED",
      createdAt: "2026-09-26T09:40:00.000Z",
      updatedAt: "2026-09-26T09:52:00.000Z",
    },
    {
      taskId: "AF-1022",
      goal: "Order validation",
      status: "VERIFIED",
      createdAt: "2026-09-26T09:10:00.000Z",
      updatedAt: "2026-09-26T09:25:00.000Z",
    },
    {
      taskId: "AF-1021",
      goal: "Cart calculation",
      status: "FAILED",
      createdAt: "2026-09-26T08:50:00.000Z",
      updatedAt: "2026-09-26T09:05:00.000Z",
    },
  ],
};

// ─── Derived: Agent cards for the active task ─────────────────────────────────
// Static metadata; agentStatus from the API drives the live status in MissionControl

export const AGENT_META: Record<string, Omit<Agent, "status">> = {
  CODE_INTELLIGENCE: {
    id: "CODE_INTELLIGENCE",
    name: "Code Intelligence",
    role: "Analysis & Impact Mapping",
    model: "Claude 3.7 Sonnet",
    tasksCompleted: 312,
    currentTask: "Analyse impact of adding premium discount",
    lastActive: "just now",
    successRate: 94.7,
  },
  TEST_QA: {
    id: "TEST_QA",
    name: "Test QA",
    role: "Testing & Validation",
    model: "GPT-4o-mini",
    tasksCompleted: 289,
    currentTask: "Running checkout test suite",
    lastActive: "just now",
    successRate: 97.1,
  },
  DEBUG_REVIEW: {
    id: "DEBUG_REVIEW",
    name: "Debug Review",
    role: "Error Recovery & Analysis",
    model: "Claude 3.5 Haiku",
    tasksCompleted: 58,
    currentTask: null,
    lastActive: "—",
    successRate: 91.4,
  },
};

/** Maps real API agentStatus → UI AgentStatus */
export function toAgentStatus(s: AgentRunStatus): AgentStatus {
  if (s === "SUCCESS") return "DONE";
  if (s === "FAILURE") return "ERROR";
  if (s === "PARTIAL") return "PARTIAL";
  if (s === "SKIPPED") return "SKIPPED";
  return "IDLE";
}

// ─── Workflow Stages ────────────────────────────────────────────────────────────

export const WORKFLOW_STAGES: WorkflowStage[] = [
  "Planning",
  "Analyzing",
  "Implementing",
  "Testing",
  "Verification",
  "Approval",
];

// ─── Code Diff (unchanged visual demo) ────────────────────────────────────────

export const CODE_DIFF = `--- a/src/checkout/checkout.js
+++ b/src/checkout/checkout.js
@@ -18,7 +18,7 @@
 
 async function checkout(userId, cart) {
   const user = await getUserById(userId);
-  const discount = getDiscount({ type: customer.type });
+  const discount = getDiscount({ membership: customer.type });
   const order = await createOrder(user, cart, discount);
   return order;
 }`;
