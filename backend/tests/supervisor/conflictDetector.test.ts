/**
 * tests/supervisor/conflictDetector.test.ts
 *
 * Unit tests for the Supervisor conflict-detection logic.
 *
 * Key scenario (the exact conflict the Supervisor must catch):
 *   CODE_INTELLIGENCE recommends modifying a file (e.g. checkout.js) that
 *   TEST_QA has flagged as "do not modify" because the tests covering that file
 *   are currently failing (fragile coverage).
 *
 * The detector must:
 *   1. Return a non-null ConflictReport describing the overlap.
 *   2. Name every conflicting file in report.conflictingFiles.
 *   3. Preserve both original AgentResults on the report.
 *   4. Return null when there is no overlap.
 *   5. Handle edge cases: empty lists, path normalisation, multiple conflicts.
 *
 * Integration smoke-test:
 *   Run the real CODE_INTELLIGENCE and TEST_QA agents against ecommerce-demo
 *   and confirm the detector finds a conflict (checkout/discount files are both
 *   proposed for modification AND covered by the failing premium-discount test).
 */
import { describe, test, expect } from 'vitest';
import { detectConflict } from '../../src/supervisor/conflictDetector';
import { runCodeIntelligence } from '../../src/agents/codeIntelligence';
import { runTestQA } from '../../src/agents/testQA';
import type { AgentResult, AgentTask } from '../../src/types/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(agent: AgentResult['agent'], goal: string): AgentTask {
  return {
    taskId: `conflict-test-${agent}`,
    agent,
    goal,
    assignedAt: new Date().toISOString(),
  };
}

/** Build a minimal CODE_INTELLIGENCE AgentResult with the given proposed files. */
function makeCIResult(proposedModifications: string[]): AgentResult {
  return {
    agent: 'CODE_INTELLIGENCE',
    status: 'SUCCESS',
    task: makeTask('CODE_INTELLIGENCE', 'stub goal'),
    filesExamined: proposedModifications,
    filesModified: [],
    proposedModifications,
    confidence: 'HIGH',
    recommendedNextAction: 'Proceed to Test & QA analysis.',
    completedAt: new Date().toISOString(),
  };
}

