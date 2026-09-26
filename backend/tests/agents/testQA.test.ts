/**
 * tests/agents/testQA.test.ts
 *
 * Unit tests for the TEST_QA agent.
 *
 * Strategy: the agent runs real Jest against ecommerce-demo (which has the
 * intentional bug), so we can assert on the actual live results.
 */
import { describe, test, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { runTestQA } from '../../src/agents/testQA.js';
import type { AgentTask } from '../../src/types/contracts';
function makeTask(goal: string, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    taskId: 'test-qa-001',
    agent: 'TEST_QA',
    goal,
    assignedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('runTestQA', () => {
  // -------------------------------------------------------------------------
  // Shape & contract  (these pass regardless of Jest availability)
  // -------------------------------------------------------------------------

  test('returns a valid AgentResult with all required fields', async () => {
    const result = await runTestQA(makeTask('fix discount bug'));

    expect(result.agent).toBe('TEST_QA');
    expect(['SUCCESS', 'FAILURE', 'PARTIAL']).toContain(result.status);
    expect(result.task.taskId).toBe('test-qa-001');
    expect(result.task.assignedAt).toBeTruthy();
    expect(typeof result.completedAt).toBe('string');
    expect(new Date(result.completedAt).getTime()).not.toBeNaN();
    expect(Array.isArray(result.filesExamined)).toBe(true);
    expect(Array.isArray(result.filesModified)).toBe(true);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.confidence);
    expect(typeof result.recommendedNextAction).toBe('string');
  });

  test('populates testResult with required fields', async () => {
    const result = await runTestQA(makeTask('fix discount bug'));

    expect(result.testResult).toBeDefined();
    const tr = result.testResult!;
    expect(typeof tr.totalTests).toBe('number');
    expect(typeof tr.passed).toBe('number');
    expect(typeof tr.failed).toBe('number');
    expect(Array.isArray(tr.failures)).toBe(true);
    expect(typeof tr.executedAt).toBe('string');
    expect(new Date(tr.executedAt).getTime()).not.toBeNaN();
  });

  test('filesModified is empty (agent is read-only)', async () => {
    const result = await runTestQA(makeTask('discount test coverage'));
    expect(result.filesModified).toEqual([]);
  });

  test('task fields are echoed back unchanged', async () => {
    const task = makeTask('some goal', { taskId: 'echo-qa', context: { env: 'test' } });
    const result = await runTestQA(task);

    expect(result.task.taskId).toBe('echo-qa');
    expect(result.task.goal).toBe('some goal');
    expect(result.task.context).toEqual({ env: 'test' });
  });

  // -------------------------------------------------------------------------
  // File-system scanning
  // -------------------------------------------------------------------------

  test('discovers existing test files in ecommerce-demo/tests/', async () => {
    const result = await runTestQA(makeTask('discount tests'));

    const examined = result.filesExamined;
    expect(examined.length).toBeGreaterThan(0);
    expect(examined.some(f => f.includes('discount.test.js'))).toBe(true);
    expect(examined.some(f => f.includes('checkout.test.js'))).toBe(true);
    expect(examined.some(f => f.includes('order.test.js'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Live Jest results (ecommerce-demo has the intentional failing test)
  // -------------------------------------------------------------------------

  test('detects the intentional failing test — premium discount integration', async () => {
    const result = await runTestQA(makeTask('premium customer discount'));
    const tr = result.testResult!;

    // ecommerce-demo has exactly 1 intentionally failing test
    expect(tr.failed).toBeGreaterThanOrEqual(1);
    expect(tr.failures.length).toBeGreaterThanOrEqual(1);

    const failingTest = tr.failures[0]!;
    expect(typeof failingTest.testName).toBe('string');
    expect(failingTest.testName.length).toBeGreaterThan(0);
    // The failing test is the premium discount integration test
    expect(failingTest.testName).toMatch(/premium/i);
  });

  test('passed count + failed count equals total count', async () => {
    const result = await runTestQA(makeTask('checkout discount'));
    const tr = result.testResult!;

    expect(tr.passed + tr.failed).toBe(tr.totalTests);
  });

  test('most tests pass (only 1 intentional failure exists)', async () => {
    const result = await runTestQA(makeTask('all tests'));
    const tr = result.testResult!;

    // ecommerce-demo: 8 tests total, 7 pass, 1 fails
    expect(tr.totalTests).toBeGreaterThanOrEqual(7);
    expect(tr.passed).toBeGreaterThanOrEqual(6);
  });

  test('failure entry has testName, expected and received fields', async () => {
    const result = await runTestQA(makeTask('premium discount'));
    const tr = result.testResult!;

    if (tr.failures.length > 0) {
      const f = tr.failures[0]!;
      expect(typeof f.testName).toBe('string');
      expect(typeof f.expected).toBe('string');
      expect(typeof f.received).toBe('string');
    }
  });

  // -------------------------------------------------------------------------
  // Regression risk + recommended action
  // -------------------------------------------------------------------------

  test('recommendedNextAction mentions DEBUG_REVIEW when tests fail', async () => {
    const result = await runTestQA(makeTask('run all tests'));

    if (result.testResult!.failed > 0) {
      expect(result.recommendedNextAction.toLowerCase()).toMatch(/debug|escalate/i);
    }
  });

  test('status is PARTIAL when failures exist', async () => {
    const result = await runTestQA(makeTask('run all tests'));

    if (result.testResult!.failed > 0) {
      expect(result.status).toBe('PARTIAL');
    }
  });

  // -------------------------------------------------------------------------
  // Real Jest execution — confirms the agent actually runs Jest (not mocked)
  // -------------------------------------------------------------------------

  test('executes Jest via node + jest.js (not the bash shim)', async () => {
    // Confirm the jest.js entry point exists in ecommerce-demo — if the agent
    // was using the .bin shim (bash script) it would fail silently on Windows
    // and return totalTests=0.  A real run returns totalTests >= 1.
    const result = await runTestQA(makeTask('real jest execution'));
    const tr = result.testResult!;

    expect(tr.totalTests).toBeGreaterThanOrEqual(1);
    expect(tr.passed + tr.failed).toBe(tr.totalTests);
  });

  test('executedAt is set to a recent ISO timestamp', async () => {
    const before = Date.now();
    const result = await runTestQA(makeTask('timestamp check'));
    const after = Date.now();

    const ts = new Date(result.testResult!.executedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('failure entries contain the full test name (ancestor + title)', async () => {
    const result = await runTestQA(makeTask('premium discount'));
    const tr = result.testResult!;

    if (tr.failures.length > 0) {
      // Jest fullName is "<describe> <test>" — should contain both parts
      expect(tr.failures[0]!.testName).toMatch(
        /getDiscount.*integration.*checkout|premium/i,
      );
    }
  });

  test('confidence is HIGH when Jest produces valid JSON output', async () => {
    const result = await runTestQA(makeTask('confidence check'));
    // If totalTests > 0, Jest ran and returned valid JSON → confidence is HIGH
    if (result.testResult!.totalTests > 0) {
      expect(result.confidence).toBe('HIGH');
    }
  });

  // -------------------------------------------------------------------------
  // ecommerce-demo/tests directory is the scanning root
  // -------------------------------------------------------------------------

  test('filesExamined paths are relative to ecommerce-demo root', async () => {
    const result = await runTestQA(makeTask('path format check'));

    // Paths should be relative (not absolute) and forward-slash separated
    for (const f of result.filesExamined) {
      expect(path.isAbsolute(f)).toBe(false);
      expect(f).not.toContain('\\');
    }
  });

  test('ecommerce-demo/tests/ directory contains the expected 3 test files', () => {
    // Sanity check — if this fails the test fixture has been altered
    const testsDir = path.resolve(
      __dirname, '..', '..', '..', 'ecommerce-demo', 'tests',
    );
    const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
    expect(files).toHaveLength(3);
    expect(files).toContain('checkout.test.js');
    expect(files).toContain('discount.test.js');
    expect(files).toContain('order.test.js');
  });
});
