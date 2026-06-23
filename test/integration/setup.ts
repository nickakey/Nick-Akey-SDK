// Loads a local .env into process.env before the live integration suite runs,
// so `LOTR_API_KEY=...` in .env "just works" with `npm run test:integration`.
// Uses Node's native loader (20.12+) — zero dependency. If there's no .env, the
// integration tests self-skip via their `skipIf(!LOTR_API_KEY)` guard.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present — fine; tests will skip without an API key.
  }
}
