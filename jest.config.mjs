import nextJest from 'next/jest.js';

// next/jest wires up the SWC transform and the @/* path alias from tsconfig.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  // The default, because most unit tests cover pure logic (engines, device
  // client, pack parsing) and node is the faster environment for it. A test
  // that renders a component or a hook opts out per file with a
  // `@jest-environment jsdom` docblock.
  testEnvironment: 'node',
  // Colocated with what they cover: app code under src/, and the modules the
  // authoring scripts import from scripts/lib/.
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/scripts/lib/**/*.test.ts',
  ],
};

export default createJestConfig(config);
