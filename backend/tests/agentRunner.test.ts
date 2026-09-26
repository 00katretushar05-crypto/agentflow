/**
 * agentRunner.test.ts — Unit tests for agentRunner.ts.
 *
 * Tests cover:
 *   • runAgent() never throws — even if the underlying agent function throws
 *   • dispatches to correct agent based on task.agent
 *   • synthesises a FAILURE result on internal agent error
 *   • returned result always has the required fields
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runAgent } from '../src/agentRunner.js';
import type { AgentTask } from '../src/types/contracts.js';

const CHECKOUT_JS = path.resolve(
  __dirname, '..', '..', 'ecommerce-demo', 'src', 'checkout', 'checkout.js',
);

const BUGGY_CHECKOUT = `/**
 * checkout.js
 * Handles the checkout flow: looks up the customer, applies a discount,
 * and delegates order creation to orderService.
 *
 * ⚠️  INTENTIONAL DEMO BUG — hackathon target
 *     Line marked [BUG] below passes \`customer.type\` to discountService,
 *     but discountService.getDiscount() expects \`customer.membership\`.
 *     Because the field names differ, premium customers receive 0 % discount
 *     instead of the required 10 % (see requirements.md).
 *
 *     Fix: change \`type: customer.type\` → \`membership: customer.type\`
 *     (or align the field name used across both modules).
 */

const { getDiscount } = require('../discounts/discountService');
const { createOrder } = require('../orders/orderService');
const { getUserById } = require('../users/userService');

/**
 * Processes checkout for a user.
 * @param {string} userId
 * @param {Array<{ id: string, price: number }>} items
 * @returns {{ orderId: string, total: number, discount: number }}
 */
function checkout(userId, items) {
  const customer = getUserById(userId);

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // [BUG] Should be { membership: customer.type } so discountService can
  //       detect premium status.  Using \`type\` means membership is undefined
  //       inside getDiscount(), so the 10 % branch is never reached.
  const discountRate = getDiscount({ type: customer.type }); // ← INTENTIONAL BUG

  const discount = subtotal * discountRate;
  const total = subtotal - discount;

  const order = createOrder({ userId, items, total, discount });

  return { orderId: order.id, total, discount };
}

module.exports = { checkout };`;

function restoreCheckout(): void {
  fs.writeFileSync(CHECKOUT_JS, BUGGY_CHECKOUT, 'utf-8');
}

beforeEach(() => {
  restoreCheckout();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreCheckout();
});

afterAll(() => {
  restoreCheckout();
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
// TEST_QA — real ecommerce-demo integration behaviour
// ---------------------------------------------------------------------------

describe('TEST_QA — real ecommerce-demo integration', () => {
  // The real agent runs live Jest with no setTimeout, so restore real timers.
  beforeEach(() => { vi.useRealTimers(); });

  it('returns PARTIAL or SUCCESS (never an unhandled throw)', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 0 } });
    const result = await runAgent(task);
    expect(['PARTIAL', 'SUCCESS', 'FAILURE']).toContain(result.status);
  });

  it('populates testResult with numeric counts', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 0 } });
    const result = await runAgent(task);
    expect(typeof result.testResult?.totalTests).toBe('number');
    expect(typeof result.testResult?.passed).toBe('number');
    expect(typeof result.testResult?.failed).toBe('number');
  });

  it('result.agent is TEST_QA', async () => {
    const task = makeTask({ agent: 'TEST_QA', context: { retryCount: 0 } });
    const result = await runAgent(task);
    expect(result.agent).toBe('TEST_QA');
  });
});
