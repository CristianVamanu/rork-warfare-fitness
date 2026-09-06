import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit + handler tests. Pure functions (tdee/utils/programs/xp/membership)
// plus the Stripe webhook, whose Stripe/Admin-SDK/mailer dependencies are
// mocked so its decision logic can be exercised directly.
//
// Firestore RULES are covered separately against the emulator — see
// firestore.rules.test.ts and `npm run test:rules`, which is excluded here
// because it needs a running emulator rather than just Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Rules tests need the emulator — run via `npm run test:rules`.
    exclude: ['**/node_modules/**', 'src/**/*.rules.test.ts'],
    // Route handlers import next/server, which needs the Web Request/Response
    // globals Node 18+ provides natively.
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
