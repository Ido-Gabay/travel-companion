// Screen tests (src/**/*.test.tsx) run on jest-expo, which renders React Native
// components. Logic tests (src/**/*.spec.ts) stay on Vitest (vitest.config.ts).
// CommonJS on purpose: this package is not "type": "module" (Expo default).
module.exports = {
  preset: 'jest-expo/ios',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  clearMocks: true,
};
