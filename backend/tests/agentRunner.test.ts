/**
 * agentRunner.test.ts — Unit tests for agentRunner.ts.
 *
 * Tests cover:
 *   • runAgent() never throws — even if the underlying agent function throws
 *   • dispatches to correct agent based on task.agent
 *   • synthesises a FAILURE result on internal agent error
 *   • returned result always has the required fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAgent } from '../src/agentRunner.js';
import type { AgentTask } from '../src/types/contracts.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function runAndDrain(task: AgentTask) {
  const promise = runAgent(task);
  await vi.runAllTimersAsync();
  return promise;
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    taskId: 'test-task-id',
    agent: 'CODE_INTELLIGENCE',
    goal: 'Test goal',
    assignedAt: new Date().toISOString(),
    context: { retryCount: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Never throws contract
// ---------------------------------------------------------------------------

describe('runAgent() — never throws contract', () => {
  it('does not throw for CODE_INTELLIGENCE', async () => {
    const result = await runAndDrain(makeTask({ agent: 'CODE_INTELLIGENCE' }));
    expect(result).toBeDefined();
  });

  it('does not throw for TEST_QA', async () => {
    const result = await runAndDrain(makeTask({ agent: 'TEST_QA' }));
    expect(result).toBeDefined();
  });

  it('does not throw for DEBUG_REVIEW', async () => {
    const result = await runAndDrain(makeTask({ agent: 'DEBUG_REVIEW' }));
    expect(result).toBeDefined();
  });

  it('returns FAILURE (not throws) when agent function throws internally', async () => {
    // Mock the CODE_INTELLIGENCE agent to throw
    const ciModule = await import('../src/agents/codeIntelligence.js');
    vi.spyOn(ciModule, 'runCodeIntelligence').mockRejectedValueOnce(
      new Error('Simulated internal crash'),
    );

    const result = await runAndDrain(makeTask({ agent: 'CODE_INTELLIGENCE' }));
    expect(result.status).toBe('FAILURE');
    expect(result.recommendedNextAction).toContain('Simulated internal crash');
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('runAgent() — result shape', () => {
  it('result.agent matches task.agent', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 1 } });
    const result = await runAndDrain(task);
    expect(result.agent).toBe('TEST_QA');
  });

  it('result.completedAt is a valid ISO timestamp', async () => {
    const result = await runAndDrain(makeTask());
    expect(Date.parse(result.completedAt)).not.toBeNaN();
  });

  it('result.status is one of SUCCESS | FAILURE | PARTIAL', async () => {
    const result = await runAndDrain(makeTask());
    expect(['SUCCESS', 'FAILURE', 'PARTIAL']).toContain(result.status);
  });

  it('result.task references the original task', async () => {
    const task = makeTask();
    const result = await runAndDrain(task);
    expect(result.task.taskId).toBe(task.taskId);
  });
});

// ---------------------------------------------------------------------------
// TEST_QA stub determinism
// ---------------------------------------------------------------------------

describe('TEST_QA stub — deterministic behaviour', () => {
  it('returns FAILURE with 1 failed test on retryCount=0', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 0 } });
    const result = await runAndDrain(task);
    expect(result.status).toBe('FAILURE');
    expect(result.testResult?.failed).toBe(1);
  });

  it('returns SUCCESS with 0 failed tests on retryCount=1', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 1 } });
    const result = await runAndDrain(task);
    expect(result.status).toBe('SUCCESS');
    expect(result.testResult?.failed).toBe(0);
  });

  it('returns SUCCESS with 0 failed tests on retryCount=2', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 2 } });
    const result = await runAndDrain(task);
    expect(result.status).toBe('SUCCESS');
    expect(result.testResult?.failed).toBe(0);
  });
});
