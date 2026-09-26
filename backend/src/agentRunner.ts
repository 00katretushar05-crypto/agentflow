/**
 * agentRunner.ts — Safe wrapper that dispatches an AgentTask to the correct
 * agent function and guarantees a well-formed AgentResult is always returned.
 *
 * CONTRACT (from AGENTS.md):
 *   • This module NEVER throws.  All exceptions are caught here.
 *   • The returned AgentResult always has status: "SUCCESS" | "FAILURE" | "PARTIAL".
 *   • Agents themselves are pure async functions — no store access, no SSE.
 *   • Retry/recovery decisions are NOT made here; they belong in supervisor.ts.
 */

import type { AgentTask, AgentResult } from './types/contracts.js';
import { runCodeIntelligence } from './agents/codeIntelligence.js';
import { runTestQA } from './agents/testQA.js';
import { runDebugReview } from './agents/debugReview.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatches the task to the appropriate agent function.  If the agent throws
 * for any reason, the exception is caught and a FAILURE AgentResult is
 * synthesised so the Supervisor can handle it gracefully without crashing.
 *
 * @param task - Fully-formed AgentTask created by the Supervisor.
 * @returns A settled AgentResult — never rejects, never throws.
 */
export async function runAgent(task: AgentTask): Promise<AgentResult> {
  try {
    return await dispatchToAgent(task);
  } catch (err: unknown) {
    // Synthesise a FAILURE result so the Supervisor always gets a structured
    // response rather than an unhandled rejection.  Surface the error message
    // in recommendedNextAction so it appears in the evidence ledger.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agentRunner] Agent ${task.agent} threw an unexpected error:`, err);

    return {
      agent: task.agent,
      status: 'FAILURE',
      task,
      filesExamined: [],
      filesModified: [],
      confidence: 'LOW',
      recommendedNextAction: `Agent threw an unexpected error: ${message}`,
      completedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal dispatch
// ---------------------------------------------------------------------------

/**
 * Routes the task to the correct agent function based on `task.agent`.
 * Throws if an unknown AgentName is encountered — this is a programming error
 * that should not be caught in runAgent's fallback.
 *
 * Note: The TypeScript compiler enforces exhaustiveness via the `never` branch,
 * so this will become a compile-time error if a new AgentName is added to
 * contracts.ts without updating this switch.
 */
async function dispatchToAgent(task: AgentTask): Promise<AgentResult> {
  switch (task.agent) {
    case 'CODE_INTELLIGENCE':
      return runCodeIntelligence(task);
    case 'TEST_QA':
      return runTestQA(task);
    case 'DEBUG_REVIEW':
      return runDebugReview(task);
    default: {
      // `task.agent` should be `never` here — if TypeScript reports a type
      // error on the next line, a new AgentName was added without updating
      // this switch.
      const unreachable: never = task.agent;
      throw new Error(`Unknown agent: ${unreachable as string}`);
    }
  }
}
