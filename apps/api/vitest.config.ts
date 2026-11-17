import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles Nest's legacy decorators (and their metadata) the same way tsc does.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
