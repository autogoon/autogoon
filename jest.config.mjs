import nextJest from "next/jest.js";

// next/jest wires up the SWC transform and the @/* path alias from tsconfig.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  // Unit tests cover pure logic (engines, device client) — no DOM needed.
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
};

export default createJestConfig(config);
