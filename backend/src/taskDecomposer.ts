/**
 * taskDecomposer.ts — Breaks a developer's high-level goal into concrete
 * subtasks assigned to specific agents.
 *
 * DETERMINISM RULE (from AGENTS.md):
 *   The canonical demo task must always produce the exact same 3 subtasks in
 *   the same order.  Pattern-match on the goal string; return hardcoded
 *   subtasks so the demo is reproducible across restarts.
 */

import { v4 as uuidv4 } from 'uuid'; // justified: lightweight, zero-dependency UUID generation; avoids reinventing RFC-4122 V4
import type { AgentTask, AgentName } from './types/contracts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes one slot in a decomposition plan before timestamps are assigned. */
interface SubtaskSpec {
  agent: AgentName;
  goal: string;
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Canonical demo task
// ---------------------------------------------------------------------------

/**
 * The canonical demo goal string — exact match required for deterministic
 * decomposition.  Substring matching is intentional so minor phrasing
 * variations in a live demo still hit the fast path.
 */
const CANONICAL_DEMO_GOAL =
  'Add rate limiting to the /api/auth/login endpoint';

/**
 * Fixed subtask plan for the canonical demo task.  The ordering is:
 *   1. CODE_INTELLIGENCE — analyse the codebase first so later agents have
 *      findings to act on.
 *   2. TEST_QA           — verify current test coverage baseline.
 *   3. DEBUG_REVIEW      — only runs after failures; see dependency rule in
 *      supervisor.ts.
 *
 * This list is intentionally hardcoded (not computed) to guarantee demo
 * determinism across restarts and hot-reloads.
 */
const CANONICAL_SUBTASKS: SubtaskSpec[] = [
  {
    agent: 'CODE_INTELLIGENCE',
    goal: 'Analyse the /api/auth/login route handler and identify the best insertion point for a rate-limiting middleware.  Assess risk and list files that will need to change.',
    context: { targetEndpoint: '/api/auth/login', changeType: 'middleware-insertion' },
  },
  {
    agent: 'TEST_QA',
    goal: 'Run the existing auth-login test suite and report pass/fail counts.  Provide a baseline before any code changes land.',
    context: { testSuite: 'auth-login', phase: 'baseline' },
  },
  {
    agent: 'DEBUG_REVIEW',
    goal: 'If the test suite fails after implementation, diagnose the root cause and propose a concrete fix for the rate-limiting integration.',
    context: { phase: 'post-implementation-debug' },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decomposes a developer goal into an ordered list of AgentTask objects with
 * freshly generated IDs and `assignedAt` timestamps.
 *
 * For the canonical demo goal the result is hardcoded and deterministic.
 * All other goals receive a generic three-agent plan that covers the standard
 * analyse → test → debug pipeline.
 *
 * @param parentTaskId - The Supervisor task ID; embedded in every AgentTask so
 *   results can be correlated back to their parent run.
 * @param goal - The developer's high-level objective.
 */
export function decomposeTask(parentTaskId: string, goal: string): AgentTask[] {
  const specs = isCanonicalDemoGoal(goal)
    ? CANONICAL_SUBTASKS
    : buildGenericPlan(goal);

  const now = new Date().toISOString();

  return specs.map((spec) => ({
    taskId: `${parentTaskId}:${spec.agent}:${uuidv4()}`,
    agent: spec.agent,
    goal: spec.goal,
    context: spec.context,
    assignedAt: now,
  }));
}

// ---------------------------------------------------------------------------
// Helpers (not exported — pure internal logic)
// ---------------------------------------------------------------------------

/**
 * Returns true when the goal matches the canonical demo task.  Case-insensitive
 * substring match so minor variations in punctuation don't break the demo.
 */
function isCanonicalDemoGoal(goal: string): boolean {
  return goal.toLowerCase().includes(CANONICAL_DEMO_GOAL.toLowerCase());
}

/**
 * Produces a generic three-agent plan for non-demo goals.  Mirrors the same
 * agent ordering as the canonical plan: analyse first, test second, debug on
 * demand (the Supervisor itself will skip DEBUG_REVIEW unless tests fail).
 */
function buildGenericPlan(goal: string): SubtaskSpec[] {
  return [
    {
      agent: 'CODE_INTELLIGENCE',
      goal: `Analyse the codebase to understand the current implementation relevant to: "${goal}".  List affected files, functions, and risk level.`,
      context: { phase: 'analysis' },
    },
    {
      agent: 'TEST_QA',
      goal: `Run the full test suite and provide a pass/fail baseline for: "${goal}".`,
      context: { phase: 'baseline-testing' },
    },
    {
      agent: 'DEBUG_REVIEW',
      goal: `If tests fail after implementation of "${goal}", diagnose root cause and propose a fix.`,
      context: { phase: 'post-implementation-debug' },
    },
  ];
}
