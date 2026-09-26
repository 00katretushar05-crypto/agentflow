/**
 * tests/discount.test.js
 *
 * Tests for discountService.getDiscount().
 *
 * ⚠️  INTENTIONAL DEMO BUG — hackathon target
 *     The test "should give premium customers a 10% discount via checkout"
 *     is EXPECTED TO FAIL because checkout.js passes { type: 'premium' }
 *     while discountService checks customer.membership, not customer.type.
 *     This is the controlled, deterministic failure used for the live demo.
 */

const { getDiscount } = require('../src/discounts/discountService');
const { checkout } = require('../src/checkout/checkout');

// ---------------------------------------------------------------------------
// Unit tests for getDiscount() in isolation — these pass.
// ---------------------------------------------------------------------------

describe('getDiscount — unit', () => {
  test('returns 10% for a customer with membership === "premium"', () => {
    // Direct call with the CORRECT field name (membership) — works fine.
    expect(getDiscount({ membership: 'premium' })).toBe(0.10);
  });

  test('returns 0% for a customer with membership === "regular"', () => {
    expect(getDiscount({ membership: 'regular' })).toBe(0);
  });

  test('returns 0% when membership is undefined', () => {
    expect(getDiscount({})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration test via checkout — this FAILS because of the field-name bug.
// ---------------------------------------------------------------------------

describe('getDiscount — integration via checkout', () => {
  test('should give premium customers a 10% discount via checkout', () => {
    // user-001 has type: 'premium' in userService.
    // checkout.js passes { type: customer.type } to getDiscount(),
    // but getDiscount() checks customer.membership → always undefined → 0%.
    //
    // Expected (per requirements.md): discount = 100 * 0.10 = 10
    // Actual (due to bug):            discount = 0
    //
    // ⚠️  THIS TEST IS INTENTIONALLY FAILING — demo bug
    const result = checkout('user-001', [{ id: 'item-1', price: 100 }]);
    expect(result.discount).toBe(10); // ← FAILS: actual value is 0
  });

  test('regular customers should receive no discount via checkout', () => {
    // user-002 has type: 'regular' — no discount expected, matches actual behaviour.
    const result = checkout('user-002', [{ id: 'item-1', price: 100 }]);
    expect(result.discount).toBe(0);
  });
});
