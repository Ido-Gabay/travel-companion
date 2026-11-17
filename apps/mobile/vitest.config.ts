// CommonJS on purpose: this package is not "type": "module" (Expo default).
// Unit tests cover pure logic only (no React Native imports): i18n resources,
// date helpers, trip filtering, API error mapping, auth error mapping.
module.exports = {
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
};
