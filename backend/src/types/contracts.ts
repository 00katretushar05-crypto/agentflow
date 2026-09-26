/**
 * Shared contracts for AgentFlow. All Supervisor <-> Agent <-> API
 * communication must use these types. Do not duplicate or fork these
 * shapes elsewhere in the codebase.
 */

export type AgentName = 'CODE_INTELLIGENCE' | 'TEST_QA' | 'DEBUG_REVIEW';

/** Per-agent status summary — a lightweight view of each agent's current run state. */
export type AgentRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'SKIPPED';

export interface AgentStatusEntry {
  agent: AgentName;
  status: AgentRunStatus;
  /** ISO timestamp of last update, or undefined if not yet started. */
  updatedAt?: string;
}

/**
 * A single evidence item derived from the audit trail — flat representation
 * of one event (state transition or agent result) for the evidence endpoint.
 */
export interface EvidenceItem {
  /** Monotonic sequence number within the run (1-based). */
  seq: number;
  type: 'TRANSITION' | 'AGENT_RESULT';
  /** ISO timestamp of the event. */
  timestamp: string;
  /** Human-readable summary of the event. */
  summary: string;
  /** Raw payload — StateTransition or AgentResult. */
  payload: StateTransition | AgentResult;
}

/** Compact row returned by GET /api/tasks (task list). */
export interface TaskHistoryItem {
  taskId: string;
  goal: string;
  status: SupervisorState;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export type SupervisorState =
  | 'RECEIVED' | 'PLANNING' | 'ANALYZING' | 'IMPLEMENTING'
  | 'TESTING' | 'FAILED' | 'RECOVERING' | 'RETESTING'
  | 'VERIFYING' | 'AWAITING_APPROVAL' | 'VERIFIED';

/** A single unit of work handed to a specialized agent. */
export interface AgentTask {
  taskId: string;
  agent: AgentName;
  goal: string;
  context?: Record<string, unknown>;
  /** ISO timestamp when this task was assigned. */
  assignedAt: string;
}

export interface Finding {
  affectedFiles: string[];
  affectedFunctions: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
}

export interface TestResult {
  totalTests: number;
  passed: number;
  failed: number;
  failures: { testName: string; expected: string; received: string }[];
  /** ISO timestamp when this test run finished. */
  executedAt: string;
}

export interface FailureReport {
  testFailure: string;
  stackTrace: string;
  relevantCode: string;
  rootCause: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface VerificationResult {
  requirementsMet: boolean;
  testsExecuted: number;
  testsPassed: number;
  regressionPassed: boolean;
  codeReviewed: boolean;
  /** Set to true once the run reaches the VERIFIED state via an explicit approve call. */
  humanApproved?: boolean;
}

export interface AgentResult {
  agent: AgentName;
  status: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  task: AgentTask;
  findings?: Finding;
  testResult?: TestResult;
  failureReport?: FailureReport;
  filesExamined: string[];
  filesModified: string[];
  /**
   * Files that CODE_INTELLIGENCE recommends modifying to fulfil the task goal.
   * Populated only by the CODE_INTELLIGENCE agent.
   */
  proposedModifications?: string[];
  /**
   * Files that TEST_QA has flagged as "do not modify" due to fragile existing
   * test coverage.  Populated only by the TEST_QA agent.
   */
  doNotModify?: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedNextAction: string;
  /** ISO timestamp when this result was produced. */
  completedAt: string;
}

/**
 * Produced by the Supervisor when CODE_INTELLIGENCE proposes modifying a file
 * that TEST_QA has flagged as "do not modify".
 */
export interface ConflictReport {
  conflictingFiles: string[];
  codeIntelligenceResult: AgentResult;
  testQAResult: AgentResult;
  /** Human-readable explanation of why this is a conflict. */
  reason: string;
  /** ISO timestamp when the conflict was detected. */
  detectedAt: string;
}

/** A single entry in the Supervisor's state transition history — this IS your audit trail / evidence ledger backbone. */
export interface StateTransition {
  from: SupervisorState;
  to: SupervisorState;
  reason: string;
  timestamp: string;
}

/** Full Supervisor state for one task — this is what GET /api/task/:id returns. */
export interface SupervisorTaskState {
  taskId: string;
  goal: string;
  status: SupervisorState;
  history: StateTransition[];
  /** Per-agent run status — lightweight summary updated alongside agentResults. */
  agentStatus: AgentStatusEntry[];
  agentResults: Partial<Record<AgentName, AgentResult>>;
  retryCount: number;
  /** Hard cap enforced by the Supervisor — prevents infinite retry loops in a live demo. */
  maxRetries: number;
  verification?: VerificationResult;
  risk?: {
    filesAffected: number;
    functionsAffected: number;
    testsRun: number;
    score: number;
    recommendation: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Standard error shape for every API error response — keeps error handling consistent across all routes. */
export interface ApiError {
  error: string;
  code: 'NOT_FOUND' | 'INVALID_REQUEST' | 'INTERNAL_ERROR' | 'MAX_RETRIES_EXCEEDED';
  taskId?: string;
}