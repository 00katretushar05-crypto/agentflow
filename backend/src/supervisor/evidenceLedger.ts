/**
 * evidenceLedger.ts — Evidence Ledger for the AgentFlow Supervisor.
 *
 * RESPONSIBILITY:
 *   This module is the single place that computes and exposes the structured
 *   verification summary derived from a completed (or in-progress) run. It reads
 *   from SupervisorTaskState — it never writes to the store.
 *
 * TRACKED SIGNALS (matches VerificationResult in contracts.ts plus extra fields):
 *   1. requirementConfirmed   — CODE_INTELLIGENCE returned SUCCESS
 *   2. impactAnalysisDone     — CODE_INTELLIGENCE produced a Finding
 *   3. filesChangedCount      — count of filesModified across all agent results
 *   4. testsExecuted          — total tests run by the last TEST_QA result
 *   5. testsPassed            — total tests passed by the last TEST_QA result
 *   6. regressionPassed       — no failures in the last TEST_QA result
 *   7. codeReviewStatus       — 'DONE' | 'PENDING' | 'SKIPPED'
 *   8. humanApprovalStatus    — 'APPROVED' | 'PENDING' | 'NOT_REQUIRED'
 *
 * FAILURE DETECTION:
 *   buildFailureReport() inspects the most-recent TEST_QA AgentResult. If
 *   testResult.failed > 0 it synthesises a FailureReport ready for the
 *   DEBUG_REVIEW agent. Returns null when no failures are present.
 */

import type {
  SupervisorTaskState,
  VerificationResult,
  FailureReport,
  AgentResult,
} from '../types/contracts.js';

// ---------------------------------------------------------------------------
// Exported shapes
// ---------------------------------------------------------------------------

/**
 * Full ledger summary — the VerificationResult fields from contracts.ts plus
 * the additional signals required by this module.  The extra fields are
 * backwards-compatible (new optional fields) so the contract type is unchanged.
 */
