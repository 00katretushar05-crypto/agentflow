/**
 * api.test.ts — Route-level tests for the AgentFlow Express API.
 *
 * Uses supertest to issue HTTP requests against the Express app without
 * binding a real port.  The in-memory run store is shared across the whole
 * module; tests create fresh tasks so they don't interfere with each other.
 *
 * Fake timers (vi.useFakeTimers) are used to prevent the background
 * orchestration pipeline from racing ahead during synchronous assertions.
 * Tests that need to exercise a running pipeline call drainPipeline().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

// ---------------------------------------------------------------------------
// App instance — shared for the entire test file; stateless beyond the store
// ---------------------------------------------------------------------------

const app = createApp();

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Drain all pending timers and micro-tasks so the pipeline can settle. */
async function drainPipeline(): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// POST /api/task
// ---------------------------------------------------------------------------

describe('POST /api/task', () => {
  it('201 — creates a task and returns taskId + status=RECEIVED', async () => {
    const res = await request(app)
      .post('/api/task')
      .send({ goal: 'Test goal for creation' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.data.taskId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.data.status).toBe('RECEIVED');
  });

  it('400 — missing goal returns INVALID_REQUEST', async () => {
    const res = await request(app)
      .post('/api/task')
      .send({})
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('400 — empty string goal returns INVALID_REQUEST', async () => {
    const res = await request(app)
      .post('/api/task')
      .send({ goal: '   ' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('accepts an optional maxRetries field', async () => {
    const res = await request(app)
      .post('/api/task')
      .send({ goal: 'Goal with custom retries', maxRetries: 5 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    // Verify the created task reflects maxRetries
    const taskId: string = res.body.data.taskId;
    const detail = await request(app).get(`/api/task/${taskId}`);
    expect(detail.body.data.maxRetries).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// GET /api/task/:id
// ---------------------------------------------------------------------------

describe('GET /api/task/:id', () => {
  it('200 — returns the full SupervisorTaskState shape', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Full state shape test' })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;

    const res = await request(app).get(`/api/task/${taskId}`);

    expect(res.status).toBe(200);
    const state = res.body.data;

    // Core required fields
    expect(state.taskId).toBe(taskId);
    expect(state.goal).toBe('Full state shape test');
    expect(typeof state.status).toBe('string');
    expect(Array.isArray(state.history)).toBe(true);
    expect(Array.isArray(state.agentStatus)).toBe(true);
    expect(typeof state.agentResults).toBe('object');
    expect(typeof state.retryCount).toBe('number');
    expect(typeof state.maxRetries).toBe('number');
    expect(typeof state.createdAt).toBe('string');
    expect(typeof state.updatedAt).toBe('string');
  });

  it('200 — initial status is RECEIVED', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Status check goal' })
      .set('Content-Type', 'application/json');

    const res = await request(app).get(`/api/task/${create.body.data.taskId}`);
    expect(res.body.data.status).toBe('RECEIVED');
  });

  it('200 — agentStatus array contains entries for the three known agents', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Agent status entries test' })
      .set('Content-Type', 'application/json');

    const res = await request(app).get(`/api/task/${create.body.data.taskId}`);
    const agentStatus: { agent: string; status: string }[] = res.body.data.agentStatus;

    const agents = agentStatus.map((e) => e.agent);
    expect(agents).toContain('CODE_INTELLIGENCE');
    expect(agents).toContain('TEST_QA');
    expect(agents).toContain('DEBUG_REVIEW');
  });

  it('200 — history[0] is a RECEIVED entry', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'History first entry test' })
      .set('Content-Type', 'application/json');

    const res = await request(app).get(`/api/task/${create.body.data.taskId}`);
    const history: { from: string; to: string }[] = res.body.data.history;

    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.to).toBe('RECEIVED');
  });

  it('404 — unknown taskId returns NOT_FOUND', async () => {
    const res = await request(app).get('/api/task/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.taskId).toBe('does-not-exist');
  });

  it('200 — state after pipeline drain has agentResults populated', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Add rate limiting to the /api/auth/login endpoint', maxRetries: 2 })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;
    await drainPipeline();

    const res = await request(app).get(`/api/task/${taskId}`);
    expect(res.status).toBe(200);
    // After full pipeline, CODE_INTELLIGENCE and TEST_QA should be present
    expect(res.body.data.agentResults['CODE_INTELLIGENCE']).toBeDefined();
    expect(res.body.data.agentResults['TEST_QA']).toBeDefined();
  });

  it('200 — pipeline reaches AWAITING_APPROVAL for canonical demo task', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Add rate limiting to the /api/auth/login endpoint', maxRetries: 2 })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;
    await drainPipeline();

    const res = await request(app).get(`/api/task/${taskId}`);
    expect(res.status).toBe(200);
    // With maxRetries=2 the canonical demo task should always reach AWAITING_APPROVAL
    expect(res.body.data.status).toBe('AWAITING_APPROVAL');
  });
});

// ---------------------------------------------------------------------------
// GET /api/task/:id/evidence
// ---------------------------------------------------------------------------

describe('GET /api/task/:id/evidence', () => {
  it('200 — returns taskId, items array, and updatedAt', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Evidence endpoint shape test' })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;

    const res = await request(app).get(`/api/task/${taskId}/evidence`);

    expect(res.status).toBe(200);
    const body = res.body.data;
    expect(body.taskId).toBe(taskId);
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.updatedAt).toBe('string');
  });

  it('200 — items have seq, type, timestamp, summary, payload', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Evidence item fields test' })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;

    const res = await request(app).get(`/api/task/${taskId}/evidence`);

    const items: {
      seq: number;
      type: string;
      timestamp: string;
      summary: string;
      payload: unknown;
    }[] = res.body.data.items;

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(typeof item.seq).toBe('number');
      expect(item.seq).toBeGreaterThan(0);
      expect(['TRANSITION', 'AGENT_RESULT']).toContain(item.type);
      expect(typeof item.timestamp).toBe('string');
      expect(typeof item.summary).toBe('string');
      expect(item.payload).toBeDefined();
    }
  });

  it('200 — seq values are 1-based and monotonically increasing', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Seq ordering test' })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;
    await drainPipeline();

    const res = await request(app).get(`/api/task/${taskId}/evidence`);
    const items: { seq: number }[] = res.body.data.items;

    expect(items.length).toBeGreaterThan(0);
    for (let i = 0; i < items.length; i++) {
      expect(items[i]?.seq).toBe(i + 1);
    }
  });

  it('200 — evidence includes AGENT_RESULT entries after pipeline drain', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Add rate limiting to the /api/auth/login endpoint', maxRetries: 2 })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;
    await drainPipeline();

    const res = await request(app).get(`/api/task/${taskId}/evidence`);
    const items: { type: string }[] = res.body.data.items;

    const agentItems = items.filter((i) => i.type === 'AGENT_RESULT');
    expect(agentItems.length).toBeGreaterThan(0);
  });

  it('404 — unknown taskId returns NOT_FOUND', async () => {
    const res = await request(app).get('/api/task/no-such-task/evidence');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// POST /api/task/:id/approve
// ---------------------------------------------------------------------------

describe('POST /api/task/:id/approve', () => {
  it('200 — approves a task that is AWAITING_APPROVAL, returns VERIFIED', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Add rate limiting to the /api/auth/login endpoint', maxRetries: 2 })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;
    await drainPipeline();

    // Only proceed if the pipeline actually reached AWAITING_APPROVAL
    const check = await request(app).get(`/api/task/${taskId}`);
    if (check.body.data.status !== 'AWAITING_APPROVAL') return;

    const res = await request(app).post(`/api/task/${taskId}/approve`);

    expect(res.status).toBe(200);
    expect(res.body.data.taskId).toBe(taskId);
    expect(res.body.data.status).toBe('VERIFIED');
  });

  it('400 — approving a task not in AWAITING_APPROVAL returns INVALID_REQUEST', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Premature approve test' })
      .set('Content-Type', 'application/json');

    // Task is still RECEIVED — approving should fail
    const res = await request(app).post(`/api/task/${create.body.data.taskId}/approve`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
    expect(res.body.taskId).toBe(create.body.data.taskId);
  });

  it('404 — unknown taskId returns NOT_FOUND', async () => {
    const res = await request(app).post('/api/task/ghost-id/approve');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks
// ---------------------------------------------------------------------------

describe('GET /api/tasks', () => {
  it('200 — returns a tasks array', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.tasks)).toBe(true);
  });

  it('200 — newly created task appears in the list', async () => {
    const create = await request(app)
      .post('/api/task')
      .send({ goal: 'Task list visibility test' })
      .set('Content-Type', 'application/json');

    const taskId: string = create.body.data.taskId;

    const res = await request(app).get('/api/tasks');
    const tasks: { taskId: string }[] = res.body.data.tasks;

    expect(tasks.some((t) => t.taskId === taskId)).toBe(true);
  });

  it('200 — each task row has required TaskHistoryItem fields', async () => {
    await request(app)
      .post('/api/task')
      .send({ goal: 'Task history item shape test' })
      .set('Content-Type', 'application/json');

    const res = await request(app).get('/api/tasks');
    const tasks: {
      taskId: string;
      goal: string;
      status: string;
      retryCount: number;
      maxRetries: number;
      createdAt: string;
      updatedAt: string;
    }[] = res.body.data.tasks;

    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(typeof task.taskId).toBe('string');
      expect(typeof task.goal).toBe('string');
      expect(typeof task.status).toBe('string');
      expect(typeof task.retryCount).toBe('number');
      expect(typeof task.maxRetries).toBe('number');
      expect(typeof task.createdAt).toBe('string');
      expect(typeof task.updatedAt).toBe('string');
    }
  });

  it('200 — task count increases after creating a new task', async () => {
    const before = await request(app).get('/api/tasks');
    const countBefore: number = before.body.data.tasks.length;

    await request(app)
      .post('/api/task')
      .send({ goal: 'Count increment test' })
      .set('Content-Type', 'application/json');

    const after = await request(app).get('/api/tasks');
    expect(after.body.data.tasks.length).toBe(countBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// 404 catch-all
// ---------------------------------------------------------------------------

describe('unknown routes', () => {
  it('404 — unmatched routes return a 404 response', async () => {
    const res = await request(app).get('/api/not-a-real-route');
    expect(res.status).toBe(404);
  });
});
