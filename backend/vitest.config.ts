import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000, // real Jest execution can take 10-20s per call
    hookTimeout: 30000,
  },
});