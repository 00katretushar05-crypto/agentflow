/**
 * orderService.js
 * Basic order creation logic.
 */

let nextId = 1000;

/**
 * Creates a new order record.
 * @param {{ userId: string, items: Array, total: number, discount: number }} params
 * @returns {{ id: string, userId: string, items: Array, total: number, discount: number }}
 */
function createOrder({ userId, items, total, discount }) {
  const order = {
    id: `ORD-${nextId++}`,
    userId,
    items,
    total,
    discount,
    createdAt: new Date().toISOString(),
  };
  return order;
}

module.exports = { createOrder };