/** Build a minimal TEST_QA AgentResult with the given do-not-modify files. */
function makeQAResult(doNotModify: string[], failedCount = 1): AgentResult {
  return {
    agent: 'TEST_QA',
    status: 'PARTIAL',
    task: makeTask('TEST_QA', 'stub goal'),
    testResult: {
      totalTests: failedCount + 2,
      passed: 2,
      failed: failedCount,
      failures: Array.from({ length: failedCount }, (_, i) => ({
        testName: `fragile test ${i + 1}`,
        expected: '10',
        received: '0',
      })),
      executedAt: new Date().toISOString(),
    },
    filesExamined: doNotModify,
    filesModified: [],
    doNotModify,
    confidence: 'HIGH',
    recommendedNextAction: 'Escalate to DEBUG_REVIEW.',
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core conflict detection — exact scenario
// ---------------------------------------------------------------------------

describe('detectConflict — exact conflict scenario', () => {
  test(
    'returns a ConflictReport when CI proposes modifying a file that QA flags as do-not-modify',
    () => {
      const ciResult = makeCIResult(['src/checkout/checkout.js', 'src/discounts/discountService.js']);
      const qaResult = makeQAResult(['src/checkout/checkout.js']);

      const report = detectConflict(ciResult, qaResult);

      expect(report).not.toBeNull();
      expect(report!.conflictingFiles).toContain('src/checkout/checkout.js');
    },
  );

  test('conflictingFiles contains only the overlapping file, not the non-conflicting ones', () => {
    const ciResult = makeCIResult([
      'src/checkout/checkout.js',
      'src/discounts/discountService.js',
    ]);
    // QA only blocks checkout; discountService is fine
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    const report = detectConflict(ciResult, qaResult);

    expect(report).not.toBeNull();
    expect(report!.conflictingFiles).toHaveLength(1);
    expect(report!.conflictingFiles[0]).toBe('src/checkout/checkout.js');
    expect(report!.conflictingFiles).not.toContain('src/discounts/discountService.js');
  });

  test('reason string explains the conflict with file name and failing-test context', () => {
    const ciResult = makeCIResult(['src/checkout/checkout.js']);
    const qaResult = makeQAResult(['src/checkout/checkout.js'], 2);

    const report = detectConflict(ciResult, qaResult)!;

    expect(report.reason).toMatch(/checkout\.js/);
    expect(report.reason.toLowerCase()).toMatch(/do not modify|fragile/i);
    // failing count from testResult
    expect(report.reason).toMatch(/2/);
  });

  test('preserves the original CODE_INTELLIGENCE result on the report', () => {
    const ciResult = makeCIResult(['src/checkout/checkout.js']);
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    const report = detectConflict(ciResult, qaResult)!;

    expect(report.codeIntelligenceResult).toBe(ciResult);
  });

  test('preserves the original TEST_QA result on the report', () => {
    const ciResult = makeCIResult(['src/checkout/checkout.js']);
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    const report = detectConflict(ciResult, qaResult)!;

    expect(report.testQAResult).toBe(qaResult);
  });

  test('detectedAt is a valid ISO timestamp close to now', () => {
    const before = Date.now();
    const report = detectConflict(
      makeCIResult(['a.js']),
      makeQAResult(['a.js']),
    )!;
    const after = Date.now();

    const ts = new Date(report.detectedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// No-conflict cases — detector must return null
// ---------------------------------------------------------------------------

describe('detectConflict — no conflict (returns null)', () => {
  test('returns null when there is no overlap between proposed and blocked files', () => {
    const ciResult = makeCIResult(['src/orders/orderService.js']);
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    expect(detectConflict(ciResult, qaResult)).toBeNull();
  });

  test('returns null when CI has no proposedModifications', () => {
    const ciResult = makeCIResult([]);
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    expect(detectConflict(ciResult, qaResult)).toBeNull();
  });

  test('returns null when QA has no doNotModify list', () => {
    const ciResult = makeCIResult(['src/checkout/checkout.js']);
    // No doNotModify list at all
    const qaResult: AgentResult = {
      ...makeQAResult([]),
      doNotModify: undefined,
    };

    expect(detectConflict(ciResult, qaResult)).toBeNull();
  });

  test('returns null when both lists are empty', () => {
    expect(detectConflict(makeCIResult([]), makeQAResult([]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Path normalisation (Windows backslashes, case differences)
// ---------------------------------------------------------------------------

describe('detectConflict — path normalisation', () => {
  test('matches Windows backslash paths against forward-slash paths', () => {
    const ciResult = makeCIResult(['src\\checkout\\checkout.js']);
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    const report = detectConflict(ciResult, qaResult);

    expect(report).not.toBeNull();
  });

  test('matches paths that differ only in case', () => {
    const ciResult = makeCIResult(['SRC/Checkout/Checkout.JS']);
    const qaResult = makeQAResult(['src/checkout/checkout.js']);

    const report = detectConflict(ciResult, qaResult);

    expect(report).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multiple conflicting files
// ---------------------------------------------------------------------------

describe('detectConflict — multiple conflicts', () => {
  test('reports all conflicting files when there are multiple overlapping files', () => {
    const ciResult = makeCIResult([
      'src/checkout/checkout.js',
      'src/discounts/discountService.js',
      'src/users/userService.js',
    ]);
    const qaResult = makeQAResult([
      'src/checkout/checkout.js',
      'src/discounts/discountService.js',
    ]);

    const report = detectConflict(ciResult, qaResult)!;

    expect(report.conflictingFiles).toHaveLength(2);
    expect(report.conflictingFiles).toContain('src/checkout/checkout.js');
    expect(report.conflictingFiles).toContain('src/discounts/discountService.js');
    expect(report.conflictingFiles).not.toContain('src/users/userService.js');
  });
});

// ---------------------------------------------------------------------------
// Integration smoke-test: run real agents against ecommerce-demo
// ---------------------------------------------------------------------------

describe('detectConflict — integration with real agents', () => {
  /**
   * End-to-end scenario:
   *   The ecommerce-demo has an intentionally failing test for the premium
   *   discount calculation via checkout.  Running the real TEST_QA agent
   *   should flag checkout.js (and possibly discountService.js) as
   *   "do not modify" because those modules are covered by failing tests.
   *   Running the real CODE_INTELLIGENCE agent should propose modifying those
   *   same files in response to a discount-related goal.
   *   The Supervisor's detectConflict must catch this.
   */
  test(
    'detects a conflict between CODE_INTELLIGENCE and TEST_QA on the real ecommerce-demo',
    async () => {
      const goal = 'fix the premium customer discount calculation';

      const [ciResult, qaResult] = await Promise.all([
        runCodeIntelligence({
          taskId: 'int-ci-001',
          agent: 'CODE_INTELLIGENCE',
          goal,
          assignedAt: new Date().toISOString(),
        }),
        runTestQA({
          taskId: 'int-qa-001',
          agent: 'TEST_QA',
          goal,
          assignedAt: new Date().toISOString(),
        }),
      ]);

      // Precondition: CI proposed some modifications
      expect(ciResult.proposedModifications).toBeDefined();
      expect(ciResult.proposedModifications!.length).toBeGreaterThan(0);

      // Precondition: QA flagged some files due to failing tests
      expect(qaResult.doNotModify).toBeDefined();
      expect(qaResult.doNotModify!.length).toBeGreaterThan(0);

      // The Supervisor must detect a conflict
      const report = detectConflict(ciResult, qaResult);

      expect(report).not.toBeNull();
      expect(report!.conflictingFiles.length).toBeGreaterThan(0);
      expect(report!.reason.length).toBeGreaterThan(0);
      // The conflict must involve a discount- or checkout-related file
      const involved = report!.conflictingFiles.join(' ').toLowerCase();
      expect(involved).toMatch(/checkout|discount/i);
    },
    60_000, // allow Jest subprocess time
  );
});
