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

/** Per-agent status from agentStatus map */
export type AgentRunStatus = "PENDING" | "IN_PROGRESS" | "DONE";

/** UI-side agent status (used by AgentCard for visual states) */
export type AgentStatus = "IDLE" | "ACTIVE" | "THINKING" | "ERROR" | "DONE";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EvidenceStatus = "PASS" | "FAIL" | "IN_PROGRESS" | "PENDING";

// ─── GET /api/task/:id ─────────────────────────────────────────────────────────

export interface HistoryEntry {
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}

export interface AgentFindings {
  affectedFiles: string[];
  affectedFunctions: string[];
  riskLevel: string;
  recommendation: string;
}

export interface AgentResult {
  agent: string;
  status: string;
  task: {
    taskId: string;
    agent: string;
    goal: string;
    assignedAt: string;
  };
  findings: AgentFindings;
  filesExamined: string[];
  filesModified: string[];
  confidence: string;
  recommendedNextAction: string;
  completedAt: string;
}

export interface TaskDetail {
  taskId: string;
  goal: string;
  status: SupervisorState;
  history: HistoryEntry[];
  agentStatus: Record<string, AgentRunStatus>;
  agentResults: Record<string, AgentResult | null>;
  retryCount: number;
  maxRetries: number;
  verification: unknown;
  risk: RiskLevel | null;
  createdAt: string;
  updatedAt: string;
}

// ─── GET /api/task/:id/evidence ────────────────────────────────────────────────

export interface EvidenceItem {
  label: string;
  status: EvidenceStatus;
  detail: string | null;
}

export interface EvidenceResponse {
  taskId: string;
  items: EvidenceItem[];
  updatedAt: string;
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
  taskId: "AF-1024",
  goal: "Add a 10% discount for premium customers without breaking checkout",
  status: "TESTING",
  history: [
    {
      from: "RECEIVED",
      to: "PLANNING",
      reason: "Task received, preparing decomposition",
      timestamp: "2026-09-26T10:00:00.000Z",
    },
    {
      from: "PLANNING",
      to: "ANALYZING",
      reason: "Agents assigned: CODE_INTELLIGENCE, TEST_QA",
      timestamp: "2026-09-26T10:00:04.000Z",
    },
    {
      from: "ANALYZING",
      to: "IMPLEMENTING",
      reason: "Both agents returned findings — 2 files, 2 functions affected",
      timestamp: "2026-09-26T10:00:15.000Z",
    },
    {
      from: "IMPLEMENTING",
      to: "TESTING",
      reason: "Implementation complete, running tests",
      timestamp: "2026-09-26T10:00:28.000Z",
    },
  ],
  agentStatus: {
    CODE_INTELLIGENCE: "DONE",
    TEST_QA: "IN_PROGRESS",
    DEBUG_REVIEW: "PENDING",
  },
  agentResults: {
    CODE_INTELLIGENCE: {
      agent: "CODE_INTELLIGENCE",
      status: "SUCCESS",
      task: {
        taskId: "AF-1024",
        agent: "CODE_INTELLIGENCE",
        goal: "Analyze impact of adding premium discount",
        assignedAt: "2026-09-26T10:00:04.000Z",
      },
      findings: {
        affectedFiles: [
          "src/checkout/checkout.js",
          "src/discounts/discountService.js",
        ],
        affectedFunctions: ["calculateDiscount", "processCheckout"],
        riskLevel: "MEDIUM",
        recommendation: "Modify discount calculation and add regression tests.",
      },
      filesExamined: [
        "src/checkout/checkout.js",
        "src/discounts/discountService.js",
      ],
      filesModified: [],
      confidence: "HIGH",
      recommendedNextAction: "Proceed to implementation",
      completedAt: "2026-09-26T10:00:12.000Z",
    },
    TEST_QA: null,
    DEBUG_REVIEW: null,
  },
  retryCount: 0,
  maxRetries: 3,
  verification: null,
  risk: "MEDIUM",
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T10:00:28.000Z",
};

// ─── Mock: GET /api/task/:id/evidence ─────────────────────────────────────────

export const MOCK_EVIDENCE: EvidenceResponse = {
  taskId: "AF-1024",
  items: [
    { label: "Requirement", status: "PASS", detail: "Requirement understood and decomposed" },
    { label: "Impact Analysis", status: "PASS", detail: "2 files, 2 functions identified" },
    { label: "Files Changed", status: "PASS", detail: "3" },
    { label: "Tests Executed", status: "IN_PROGRESS", detail: "11" },
    { label: "Tests Passed", status: "PENDING", detail: null },
    { label: "Regression", status: "PENDING", detail: null },
    { label: "Code Review", status: "PENDING", detail: null },
    { label: "Human Approval", status: "PENDING", detail: null },
  ],
  updatedAt: "2026-09-26T10:00:28.000Z",
};

// ─── Mock: GET /api/tasks ──────────────────────────────────────────────────────

export const MOCK_TASKS: TasksResponse = {
  tasks: [
    {
      taskId: "AF-1024",
      goal: "Add premium customer discount",
      status: "TESTING",
      createdAt: "2026-09-26T10:00:00.000Z",
      updatedAt: "2026-09-26T10:00:28.000Z",
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
    currentTask: "Analyze impact of adding premium discount",
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

/** Maps API agentStatus → UI AgentStatus */
export function toAgentStatus(s: AgentRunStatus): AgentStatus {
  if (s === "DONE") return "DONE";
  if (s === "IN_PROGRESS") return "THINKING";
  return "IDLE"; // PENDING
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

export const CODE_DIFF = `--- a/src/discounts/discountService.js
+++ b/src/discounts/discountService.js
@@ -12,6 +12,14 @@
 
 export function calculateDiscount(customer, cartTotal) {
-  return 0;
+  const isPremium = customer.tier === 'PREMIUM';
+  if (isPremium) {
+    return cartTotal * 0.10;
+  }
+  return 0;
 }
 
+export function applyDiscount(customer, cartTotal) {
+  const discount = calculateDiscount(customer, cartTotal);
+  return { total: cartTotal - discount, discount };
+}`;
