import { defineConfig } from 'vitest/config';

// Live integration tests that hit the real API. These require a LOTR_API_KEY and
// are opt-in via `npm run test:integration`. Each test self-skips when no key is
// present, so this config is safe to run in any environment.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    // Load .env into process.env so a local key is picked up automatically.
    setupFiles: ['./test/integration/setup.ts'],
    // Real network + a 100-req/10-min rate limit: keep it gentle and patient.
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
