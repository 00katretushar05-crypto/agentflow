/**
 * testQA.ts — TEST_QA agent stub.
 *
 * DEMO DETERMINISM RULE (from AGENTS.md):
 *   - On retryCount === 0 → fails (1 test failure), simulating a first-run
 *     regression that the DEBUG_REVIEW agent must diagnose.
 *   - On retryCount >= 1 → passes, simulating a successful re-run after the
 *     fix has been applied.
 *
 * retryCount is read from AgentTask.context.retryCount (injected by the
 * Supervisor before each dispatch).  Fixed setTimeout delay — no Math.random.
 */

import type { AgentTask, AgentResult } from '../types/contracts.js';

/** Simulated test-run latency in milliseconds — fixed, never random. */
const STUB_DELAY_MS = 1000;

/**
 * Runs the relevant test suite for the given task and returns a TestResult.
 *
 * Behaviour is controlled by `task.context.retryCount`:
 *   - 0 → one failing test (triggers the FAILED → RECOVERING path)
 *   - ≥1 → all tests pass (triggers the VERIFYING path)
 *
 * @param task - The AgentTask assigned by the Supervisor, must contain
 *   `context.retryCount` (number).
 */
export async function runTestQA(task: AgentTask): Promise<AgentResult> {
  await delay(STUB_DELAY_MS);

  const retryCount =
    typeof task.context?.retryCount === 'number' ? task.context.retryCount : 0;

  const isFirstAttempt = retryCount === 0;
  const now = new Date().toISOString();

  if (isFirstAttempt) {
    // First attempt: one test fails — intentional demo failure to exercise the
    // recovery/debug path.
    return {
      agent: 'TEST_QA',
      status: 'FAILURE',
      task,
      testResult: {
        totalTests: 12,
        passed: 11,
        failed: 1,
        failures: [
          {
            testName: 'POST /api/auth/login — rate limit header present',
            expected: 'X-RateLimit-Remaining: 9',
            received: 'Header not found',
          },
        ],
        executedAt: now,
      },
      filesExamined: ['tests/auth.test.ts'],
      filesModified: [],
      confidence: 'HIGH',
      recommendedNextAction:
        'Rate-limit header is missing.  Route to DEBUG_REVIEW for root-cause analysis.',
      completedAt: now,
    };
  }

  // Subsequent attempts: all tests pass — recovery was successful.
  return {
    agent: 'TEST_QA',
    status: 'SUCCESS',
    task,
    testResult: {
      totalTests: 12,
      passed: 12,
      failed: 0,
      failures: [],
      executedAt: now,
    },
    filesExamined: ['tests/auth.test.ts'],
    filesModified: [],
    confidence: 'HIGH',
    recommendedNextAction: 'All tests pass — proceed to VERIFYING.',
    completedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
