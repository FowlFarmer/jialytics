import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    // The first MongoDB run downloads a mongod binary.
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
