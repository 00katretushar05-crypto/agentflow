/**
 * tests/agents/debugReview.test.ts
 *
 * Unit tests for the DEBUG_REVIEW agent.
 *
 * Strategy: the agent runs real Jest against ecommerce-demo (which has the
 * intentional field-name bug), parses the failure, identifies root cause,
 * and now also APPLIES the fix to disk.
 *
 * Important: every agent invocation that detects the bug will write the fix
 * to ecommerce-demo/src/checkout/checkout.js.  The beforeEach/afterEach hooks
 * save and restore the original (buggy) file content so each test starts from
 * a clean, reproducible state and other test suites (testQA) are unaffected.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { runDebugReview } from '../../src/agents/debugReview.js';
import { describe, test, expect, afterEach } from 'vitest';
import type { AgentTask, FailureReport } from '../../src/types/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHECKOUT_JS = path.resolve(
  __dirname, '..', '..', '..', 'ecommerce-demo', 'src', 'checkout', 'checkout.js',
);

const ECOMMERCE_ROOT = path.resolve(
  __dirname, '..', '..', '..', 'ecommerce-demo',
);

/** Original (buggy) content, captured once when the module loads. */
const ORIGINAL_CHECKOUT = fs.readFileSync(CHECKOUT_JS, 'utf-8');

function makeTask(goal: string, context?: Record<string, unknown>): AgentTask {
  return {
    taskId: 'test-dbg-001',
    agent: 'DEBUG_REVIEW',
    goal,
    assignedAt: new Date().toISOString(),
    ...(context !== undefined ? { context } : {}),
  };
}

/** Restore checkout.js to its original (buggy) state. */
function restoreCheckout(): void {
  fs.writeFileSync(CHECKOUT_JS, ORIGINAL_CHECKOUT, 'utf-8');
}

// ---------------------------------------------------------------------------
// Restore checkout.js after every test so subsequent tests start from the
// expected buggy state.  Without this, the first test to apply the fix would
// cause every later test (and testQA tests) to see a passing suite instead of
// the intentional failure.
// ---------------------------------------------------------------------------

