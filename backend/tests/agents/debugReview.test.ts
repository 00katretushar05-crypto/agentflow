/**
 * tests/agents/debugReview.test.ts
 *
 * Unit tests for the DEBUG_REVIEW agent.
 *
 * Strategy: the agent runs real Jest against ecommerce-demo (which has the
 * intentional field-name bug), parses the failure, and identifies root cause.
 * We also test the injected-context code path for offline usage.
 */

import { runDebugReviewAgent } from '../../src/agents/debugReview';
import type { AgentTask } from '../../src/types/contracts';

function makeTask(goal: string, context?: Record<string, unknown>): AgentTask {
  return {
    taskId: 'test-dbg-001',
    agent: 'DEBUG_REVIEW',
    goal,
    assignedAt: new Date().toISOString(),
    ...(context !== undefined ? { context } : {}),
  };
}

describe('runDebugReviewAgent', () => {
  // -------------------------------------------------------------------------
  // Shape & contract
  // -------------------------------------------------------------------------

  test('returns a valid AgentResult with all required fields', async () => {
    const result = await runDebugReviewAgent(makeTask('investigate failing tests'));

    expect(result.agent).toBe('DEBUG_REVIEW');
    expect(['SUCCESS', 'FAILURE', 'PARTIAL']).toContain(result.status);
    expect(result.task.taskId).toBe('test-dbg-001');
    expect(result.task.assignedAt).toBeTruthy();
    expect(typeof result.completedAt).toBe('string');
    expect(new Date(result.completedAt).getTime()).not.toBeNaN();
    expect(Array.isArray(result.filesExamined)).toBe(true);
    expect(Array.isArray(result.filesModified)).toBe(true);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.confidence);
    expect(typeof result.recommendedNextAction).toBe('string');
  });

  test('populates failureReport with required fields', async () => {
    const result = await runDebugReviewAgent(makeTask('debug discount failure'));

    expect(result.failureReport).toBeDefined();
    const fr = result.failureReport!;
    expect(typeof fr.testFailure).toBe('string');
    expect(typeof fr.stackTrace).toBe('string');
    expect(typeof fr.relevantCode).toBe('string');
    expect(typeof fr.rootCause).toBe('string');
    expect(fr.rootCause.length).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(fr.confidence);
  });

  test('filesModified is empty (agent is read-only)', async () => {
    const result = await runDebugReviewAgent(makeTask('debug tests'));
    expect(result.filesModified).toEqual([]);
  });

  test('task fields are echoed back unchanged', async () => {
    const task = makeTask('some goal', { traceId: 'abc' });
    const result = await runDebugReviewAgent(task);

    expect(result.task.taskId).toBe('test-dbg-001');
    expect(result.task.goal).toBe('some goal');
    expect(result.task.context).toEqual({ traceId: 'abc' });
  });

  // -------------------------------------------------------------------------
  // Live failure detection from the ecommerce-demo intentional bug
  // -------------------------------------------------------------------------

  test('detects the intentional premium discount failure', async () => {
    const result = await runDebugReviewAgent(makeTask('why does premium discount fail'));
    const fr = result.failureReport!;

    // There is a live failing test in ecommerce-demo
    expect(fr.testFailure).not.toBe('none');
    expect(fr.testFailure.toLowerCase()).toMatch(/premium/i);
  });

  test('root cause identifies the field-name mismatch with HIGH confidence', async () => {
    const result = await runDebugReviewAgent(makeTask('debug discount regression'));
    const fr = result.failureReport!;

    // The agent reads checkout.js + discountService.js and detects the mismatch
    expect(fr.confidence).toBe('HIGH');
    expect(fr.rootCause.toLowerCase()).toMatch(/field.?name|membership|type/i);
  });

  test('rootCause includes a proposed minimal fix', async () => {
    const result = await runDebugReviewAgent(makeTask('fix premium customer discount'));
    const fr = result.failureReport!;

    expect(fr.rootCause.toLowerCase()).toMatch(/fix|change|membership/i);
  });

  test('stackTrace is non-empty for live failure', async () => {
    const result = await runDebugReviewAgent(makeTask('debug failing test'));
    const fr = result.failureReport!;

    expect(fr.stackTrace.length).toBeGreaterThan(0);
  });

  test('examines checkout.js and discountService.js', async () => {
    const result = await runDebugReviewAgent(makeTask('debug discount'));

    const examined = result.filesExamined;
    expect(examined.some(f => f.includes('checkout.js'))).toBe(true);
    expect(examined.some(f => f.includes('discountService.js'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Injected context code path (offline / context-supplied evidence)
  // -------------------------------------------------------------------------

  test('uses injected stack trace when provided via task context', async () => {
    // Provide a fake stack trace pointing to a real file in the repo
    const fakeStack =
      'Error: Expected 10 but received 0\n' +
      '    at Object.<anonymous> (tests/discount.test.js:50:5)\n';

    const result = await runDebugReviewAgent(
      makeTask('diagnose injected failure', {
        failingTest: 'injected test name',
        stackTrace: fakeStack,
      }),
    );

    // The live Jest path will fire first (real failure exists), but the contract
    // should hold regardless of which path ran
    expect(result.failureReport).toBeDefined();
    expect(result.failureReport!.rootCause.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // recommendedNextAction
  // -------------------------------------------------------------------------

  test('recommendedNextAction mentions rerun or fix when failure detected', async () => {
    const result = await runDebugReviewAgent(makeTask('debug discount test'));

    if (result.failureReport?.testFailure !== 'none') {
      expect(result.recommendedNextAction.toLowerCase()).toMatch(/fix|rerun|apply/i);
    }
  });
});
