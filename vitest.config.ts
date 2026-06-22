import { defineConfig } from 'vitest/config';

// Unit tests only. The live integration suite (test/integration) is excluded here
// and run separately via `npm run test:integration`, so the default `npm test`
// never needs a network connection or an API key.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
});
