// CommonJS on purpose: this package is not "type": "module" (Expo default).
// Logic tests (src/**/*.spec.ts) cover pure code only (no React Native imports).
// Screen tests (src/**/*.test.tsx) run on Jest (jest.config.js). See docs/TESTING.md.
module.exports = {
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
};
