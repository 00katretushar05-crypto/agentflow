/**
 * discountService.js
 * Calculates the discount rate for a given customer.
 *
 * Business rule (see requirements.md):
 *   - Premium customers  → 10% discount
 *   - Regular customers  → 0%  discount
 *
 * NOTE: This service checks customer.membership to determine premium status.
 * checkout.js currently passes customer.type instead of customer.membership,
 * which means premium customers are NEVER detected here and always receive 0%.
 *
 * ⚠️  INTENTIONAL DEMO BUG — hackathon target
 *     The field name mismatch (type vs membership) is deliberate so that
 *     the failing test in tests/discount.test.js can be demonstrated live.
 */

/**
 * Returns the discount multiplier for the given customer.
 * @param {{ membership?: string }} customer
 * @returns {number} Discount as a decimal (e.g. 0.10 = 10 %)
 */
function getDiscount(customer) {
  // BUG TARGET: checkout.js supplies customer.type, but we check customer.membership.
  // As a result, premium customers always fall through to the 0 % branch.
  if (customer.membership === 'premium') {
    return 0.10;
  }
  return 0;
}

module.exports = { getDiscount };
