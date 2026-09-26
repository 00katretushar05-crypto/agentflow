import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000, // real Jest execution can take 10-20s per call
    hookTimeout: 30000,
    fileParallelism: false, // test files share ecommerce-demo/checkout.js on disk — must run sequentially to avoid race conditions
  },
});