export interface EvidenceLedgerSummary {
  /** Is there a CODE_INTELLIGENCE SUCCESS result? */
  requirementConfirmed: boolean;
  /** Did CODE_INTELLIGENCE produce a non-null Finding? */
  impactAnalysisDone: boolean;
  /** Total filesModified across every agent result in this run. */
  filesChangedCount: number;
  /** Total tests executed (from the most recent TEST_QA result). */
  testsExecuted: number;
  /** Total tests passed (from the most recent TEST_QA result). */
  testsPassed: number;
  /** No failures in the most recent TEST_QA result. */
  regressionPassed: boolean;
  /** 'DONE' when CODE_INTELLIGENCE is present, otherwise 'PENDING'. */
  codeReviewStatus: 'DONE' | 'PENDING';
  /** 'APPROVED' once the run reaches VERIFIED; 'PENDING' while at
   *  AWAITING_APPROVAL; 'NOT_REQUIRED' otherwise. */
  humanApprovalStatus: 'APPROVED' | 'PENDING' | 'NOT_REQUIRED';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the full Evidence Ledger summary from the current run state.
 * Pure function — no side effects, no I/O.
 *
 * @param state - The current SupervisorTaskState (read-only view).
 * @returns EvidenceLedgerSummary populated from the run's agent results and status.
 */
export function buildLedgerSummary(state: SupervisorTaskState): EvidenceLedgerSummary {
  const ciResult = state.agentResults['CODE_INTELLIGENCE'];
  const qaResult = getLatestQaResult(state);

  // 1. requirementConfirmed — CODE_INTELLIGENCE came back SUCCESS
  const requirementConfirmed = ciResult?.status === 'SUCCESS';

  // 2. impactAnalysisDone — CODE_INTELLIGENCE produced a Finding
  const impactAnalysisDone = ciResult?.findings !== undefined && ciResult.findings !== null;

  // 3. filesChangedCount — union of filesModified from every agent result
  const filesChangedCount = countFilesChanged(state);

  // 4 & 5. testsExecuted / testsPassed — from most-recent TEST_QA result
  const testsExecuted = qaResult?.testResult?.totalTests ?? 0;
  const testsPassed   = qaResult?.testResult?.passed     ?? 0;

  // 6. regressionPassed — no failures in most-recent TEST_QA
  const regressionPassed = (qaResult?.testResult?.failed ?? 0) === 0;

  // 7. codeReviewStatus — 'DONE' once CODE_INTELLIGENCE has a result
  const codeReviewStatus: EvidenceLedgerSummary['codeReviewStatus'] =
    ciResult !== undefined ? 'DONE' : 'PENDING';

  // 8. humanApprovalStatus
  const humanApprovalStatus = resolveApprovalStatus(state.status);

  return {
    requirementConfirmed,
    impactAnalysisDone,
    filesChangedCount,
    testsExecuted,
    testsPassed,
    regressionPassed,
    codeReviewStatus,
    humanApprovalStatus,
  };
}

/**
 * Converts the EvidenceLedgerSummary to the contracts.ts VerificationResult shape.
 * Use this when you need to write into SupervisorTaskState.verification.
 *
 * @param summary - The ledger summary produced by buildLedgerSummary().
 * @returns A VerificationResult compatible with contracts.ts.
 */
export function toVerificationResult(summary: EvidenceLedgerSummary): VerificationResult {
  return {
    requirementsMet:  summary.requirementConfirmed,
    testsExecuted:    summary.testsExecuted,
    testsPassed:      summary.testsPassed,
    regressionPassed: summary.regressionPassed,
    codeReviewed:     summary.codeReviewStatus === 'DONE',
  };
}

/**
 * Inspects the most-recent TEST_QA AgentResult for test failures. If
 * `testResult.failed > 0` it builds a FailureReport for the DEBUG_REVIEW agent.
 * Returns null when no failures are present (or when no TEST_QA result exists).
 *
 * This is the failure-detection entry-point required by the task spec.
 *
 * @param state - The current SupervisorTaskState (read-only view).
 * @returns A FailureReport when failures are detected, or null.
 */
export function buildFailureReport(state: SupervisorTaskState): FailureReport | null {
  const qaResult = getLatestQaResult(state);

  if (!qaResult?.testResult || qaResult.testResult.failed === 0) {
    return null;
  }

  const { failures, failed } = qaResult.testResult;

  // Use the first failing test as the primary signal — in practice the most
  // actionable failure is the first one in the list.
  const primaryFailure = failures[0];

  const testFailure = primaryFailure
    ? primaryFailure.testName
    : `${failed} test(s) failed`;

  const stackTrace = primaryFailure
    ? `Expected: ${primaryFailure.expected}\nReceived: ${primaryFailure.received}`
    : failures.map((f) => `${f.testName}: expected "${f.expected}", received "${f.received}"`).join('\n');

  // Include all failing test names as context for the debug agent.
  const relevantCode = failures
    .map((f) => `FAIL  ${f.testName}\n  Expected: ${f.expected}\n  Received: ${f.received}`)
    .join('\n\n');

  const rootCause =
    `TEST_QA detected ${failed} failure(s). ` +
    `Primary failure: "${testFailure}". ` +
    `Dispatching to DEBUG_REVIEW for root-cause analysis.`;

  // Confidence is MEDIUM when there are real failure details, LOW when
  // the testResult had no structured failure objects.
  const confidence: FailureReport['confidence'] = failures.length > 0 ? 'MEDIUM' : 'LOW';

  return {
    testFailure,
    stackTrace,
    relevantCode,
    rootCause,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the most-recent TEST_QA AgentResult, preferring the entry in
 * agentResults (which is overwritten on each TEST_QA dispatch in the
 * current supervisor implementation).
 */
function getLatestQaResult(state: SupervisorTaskState): AgentResult | undefined {
  return state.agentResults['TEST_QA'];
}

/**
 * Counts the total distinct files modified across all agent results, de-duped
 * by file path so the same file counted by two agents is only counted once.
 */
function countFilesChanged(state: SupervisorTaskState): number {
  const seen = new Set<string>();
  for (const result of Object.values(state.agentResults)) {
    if (!result) continue;
    for (const file of result.filesModified) {
      seen.add(file);
    }
  }
  return seen.size;
}

/**
 * Maps the current SupervisorState to a human-approval status label.
 */
function resolveApprovalStatus(
  status: SupervisorTaskState['status'],
): EvidenceLedgerSummary['humanApprovalStatus'] {
  if (status === 'VERIFIED')           return 'APPROVED';
  if (status === 'AWAITING_APPROVAL')  return 'PENDING';
  return 'NOT_REQUIRED';
}
