/**
 * checkout.js
 * Handles the checkout flow: looks up the customer, applies a discount,
 * and delegates order creation to orderService.
 *
 * ⚠️  INTENTIONAL DEMO BUG — hackathon target
 *     Line marked [BUG] below passes `customer.type` to discountService,
 *     but discountService.getDiscount() expects `customer.membership`.
 *     Because the field names differ, premium customers receive 0 % discount
 *     instead of the required 10 % (see requirements.md).
 *
 *     Fix: change `type: customer.type` → `membership: customer.type`
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
  //       detect premium status.  Using `type` means membership is undefined
  //       inside getDiscount(), so the 10 % branch is never reached.
  const discountRate = getDiscount({ type: customer.type }); // ← INTENTIONAL BUG

  const discount = subtotal * discountRate;
  const total = subtotal - discount;

  const order = createOrder({ userId, items, total, discount });

  return { orderId: order.id, total, discount };
}

module.exports = { checkout };
