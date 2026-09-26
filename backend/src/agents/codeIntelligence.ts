/**
 * codeIntelligence.ts — CODE_INTELLIGENCE agent stub.
 *
 * Returns a fixed, deterministic AgentResult so the demo is reproducible.
 * In a production build this would invoke an LLM or static-analysis toolchain.
 * The stub uses a fixed setTimeout (no Math.random) to simulate async work.
 */

import type { AgentTask, AgentResult } from '../types/contracts.js';

/** Simulated processing latency in milliseconds — fixed, never random. */
const STUB_DELAY_MS = 800;

/**
 * Analyses the codebase relevant to the given task and returns findings
 * including affected files, risk level, and a recommendation.
 *
 * @param task - The AgentTask assigned by the Supervisor.
 */
export async function runCodeIntelligence(task: AgentTask): Promise<AgentResult> {
  await delay(STUB_DELAY_MS);

  return {
    agent: 'CODE_INTELLIGENCE',
    status: 'SUCCESS',
    task,
    findings: {
      affectedFiles: ['src/routes/auth.ts', 'src/middleware/rateLimit.ts'],
      affectedFunctions: ['loginHandler', 'applyRateLimit'],
      riskLevel: 'MEDIUM',
      recommendation:
        'Insert rate-limiting middleware before the loginHandler.  ' +
        'Use an in-memory sliding-window counter keyed by IP; ' +
        'configure a 5-minute window with max 10 attempts.',
    },
    filesExamined: ['src/routes/auth.ts', 'src/middleware/', 'src/app.ts'],
    filesModified: [],
    confidence: 'HIGH',
    recommendedNextAction: 'Proceed to implementation then run the auth-login test suite.',
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
