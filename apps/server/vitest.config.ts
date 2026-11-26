import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    ...(process.env.GITHUB_ACTIONS === 'true' ? { testTimeout: 30_000 } : {}),
  },
});
