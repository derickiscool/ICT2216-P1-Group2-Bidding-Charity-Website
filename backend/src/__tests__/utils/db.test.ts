/**
 * DB Utility Tests
 *
 * Tests the database connection logic by mocking the 'pg' module.
 * This avoids needing a real database during unit testing.
 */

// Import Jest globals explicitly (for TypeScript compatibility)
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock 'pg' before importing the module under test
jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mockPool) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('../../utils/db');

describe('Database Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('testConnection()', () => {
    it('should return success when query succeeds', async () => {
      // Arrange — make the mock query resolve successfully
      const mockPool = Pool();
      mockPool.query.mockResolvedValueOnce({ rows: [{ now: new Date() }] });

      // Act
      const result = await db.testConnection();

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Database connected successfully');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should return failure when query throws', async () => {
      // Arrange — make the mock query reject
      const mockPool = Pool();
      const error = new Error('Connection refused');
      mockPool.query.mockRejectedValueOnce(error);

      // Act
      const result = await db.testConnection();

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Database connection failed');
      expect(result.message).toContain('Connection refused');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange — simulate a thrown string (edge case)
      const mockPool = Pool();
      mockPool.query.mockRejectedValueOnce('Something went wrong');

      // Act
      const result = await db.testConnection();

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Database connection failed: Unknown error');
    });
  });

  describe('query()', () => {
    it('should execute a query and return results', async () => {
      // Arrange
      const mockPool = Pool();
      const expectedRows = [{ id: 1, name: 'test' }];
      mockPool.query.mockResolvedValueOnce({ rows: expectedRows });

      // Act
      const result = await db.query('SELECT * FROM users WHERE id = $1', [1]);

      // Assert
      expect(result.rows).toEqual(expectedRows);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    });
  });
});
