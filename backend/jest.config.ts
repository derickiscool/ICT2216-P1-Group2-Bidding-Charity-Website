import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest to transform TypeScript files
  preset: 'ts-jest',

  // Node environment — no browser APIs needed
  testEnvironment: 'node',

  // Look for tests inside src/ only
  roots: ['<rootDir>/src'],

  // Match files named *.test.ts inside __tests__ directories
  testMatch: ['**/__tests__/**/*.test.ts'],

  // File extensions Jest can resolve
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Collect coverage from source files (not test files, not type declarations)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Show individual test names as they run
  verbose: true,

  // Automatically clear mocks between tests
  clearMocks: true,
};

export default config;
