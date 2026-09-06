import { defineConfig } from 'vitest/config';
import path from 'path';

// Firestore RULES tests. Separate from the default config because they need
// a running emulator (`npm run test:rules` starts one), while everything in
// vitest.config.ts runs on plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.rules.test.ts'],
    // The emulator is a shared, stateful resource — clearFirestore() between
    // tests only works if nothing else is writing concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
