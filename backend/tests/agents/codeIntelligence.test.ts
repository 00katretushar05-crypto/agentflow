/**
 * tests/agents/codeIntelligence.test.ts
 *
 * Unit tests for the CODE_INTELLIGENCE agent.
 *
 * Strategy: use real ecommerce-demo files on disk — no mocking needed because
 * the agent just does file-system reads and regex analysis.
 */

import { runCodeIntelligence } from '../../src/agents/codeIntelligence.js';
import { describe, test, expect } from 'vitest';
import type { AgentTask } from '../../src/types/contracts';

// Minimal valid task factory
function makeTask(goal: string, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    taskId: 'test-ci-001',
    agent: 'CODE_INTELLIGENCE',
    goal,
    assignedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('runCodeIntelligence', () => {
  // -------------------------------------------------------------------------
  // Shape & contract
  // -------------------------------------------------------------------------

  test('returns a valid AgentResult with all required fields', async () => {
    const result = await runCodeIntelligence(makeTask('fix discount bug'));

    expect(result.agent).toBe('CODE_INTELLIGENCE');
    expect(['SUCCESS', 'FAILURE', 'PARTIAL']).toContain(result.status);
    expect(result.task.taskId).toBe('test-ci-001');
    expect(result.task.assignedAt).toBeTruthy();
    expect(typeof result.completedAt).toBe('string');
    // completedAt must be a parseable ISO timestamp
    expect(() => new Date(result.completedAt)).not.toThrow();
    expect(new Date(result.completedAt).getTime()).not.toBeNaN();
    expect(Array.isArray(result.filesExamined)).toBe(true);
    expect(Array.isArray(result.filesModified)).toBe(true);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.confidence);
    expect(typeof result.recommendedNextAction).toBe('string');
  });

  test('populates findings with required fields', async () => {
    const result = await runCodeIntelligence(makeTask('fix discount bug'));

    expect(result.findings).toBeDefined();
    const f = result.findings!;
    expect(Array.isArray(f.affectedFiles)).toBe(true);
    expect(Array.isArray(f.affectedFunctions)).toBe(true);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(f.riskLevel);
    expect(typeof f.recommendation).toBe('string');
    expect(f.recommendation.length).toBeGreaterThan(0);
  });

  test('filesModified is empty (agent is read-only)', async () => {
    const result = await runCodeIntelligence(makeTask('checkout premium discount'));
    expect(result.filesModified).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // File-system inspection
  // -------------------------------------------------------------------------

  test('examines all four ecommerce-demo source files', async () => {
    const result = await runCodeIntelligence(makeTask('improve discount logic'));

    const examined = result.filesExamined;
    expect(examined.some(f => f.includes('checkout.js'))).toBe(true);
    expect(examined.some(f => f.includes('discountService.js'))).toBe(true);
    expect(examined.some(f => f.includes('orderService.js'))).toBe(true);
    expect(examined.some(f => f.includes('userService.js'))).toBe(true);
  });

  test('extracts real function names from source files', async () => {
    const result = await runCodeIntelligence(makeTask('discount premium customer'));

    const fns = result.findings!.affectedFunctions;
    // These functions exist in the actual ecommerce-demo source
    expect(fns).toContain('getDiscount');
    expect(fns).toContain('checkout');
  });

  // -------------------------------------------------------------------------
  // Goal-based relevance filtering
  // -------------------------------------------------------------------------

  test('identifies checkout + discount files as relevant for discount-related goal', async () => {
    const result = await runCodeIntelligence(
      makeTask('fix the premium customer discount calculation'),
    );

    const affected = result.findings!.affectedFiles;
    expect(affected.some(f => f.includes('checkout'))).toBe(true);
    expect(affected.some(f => f.includes('discount'))).toBe(true);
  });

  test('falls back to all files when goal has no matching keywords', async () => {
    const result = await runCodeIntelligence(makeTask('xyzzy'));

    // Fallback: all scanned files become affected files
    expect(result.findings!.affectedFiles.length).toBeGreaterThanOrEqual(4);
  });

  // -------------------------------------------------------------------------
  // Risk estimation
  // -------------------------------------------------------------------------

  test('risk level is HIGH or MEDIUM for a cross-module task', async () => {
    const result = await runCodeIntelligence(
      makeTask('fix checkout discount for premium users'),
    );

    // checkout.js depends on discountService + userService → multi-module coupling
    expect(['HIGH', 'MEDIUM']).toContain(result.findings!.riskLevel);
  });

  test('task fields are echoed back unchanged in result', async () => {
    const task = makeTask('some goal', { taskId: 'echo-test', context: { key: 'val' } });
    const result = await runCodeIntelligence(task);

    expect(result.task.taskId).toBe('echo-test');
    expect(result.task.goal).toBe('some goal');
    expect(result.task.context).toEqual({ key: 'val' });
  });

  test('recommendedNextAction mentions TEST_QA or next step', async () => {
    const result = await runCodeIntelligence(makeTask('discount bug'));
    expect(result.recommendedNextAction.toLowerCase()).toMatch(/test|qa|proceed/i);
  });
});
