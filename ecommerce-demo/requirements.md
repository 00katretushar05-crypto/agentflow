# Requirements

## Discount Policy

- **Premium customers** receive a **10% discount** on their order subtotal.
- **Regular customers** receive **no discount** (0%).

Customer tier is stored on the user record and must be carried through to
the discount calculation at checkout.

## Acceptance Criteria

| Scenario | Customer type | Subtotal | Expected discount | Expected total |
|---|---|---|---|---|
| Premium checkout | premium | $100.00 | $10.00 (10%) | $90.00 |
| Regular checkout | regular | $100.00 | $0.00  (0%)  | $100.00 |

## Known Issue (Hackathon Demo Bug)

> ⚠️ **This bug is intentional and exists for demonstration purposes.**

`checkout.js` reads `customer.type` to identify the customer tier and passes
it to `discountService.getDiscount()` as `{ type: customer.type }`.

However, `discountService.getDiscount()` checks the field `customer.membership`,
not `customer.type`. Because the field names differ, `membership` is always
`undefined` inside `getDiscount()`, the premium branch is never entered, and
premium customers receive **0% discount** instead of the required 10%.

### How to reproduce

```
npm test
```

The test `"should give premium customers a 10% discount via checkout"` in
`tests/discount.test.js` will fail with:

```
Expected: 10
Received: 0
```

### Fix

In `src/checkout/checkout.js`, change:

```js
const discountRate = getDiscount({ type: customer.type });
```

to:

```js
const discountRate = getDiscount({ membership: customer.type });
```