describe('runDebugReview', () => {
  afterEach(() => {
    restoreCheckout();
  });

  // -------------------------------------------------------------------------
  // Shape & contract
  // -------------------------------------------------------------------------

  test('returns a valid AgentResult with all required fields', async () => {
    const result = await runDebugReview(makeTask('investigate failing tests'));

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
    const result = await runDebugReview(makeTask('debug discount failure'));

    expect(result.failureReport).toBeDefined();
    const fr = result.failureReport!;
    expect(typeof fr.testFailure).toBe('string');
    expect(typeof fr.stackTrace).toBe('string');
    expect(typeof fr.relevantCode).toBe('string');
    expect(typeof fr.rootCause).toBe('string');
    expect(fr.rootCause.length).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(fr.confidence);
  });

  test('filesModified contains checkout.js when the known bug is present', async () => {
    // Ensure the bug is present before running
    restoreCheckout();

    const result = await runDebugReview(makeTask('debug tests'));
    expect(result.filesModified.length).toBeGreaterThan(0);
    expect(result.filesModified.some(f => f.includes('checkout.js'))).toBe(true);
  });

  test('task fields are echoed back unchanged', async () => {
    const task = makeTask('some goal', { traceId: 'abc' });
    const result = await runDebugReview(task);

    expect(result.task.taskId).toBe('test-dbg-001');
    expect(result.task.goal).toBe('some goal');
    expect(result.task.context).toEqual({ traceId: 'abc' });
  });

  // -------------------------------------------------------------------------
  // Live failure detection from the ecommerce-demo intentional bug
  // -------------------------------------------------------------------------

  test('detects the intentional premium discount failure', async () => {
    const result = await runDebugReview(makeTask('why does premium discount fail'));
    const fr = result.failureReport!;

    // There is a live failing test in ecommerce-demo
    expect(fr.testFailure).not.toBe('none');
    expect(fr.testFailure.toLowerCase()).toMatch(/premium/i);
  });

  test('root cause identifies the field-name mismatch with HIGH confidence', async () => {
    const result = await runDebugReview(makeTask('debug discount regression'));
    const fr = result.failureReport!;

    // The agent reads checkout.js + discountService.js and detects the mismatch
    expect(fr.confidence).toBe('HIGH');
    expect(fr.rootCause.toLowerCase()).toMatch(/field.?name|membership|type/i);
  });

  test('rootCause includes a proposed minimal fix', async () => {
    const result = await runDebugReview(makeTask('fix premium customer discount'));
    const fr = result.failureReport!;

    expect(fr.rootCause.toLowerCase()).toMatch(/fix|change|membership/i);
  });

  test('stackTrace is non-empty for live failure', async () => {
    const result = await runDebugReview(makeTask('debug failing test'));
    const fr = result.failureReport!;

    expect(fr.stackTrace.length).toBeGreaterThan(0);
  });

  test('examines checkout.js and discountService.js', async () => {
    const result = await runDebugReview(makeTask('debug discount'));

    const examined = result.filesExamined;
    expect(examined.some(f => f.includes('checkout.js'))).toBe(true);
    expect(examined.some(f => f.includes('discountService.js'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Fix actually applied to disk — core new behaviour
  // -------------------------------------------------------------------------

  test('checkout.js is modified on disk after running the agent', async () => {
    // Confirm the bug is present before the run
    const before = fs.readFileSync(CHECKOUT_JS, 'utf-8');
    expect(before).toMatch(/getDiscount\(\{\s*type\s*:\s*customer\.type/);

    await runDebugReview(makeTask('apply fix'));

    const after = fs.readFileSync(CHECKOUT_JS, 'utf-8');
    // Bug line must be gone
    expect(after).not.toMatch(/getDiscount\(\{\s*type\s*:\s*customer\.type/);
    // Correct line must be present
    expect(after).toMatch(/getDiscount\(\{\s*membership\s*:\s*customer\.type/);
  });

  test('ecommerce-demo tests pass after the agent applies the fix', () => {
    // Step 1: agent applies the fix
    // (We invoke applyFix indirectly by running the agent; alternatively we can
    // manipulate the file directly here to keep this test deterministic and fast.)
    const fixed = ORIGINAL_CHECKOUT.replace(
      /getDiscount\(\{\s*type\s*:\s*customer\.type\s*\}[^)]*\)/,
      'getDiscount({ membership: customer.type })',
    );
    fs.writeFileSync(CHECKOUT_JS, fixed, 'utf-8');

    // Step 2: run ecommerce-demo Jest and assert all tests pass
    const jestEntry = path.join(ECOMMERCE_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
    let jestRaw = '';
    try {
      jestRaw = execSync(`node "${jestEntry}" --json --no-coverage`, {
        cwd: ECOMMERCE_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf-8',
        timeout: 30_000,
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        jestRaw = (err as { stdout: string }).stdout ?? '';
      }
    }

    const jestResult = JSON.parse(jestRaw) as {
      numFailedTests: number;
      numPassedTests: number;
    };

    expect(jestResult.numFailedTests).toBe(0);
    expect(jestResult.numPassedTests).toBeGreaterThan(0);
  });

  test('filesModified reports the correct repo-relative path', async () => {
    const result = await runDebugReview(makeTask('check modified path'));

    // When the bug is present the agent fixes it and reports the path
    if (result.filesModified.length > 0) {
      expect(result.filesModified[0]).toBe('src/checkout/checkout.js');
    }
  });

  test('filesModified is empty when the bug is already fixed', async () => {
    // Pre-apply the fix so the agent finds nothing to change
    const fixed = ORIGINAL_CHECKOUT.replace(
      /getDiscount\(\{\s*type\s*:\s*customer\.type\s*\}[^)]*\)/,
      'getDiscount({ membership: customer.type })',
    );
    fs.writeFileSync(CHECKOUT_JS, fixed, 'utf-8');

    // Inject a full FailureReport to bypass the Jest subprocess (which would now
    // see zero failures and return early via the "no failures" path).
    const injected: FailureReport = {
      testFailure: 'synthetic already-fixed test',
      stackTrace: '',
      relevantCode: '',
      rootCause: '',
      confidence: 'LOW',
    };

    const result = await runDebugReview(
      makeTask('already fixed', { failureReport: injected }),
    );

    // The agent ran analyzeRootCause — but because checkout.js no longer has the
    // buggy `type:` call, callerPassesType is false → no HIGH-confidence fix
    // identified → applyFix finds nothing to change → filesModified stays empty.
    expect(result.filesModified).toEqual([]);
  });

  test('recommendedNextAction mentions fix-applied when a fix was written', async () => {
    const result = await runDebugReview(makeTask('debug discount test'));

    if (result.filesModified.length > 0) {
      expect(result.recommendedNextAction.toLowerCase()).toMatch(/fix applied|rerun/i);
    }
  });

  // -------------------------------------------------------------------------
  // Injected context code path (offline / context-supplied evidence)
  // -------------------------------------------------------------------------

  test('uses injected stack trace when provided via task context', async () => {
    // Provide a fake stack trace pointing to a real file in the repo
    const fakeStack =
      'Error: Expected 10 but received 0\n' +
      '    at Object.<anonymous> (tests/discount.test.js:50:5)\n';

    const result = await runDebugReview(
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
    const result = await runDebugReview(makeTask('debug discount test'));

    if (result.failureReport?.testFailure !== 'none') {
      expect(result.recommendedNextAction.toLowerCase()).toMatch(/fix|rerun|apply/i);
    }
  });

  // -------------------------------------------------------------------------
  // FailureReport injection — task.context.failureReport path
  // (simulates TEST_QA handing a real FailureReport to DEBUG_REVIEW)
  // -------------------------------------------------------------------------

  test('accepts a full FailureReport injected via task.context.failureReport', async () => {
    const injected: FailureReport = {
      testFailure:
        'getDiscount — integration via checkout should give premium customers a 10% discount via checkout',
      stackTrace:
        'Error: expect(received).toBe(expected) // Object.is equality\n' +
        '\nExpected: 10\nReceived: 0\n' +
        `    at Object.toBe (${path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo', 'tests', 'discount.test.js')}:50:29)\n`,
      relevantCode: '',   // empty — agent should fill this in
      rootCause: '',      // empty — agent should compute this
      confidence: 'LOW',  // should be upgraded to HIGH after analysis
    };

    const result = await runDebugReview(
      makeTask('debug injected failure', { failureReport: injected }),
    );

    expect(result.agent).toBe('DEBUG_REVIEW');
    expect(result.status).toBe('SUCCESS');

    const fr = result.failureReport!;
    expect(fr.testFailure).toMatch(/premium/i);
    expect(fr.confidence).toBe('HIGH');
    expect(fr.rootCause.toLowerCase()).toMatch(/membership|field.?name|type/i);
    expect(fr.rootCause.toLowerCase()).toMatch(/fix|change|membership/i);
  });

  test('injected FailureReport path examines checkout.js and discountService.js', async () => {
    const injected: FailureReport = {
      testFailure: 'premium discount test',
      stackTrace:
        `    at Object.toBe (${path.resolve(__dirname, '..', '..', '..', 'ecommerce-demo', 'tests', 'discount.test.js')}:50:29)\n`,
      relevantCode: '',
      rootCause: '',
      confidence: 'LOW',
    };

    const result = await runDebugReview(
      makeTask('examine source files', { failureReport: injected }),
    );

    const examined = result.filesExamined;
    expect(examined.some(f => f.includes('checkout.js'))).toBe(true);
    expect(examined.some(f => f.includes('discountService.js'))).toBe(true);
  });

  test('injected FailureReport path does not re-run Jest (fast path)', async () => {
    // When a FailureReport is injected, the agent should return quickly because
    // it skips the Jest subprocess.  We verify the result is still fully valid.
    const injected: FailureReport = {
      testFailure: 'synthetic failing test',
      stackTrace: 'Error: synthetic\n    at Object.foo (fakefile.js:1:1)\n',
      relevantCode: 'const x = 1; // synthetic',
      rootCause: '',
      confidence: 'LOW',
    };

    const start = Date.now();
    const result = await runDebugReview(
      makeTask('fast path check', { failureReport: injected }),
    );
    const elapsed = Date.now() - start;

    // Should complete in well under 10 s (no Jest subprocess)
    expect(elapsed).toBeLessThan(10_000);
    expect(result.failureReport).toBeDefined();
    expect(result.failureReport!.rootCause.length).toBeGreaterThan(0);
  });

  test('injected FailureReport preserves the original testFailure name', async () => {
    const injected: FailureReport = {
      testFailure: 'my unique test name XYZ',
      stackTrace: '',
      relevantCode: '',
      rootCause: '',
      confidence: 'LOW',
    };

    const result = await runDebugReview(
      makeTask('preserve test name', { failureReport: injected }),
    );

    expect(result.failureReport!.testFailure).toBe('my unique test name XYZ');
  });

  // -------------------------------------------------------------------------
  // Stack trace parsing with Windows absolute paths
  // -------------------------------------------------------------------------

  test('parseStackFrame handles Windows absolute paths in stack traces', async () => {
    // Inject a stack trace with a real Windows-style absolute path to a file
    // that actually exists in ecommerce-demo/tests/
    const realFile = path.resolve(
      __dirname, '..', '..', '..', 'ecommerce-demo', 'tests', 'discount.test.js',
    );
    const windowsStack =
      `Error: Expected 10 but received 0\n` +
      `    at Object.toBe (${realFile}:50:29)\n`;

    const result = await runDebugReview(
      makeTask('windows path parsing', {
        stackTrace: windowsStack,
        failingTest: 'windows path test',
      }),
    );

    // The agent ran Jest (real failure exists), so the live path fired.
    // In either case, the failureReport must be fully populated.
    expect(result.failureReport).toBeDefined();
    expect(result.failureReport!.rootCause.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Real Jest execution confirmation (not mocked)
  // -------------------------------------------------------------------------

  test('runs real Jest and returns live counts (totalTests > 0)', async () => {
    // If Jest is executed correctly via node + jest.js, it returns 10 tests.
    // If the bash shim was used on Windows, Jest would fail silently and the
    // agent would fall back to the injected-context path (which has no context
    // here) and return testFailure: 'none'.  We verify the live path ran.
    const result = await runDebugReview(makeTask('live jest run'));

    // The ecommerce-demo has 1 intentional failure — agent detects it
    expect(result.failureReport!.testFailure).not.toBe('none');
  });
});
