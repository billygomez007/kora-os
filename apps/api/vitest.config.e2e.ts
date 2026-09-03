import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every e2e file boots a real Nest application (sometimes several,
    // one per test) against the same local PostgreSQL container. Running
    // files in parallel serializes on that one shared resource anyway and
    // was observed to intermittently exceed the default 5s test timeout
    // under that contention — serializing files trades a little wall time
    // for reliability, and a longer timeout covers the remaining slower
    // multi-request flows (e.g. staff invitation creation + acceptance).
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
