import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles Nest's legacy decorators (and their metadata) the same way tsc does.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // D1 database tests run real migrations in in-memory Postgres (PGlite): a
    // worker peaks around 1.6 GB, so cap parallelism to stay within small
    // machines and CI runners.
    maxWorkers: 2,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
