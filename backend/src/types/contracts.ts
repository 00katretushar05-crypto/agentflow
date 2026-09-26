export type AgentName = 'CODE_INTELLIGENCE' | 'TEST_QA' | 'DEBUG_REVIEW';

export interface AgentTask {
  taskId: string;
  agent: AgentName;
  goal: string;
  context?: Record<string, unknown>;
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
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedNextAction: string;
}
