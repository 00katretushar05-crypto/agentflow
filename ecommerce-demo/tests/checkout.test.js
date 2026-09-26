/**
 * tests/checkout.test.js
 *
 * Tests for the checkout() function.
 * These tests verify overall totals and structure; they pass even with the
 * discount bug because they don't assert on the premium discount amount.
 */

const { checkout } = require('../src/checkout/checkout');

describe('checkout', () => {
  test('returns an orderId, total, and discount', () => {
    const result = checkout('user-002', [{ id: 'item-A', price: 50 }]);
    expect(result).toHaveProperty('orderId');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('discount');
  });

  test('total equals subtotal minus discount', () => {
    const items = [
      { id: 'item-A', price: 40 },
      { id: 'item-B', price: 60 },
    ];
    const result = checkout('user-002', items);
    expect(result.total).toBe(100 - result.discount);
  });

  test('regular customer receives 0% discount', () => {
    const result = checkout('user-002', [{ id: 'item-A', price: 200 }]);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(200);
  });
});
