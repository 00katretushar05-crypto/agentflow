// ─── Demo Data ────────────────────────────────────────────────────────────────

export type TaskStatus = "VERIFIED" | "RECOVERED" | "FAILED" | "IN_PROGRESS" | "PENDING";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AgentStatus = "IDLE" | "ACTIVE" | "THINKING" | "ERROR" | "DONE";
export type WorkflowStage =
  | "Planning"
  | "Analyzing"
  | "Implementing"
  | "Testing"
  | "Verification"
  | "Approval";

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

export interface ActivityEntry {
  id: string;
  timestamp: string;
  agent: string;
  type: "info" | "success" | "warning" | "error" | "code";
  message: string;
}

export interface EvidenceItem {
  id: string;
  label: string;
  status: "PASS" | "FAIL" | "PENDING" | "SKIPPED";
  detail: string;
  timestamp?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  riskLevel: RiskLevel;
  stage: WorkflowStage;
  createdAt: string;
  completedAt?: string;
  duration?: string;
  agents: string[];
  filesChanged: number;
  testsRun: number;
  testsPassed: number;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export const AGENTS: Agent[] = [
  {
    id: "supervisor",
    name: "Supervisor",
    role: "Orchestration & Planning",
    status: "ACTIVE",
    model: "GPT-4o",
    tasksCompleted: 47,
    currentTask: "Orchestrating implementation of auth middleware",
    lastActive: "just now",
    successRate: 98.2,
  },
  {
    id: "code-agent",
    name: "Code Agent",
    role: "Implementation & Refactoring",
    status: "THINKING",
    model: "Claude 3.7 Sonnet",
    tasksCompleted: 312,
    currentTask: "Writing JWT validation middleware",
    lastActive: "2s ago",
    successRate: 94.7,
  },
  {
    id: "qa-agent",
    name: "QA Agent",
    role: "Testing & Validation",
    status: "IDLE",
    model: "GPT-4o-mini",
    tasksCompleted: 289,
    currentTask: null,
    lastActive: "4m ago",
    successRate: 97.1,
  },
  {
    id: "debug-agent",
    name: "Debug Agent",
    role: "Error Recovery & Analysis",
    status: "IDLE",
    model: "Claude 3.5 Haiku",
    tasksCompleted: 58,
    currentTask: null,
    lastActive: "12m ago",
    successRate: 91.4,
  },
];

// ─── Activity Feed ─────────────────────────────────────────────────────────────

export const ACTIVITY: ActivityEntry[] = [
  {
    id: "a1",
    timestamp: "14:32:01",
    agent: "Supervisor",
    type: "info",
    message: "Task decomposed into 4 subtasks. Assigning to Code Agent.",
  },
  {
    id: "a2",
    timestamp: "14:32:04",
    agent: "Code Agent",
    type: "code",
    message: "Created src/middleware/auth.ts — JWT validation scaffold",
  },
  {
    id: "a3",
    timestamp: "14:32:18",
    agent: "Code Agent",
    type: "code",
    message: "Modified src/routes/api.ts — attached auth middleware to /api/v2",
  },
  {
    id: "a4",
    timestamp: "14:32:45",
    agent: "QA Agent",
    type: "info",
    message: "Running test suite: 147 tests in 12 files",
  },
  {
    id: "a5",
    timestamp: "14:33:02",
    agent: "QA Agent",
    type: "warning",
    message: "2 tests failed: auth.test.ts — token expiry edge case",
  },
  {
    id: "a6",
    timestamp: "14:33:05",
    agent: "Supervisor",
    type: "info",
    message: "Failure detected. Delegating recovery to Code Agent.",
  },
  {
    id: "a7",
    timestamp: "14:33:12",
    agent: "Code Agent",
    type: "success",
    message: "Fixed token expiry handling. Patched 2 lines in auth.ts.",
  },
  {
    id: "a8",
    timestamp: "14:33:20",
    agent: "QA Agent",
    type: "success",
    message: "All 147 tests passing. Coverage: 94.3%",
  },
  {
    id: "a9",
    timestamp: "14:33:25",
    agent: "Supervisor",
    type: "info",
    message: "Verification complete. Awaiting human approval.",
  },
];

// ─── Evidence ─────────────────────────────────────────────────────────────────

export const EVIDENCE_ITEMS: EvidenceItem[] = [
  {
    id: "e1",
    label: "Requirement",
    status: "PASS",
    detail: "Implement JWT authentication middleware for /api/v2 routes",
    timestamp: "14:32:00",
  },
  {
    id: "e2",
    label: "Impact Analysis",
    status: "PASS",
    detail: "3 files affected: auth.ts (new), api.ts (modified), user.service.ts (modified)",
    timestamp: "14:32:03",
  },
  {
    id: "e3",
    label: "Files Changed",
    status: "PASS",
    detail: "src/middleware/auth.ts (+142 lines), src/routes/api.ts (+8 -2), src/services/user.service.ts (+4 -1)",
    timestamp: "14:33:12",
  },
  {
    id: "e4",
    label: "Tests Executed",
    status: "PASS",
    detail: "147 test cases across 12 files executed in 3.2s",
    timestamp: "14:33:20",
  },
  {
    id: "e5",
    label: "Tests Passed",
    status: "PASS",
    detail: "147/147 tests passed. Coverage: 94.3% (+1.2% from baseline)",
    timestamp: "14:33:20",
  },
  {
    id: "e6",
    label: "Regression",
    status: "PASS",
    detail: "No regressions detected. All pre-existing tests intact.",
    timestamp: "14:33:22",
  },
  {
    id: "e7",
    label: "Code Review",
    status: "PASS",
    detail: "Static analysis: 0 critical, 0 high, 2 info (non-blocking). ESLint: clean.",
    timestamp: "14:33:24",
  },
  {
    id: "e8",
    label: "Human Approval",
    status: "PENDING",
    detail: "Awaiting engineer sign-off before merge to main.",
    timestamp: "14:33:25",
  },
];

// ─── Task History ──────────────────────────────────────────────────────────────

export const TASKS: Task[] = [
  {
    id: "task-001",
    title: "Implement JWT Auth Middleware",
    description: "Add token-based authentication to all /api/v2 endpoints with refresh token support.",
    status: "IN_PROGRESS",
    riskLevel: "MEDIUM",
    stage: "Verification",
    createdAt: "2025-01-15T14:32:00Z",
    agents: ["supervisor", "code-agent", "qa-agent"],
    filesChanged: 3,
    testsRun: 147,
    testsPassed: 147,
  },
  {
    id: "task-002",
    title: "Refactor Database Connection Pool",
    description: "Migrate from pg to pgPool with automatic reconnection and health checks.",
    status: "VERIFIED",
    riskLevel: "HIGH",
    stage: "Approval",
    createdAt: "2025-01-14T09:15:00Z",
    completedAt: "2025-01-14T11:43:00Z",
    duration: "2h 28m",
    agents: ["supervisor", "code-agent", "qa-agent", "debug-agent"],
    filesChanged: 8,
    testsRun: 203,
    testsPassed: 203,
  },
  {
    id: "task-003",
    title: "Add Rate Limiting to Public API",
    description: "Implement sliding window rate limiting with Redis backend for all public endpoints.",
    status: "VERIFIED",
    riskLevel: "LOW",
    stage: "Approval",
    createdAt: "2025-01-13T16:00:00Z",
    completedAt: "2025-01-13T17:22:00Z",
    duration: "1h 22m",
    agents: ["supervisor", "code-agent", "qa-agent"],
    filesChanged: 5,
    testsRun: 89,
    testsPassed: 89,
  },
  {
    id: "task-004",
    title: "Migrate Email Service to SendGrid",
    description: "Replace legacy SMTP with SendGrid API, add template support and delivery tracking.",
    status: "RECOVERED",
    riskLevel: "MEDIUM",
    stage: "Approval",
    createdAt: "2025-01-12T10:30:00Z",
    completedAt: "2025-01-12T13:15:00Z",
    duration: "2h 45m",
    agents: ["supervisor", "code-agent", "qa-agent", "debug-agent"],
    filesChanged: 12,
    testsRun: 54,
    testsPassed: 54,
  },
  {
    id: "task-005",
    title: "Add OpenTelemetry Tracing",
    description: "Instrument all service calls with OTEL spans and export to Jaeger collector.",
    status: "FAILED",
    riskLevel: "CRITICAL",
    stage: "Testing",
    createdAt: "2025-01-11T08:00:00Z",
    completedAt: "2025-01-11T12:00:00Z",
    duration: "4h 00m",
    agents: ["supervisor", "code-agent", "qa-agent", "debug-agent"],
    filesChanged: 0,
    testsRun: 34,
    testsPassed: 19,
  },
  {
    id: "task-006",
    title: "Cache Layer for Product Catalog",
    description: "Add Redis caching with 5-minute TTL for product listing and search queries.",
    status: "VERIFIED",
    riskLevel: "LOW",
    stage: "Approval",
    createdAt: "2025-01-10T14:00:00Z",
    completedAt: "2025-01-10T15:30:00Z",
    duration: "1h 30m",
    agents: ["supervisor", "code-agent", "qa-agent"],
    filesChanged: 6,
    testsRun: 112,
    testsPassed: 112,
  },
];

// ─── Workflow Stages ────────────────────────────────────────────────────────────

export const WORKFLOW_STAGES: WorkflowStage[] = [
  "Planning",
  "Analyzing",
  "Implementing",
  "Testing",
  "Verification",
  "Approval",
];

export const CODE_DIFF = `--- a/src/middleware/auth.ts
+++ b/src/middleware/auth.ts
@@ -0,0 +1,48 @@
+import { Request, Response, NextFunction } from 'express';
+import jwt from 'jsonwebtoken';
+import { UserService } from '../services/user.service';
+
+const JWT_SECRET = process.env.JWT_SECRET!;
+const TOKEN_EXPIRY_BUFFER = 30; // seconds
+
+export interface AuthRequest extends Request {
+  user?: { id: string; role: string; email: string };
+}
+
+export async function authMiddleware(
+  req: AuthRequest,
+  res: Response,
+  next: NextFunction
+): Promise<void> {
+  const header = req.headers.authorization;
+  if (!header?.startsWith('Bearer ')) {
+    res.status(401).json({ error: 'Missing authorization header' });
+    return;
+  }
+
+  const token = header.slice(7);
+  try {
+    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
+
+    // Check if token is about to expire — issue refresh hint
+    const now = Math.floor(Date.now() / 1000);
+    if (payload.exp && payload.exp - now < TOKEN_EXPIRY_BUFFER) {
+      res.setHeader('X-Token-Refresh-Required', 'true');
+    }
+
+    const user = await UserService.findById(payload.sub!);
+    if (!user || !user.active) {
+      res.status(401).json({ error: 'User not found or inactive' });
+      return;
+    }
+
+    req.user = { id: user.id, role: user.role, email: user.email };
+    next();
+  } catch (err) {
+    if (err instanceof jwt.TokenExpiredError) {
+      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
+    } else {
+      res.status(401).json({ error: 'Invalid token' });
+    }
+  }
+}`;
