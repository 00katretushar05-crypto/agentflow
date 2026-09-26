/**
 * tests/order.test.js
 *
 * Tests for orderService.createOrder().
 */

const { createOrder } = require('../src/orders/orderService');

describe('createOrder', () => {
  test('returns an order with expected fields', () => {
    const order = createOrder({
      userId: 'user-001',
      items: [{ id: 'item-1', price: 50 }],
      total: 45,
      discount: 5,
    });

    expect(order).toHaveProperty('id');
    expect(order.id).toMatch(/^ORD-/);
    expect(order.userId).toBe('user-001');
    expect(order.total).toBe(45);
    expect(order.discount).toBe(5);
  });

  test('each order receives a unique id', () => {
    const o1 = createOrder({ userId: 'u1', items: [], total: 0, discount: 0 });
    const o2 = createOrder({ userId: 'u1', items: [], total: 0, discount: 0 });
    expect(o1.id).not.toBe(o2.id);
  });
});
