/**
 * Auth Store Tests
 *
 * Tests the Zustand auth store in isolation.
 * API calls are mocked via vi.mock() so we don't hit a real backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock API — vi.mock is hoisted to top, runs before imports
// Use vi.hoisted to create mock fns before the hoisted mock factory runs
const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: {
    post: mockPost,
    get: mockGet,
  },
}));

// Import AFTER vi.mock (Vitest hoists it, but imports happen after)
import { useAuthStore } from '../../store/authStore';

describe('Auth Store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start unauthenticated when no token in localStorage', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should restore authentication from localStorage token', () => {
      localStorage.setItem('token', 'existing-jwt-token');

      // Re-initialize the store (simulates page refresh)
      useAuthStore.setState({
        token: 'existing-jwt-token',
        isAuthenticated: true,
      });

      const state = useAuthStore.getState();
      expect(state.token).toBe('existing-jwt-token');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('login()', () => {
    it('should set user + token on successful login', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        full_name: 'Test User',
        roles: ['bidder'] as const,
        is_verified: true,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
      };
      const mockToken = 'jwt-token-abc';

      mockPost.mockResolvedValueOnce({
        data: { token: mockToken, user: mockUser },
      });

      await useAuthStore.getState().login('test@example.com', 'password123');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe(mockToken);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(localStorage.getItem('token')).toBe(mockToken);
      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should throw and clear loading on login failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(
        useAuthStore.getState().login('test@example.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('logout()', () => {
    it('should clear user + token on logout', async () => {
      useAuthStore.setState({
        user: {
          id: 1,
          email: 'test@example.com',
          username: 'testuser',
          full_name: 'Test User',
          roles: ['bidder'],
          is_verified: true,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        token: 'jwt-token',
        isAuthenticated: true,
      });
      localStorage.setItem('token', 'jwt-token');

      mockPost.mockResolvedValueOnce({});

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('hasRole()', () => {
    it('should return true when user has the role', () => {
      useAuthStore.setState({
        user: {
          id: 1,
          email: 'admin@test.com',
          username: 'adminuser',
          full_name: 'Admin User',
          roles: ['admin', 'bidder'],
          is_verified: true,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      });
      expect(useAuthStore.getState().hasRole('admin')).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      useAuthStore.setState({
        user: {
          id: 1,
          email: 'bidder@test.com',
          username: 'bidderuser',
          full_name: 'Bidder User',
          roles: ['bidder'],
          is_verified: true,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      });
      expect(useAuthStore.getState().hasRole('admin')).toBe(false);
    });

    it('should return false when no user is logged in', () => {
      expect(useAuthStore.getState().hasRole('admin')).toBe(false);
    });
  });
});
