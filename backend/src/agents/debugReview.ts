/**
 * debugReview.ts — DEBUG_REVIEW agent stub.
 *
 * DEPENDENCY ORDERING RULE (from AGENTS.md requirement #4):
 *   DEBUG_REVIEW must never be assigned before TESTING has actually run and
 *   failed.  This is enforced in supervisor.ts, which only dispatches this
 *   agent from the RECOVERING state — i.e. after a TestResult with failed > 0
 *   has already been recorded in agentResults.
 *   This stub itself does not enforce the ordering because it is a pure
 *   function; the invariant belongs in the orchestrator.
 *
 * Fixed setTimeout delay — no Math.random.
 */

import type { AgentTask, AgentResult } from '../types/contracts.js';

/** Simulated review latency in milliseconds — fixed, never random. */
const STUB_DELAY_MS = 700;

/**
 * Reviews test failures and returns a FailureReport with root-cause analysis
 * and a recommended fix.
 *
 * @param task - The AgentTask assigned by the Supervisor.  The Supervisor
 *   injects `context.failureSummary` (string) so the agent knows which test
 *   failures to focus on.
 */
export async function runDebugReview(task: AgentTask): Promise<AgentResult> {
  await delay(STUB_DELAY_MS);

  const now = new Date().toISOString();

  return {
    agent: 'DEBUG_REVIEW',
    status: 'SUCCESS',
    task,
    failureReport: {
      testFailure:
        'POST /api/auth/login — rate limit header present: ' +
        'expected "X-RateLimit-Remaining: 9", received "Header not found"',
      stackTrace:
        'AssertionError: expected response headers to include X-RateLimit-Remaining\n' +
        '  at Object.<anonymous> (tests/auth.test.ts:47:5)',
      relevantCode:
        '// src/routes/auth.ts — loginHandler does not call applyRateLimit()\n' +
        'router.post("/login", loginHandler);',
      rootCause:
        'The rate-limiting middleware (applyRateLimit) was created but never ' +
        'wired into the /api/auth/login route.  The handler is registered ' +
        'directly without the middleware in the chain.',
      confidence: 'HIGH',
    },
    filesExamined: ['src/routes/auth.ts', 'src/middleware/rateLimit.ts', 'tests/auth.test.ts'],
    filesModified: ['src/routes/auth.ts'],
    confidence: 'HIGH',
    recommendedNextAction:
      'Apply fix: change router.post("/login", loginHandler) to ' +
      'router.post("/login", applyRateLimit, loginHandler), then rerun tests.',
    completedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
