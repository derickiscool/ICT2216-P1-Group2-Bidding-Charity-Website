import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  test: {
    // Simulate browser-like environment
    environment: 'happy-dom',

    // Use threads pool for better ESM compatibility with jsdom
    pool: 'threads',

    // Make testing-library matchers (toBeInTheDocument, etc.) available globally
    globals: true,

    // Run setup file before each test file
    setupFiles: ['./src/__tests__/setup.ts'],

    // Include CSS imports in tests (Tailwind classes etc.)
    css: true,

    // Where coverage output goes
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/__tests__/**'],
    },
  },
});
