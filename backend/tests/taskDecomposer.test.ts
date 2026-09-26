/**
 * taskDecomposer.test.ts — Unit tests for taskDecomposer.ts.
 *
 * Tests cover:
 *   • Canonical demo task produces exactly 3 deterministic subtasks
 *   • Each subtask has the correct agent, a non-empty goal, assignedAt timestamp
 *   • Generic goals also produce 3 subtasks covering all three agents
 *   • taskId embedding in subtask IDs
 */

import { describe, it, expect } from 'vitest';
import { decomposeTask } from '../src/taskDecomposer.js';

const CANONICAL_GOAL = 'Add rate limiting to the /api/auth/login endpoint';

describe('decomposeTask() — canonical demo task', () => {
  it('produces exactly 3 subtasks', () => {
    const tasks = decomposeTask('parent-123', CANONICAL_GOAL);
    expect(tasks).toHaveLength(3);
  });

  it('subtasks are CODE_INTELLIGENCE, TEST_QA, DEBUG_REVIEW in order', () => {
    const tasks = decomposeTask('parent-123', CANONICAL_GOAL);
    expect(tasks[0]?.agent).toBe('CODE_INTELLIGENCE');
    expect(tasks[1]?.agent).toBe('TEST_QA');
    expect(tasks[2]?.agent).toBe('DEBUG_REVIEW');
  });

  it('is deterministic — same goal always returns same agent order', () => {
    const a = decomposeTask('p1', CANONICAL_GOAL).map((t) => t.agent);
    const b = decomposeTask('p2', CANONICAL_GOAL).map((t) => t.agent);
    expect(a).toEqual(b);
  });

  it('is case-insensitive for canonical match', () => {
    const tasks = decomposeTask('parent-123', CANONICAL_GOAL.toUpperCase());
    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.agent).toBe('CODE_INTELLIGENCE');
  });

  it('each task has a non-empty goal string', () => {
    const tasks = decomposeTask('parent-123', CANONICAL_GOAL);
    for (const task of tasks) {
      expect(task.goal.length).toBeGreaterThan(0);
    }
  });

  it('each task embeds the parent taskId in its own taskId', () => {
    const parentId = 'parent-abc';
    const tasks = decomposeTask(parentId, CANONICAL_GOAL);
    for (const task of tasks) {
      expect(task.taskId).toContain(parentId);
    }
  });

  it('each task has a valid ISO assignedAt timestamp', () => {
    const tasks = decomposeTask('parent-123', CANONICAL_GOAL);
    for (const task of tasks) {
      expect(Date.parse(task.assignedAt)).not.toBeNaN();
    }
  });
});

describe('decomposeTask() — generic goals', () => {
  it('produces 3 subtasks for a non-canonical goal', () => {
    const tasks = decomposeTask('p', 'Refactor the payment service');
    expect(tasks).toHaveLength(3);
  });

  it('includes all three agent types', () => {
    const tasks = decomposeTask('p', 'Refactor the payment service');
    const agents = tasks.map((t) => t.agent);
    expect(agents).toContain('CODE_INTELLIGENCE');
    expect(agents).toContain('TEST_QA');
    expect(agents).toContain('DEBUG_REVIEW');
  });

  it('embeds the goal in each subtask goal string', () => {
    const goal = 'Refactor the payment service';
    const tasks = decomposeTask('p', goal);
    for (const task of tasks) {
      expect(task.goal).toContain(goal);
    }
  });
});
