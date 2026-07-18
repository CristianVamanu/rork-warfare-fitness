import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests only — pure functions with no Firebase/network dependency
// (tdee.ts calorie math, utils.ts helpers, etc). Anything that touches
// Firestore/Auth/Stripe needs real integration/e2e coverage, which isn't
// set up here; this is a starting point, not full coverage.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
