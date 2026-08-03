import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These tests are pure-unit: no DB, no network, no LLM providers.
    // Integration tests that need Postgres will get their own project later.
    testTimeout: 10_000,
  },
});
