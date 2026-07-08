/**
 * Auth Store Tests
 *
 * Tests the Zustand auth store in isolation.
 * API calls are mocked via vi.mock() so we don't hit a real backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock API — vi.mock is hoisted to top, runs before imports
// Use vi.hoisted to create mock fns before the hoisted mock factory runs
const { mockPost, mockGet, mockSetCsrfToken } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockSetCsrfToken: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: {
    post: mockPost,
    get: mockGet,
  },
  setCsrfToken: mockSetCsrfToken,
}));

// Import AFTER vi.mock (Vitest hoists it, but imports happen after)
import { useAuthStore } from '../../store/authStore';

describe('Auth Store', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start unauthenticated without client-readable session tokens', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('login()', () => {
    it('should set user and CSRF token on successful cookie-session login', async () => {
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
      const mockCsrfToken = 'csrf-token-abc';

      mockPost.mockResolvedValueOnce({
        data: { csrfToken: mockCsrfToken, user: mockUser },
      });

      const result = await useAuthStore.getState().login('test@example.com', 'password123');

      const state = useAuthStore.getState();
      expect(result).toEqual({ mfaRequired: false });
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
      expect(mockSetCsrfToken).toHaveBeenCalledWith(mockCsrfToken);
      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should report mfaRequired without authenticating when the account needs a follow-up OTP (admin)', async () => {
      mockPost.mockResolvedValueOnce({
        data: { mfaRequired: true, message: 'Enter the 6-digit code sent to your email.' },
      });

      const result = await useAuthStore.getState().login('admin@example.com', 'password123');

      const state = useAuthStore.getState();
      expect(result).toEqual({ mfaRequired: true, message: 'Enter the 6-digit code sent to your email.' });
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(mockSetCsrfToken).not.toHaveBeenCalled();
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
        isAuthenticated: true,
      });

      mockPost.mockResolvedValueOnce({});

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(mockSetCsrfToken).toHaveBeenCalledWith(null);
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
