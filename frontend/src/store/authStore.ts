import { create } from 'zustand'
import type { User, UserRole } from '../types'
import api, { setCsrfToken } from '../services/api'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  requestLoginOtp: (email: string) => Promise<string>
  verifyLoginOtp: (email: string, otp: string) => Promise<void>
  logout: () => Promise<void>
  register: (data: RegisterData) => Promise<string>
  verifyRegistration: (email: string, otp: string) => Promise<void>
  forceChangePassword: (currentPassword: string, newPassword: string) => Promise<string>
  fetchMe: () => Promise<void>
  hasRole: (role: UserRole) => boolean
}

interface RegisterData {
  full_name: string
  email: string
  username?: string
  password: string
  roles: UserRole[]
}

interface LoginResponse {
  csrfToken: string
  user: User
}

// Admin accounts require a follow-up OTP after the password step; other
// roles complete immediately. `mfaRequired` distinguishes the two shapes
// the /auth/login endpoint can return.
interface LoginApiResponse {
  mfaRequired?: boolean
  message?: string
  csrfToken?: string
  user?: User
}

interface LoginResult {
  mfaRequired: boolean
  message?: string
}

interface RegisterResponse {
  message: string
}

interface ForceChangePasswordResponse {
  message: string
  user: User
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const res = await api.post<LoginApiResponse>('/auth/login', { email, password })
      if (res.data.mfaRequired) {
        set({ isLoading: false })
        return { mfaRequired: true, message: res.data.message }
      }
      setCsrfToken(res.data.csrfToken!)
      set({ user: res.data.user!, isAuthenticated: true, isLoading: false })
      return { mfaRequired: false }
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  requestLoginOtp: async (email) => {
    set({ isLoading: true })
    try {
      const res = await api.post<{ message: string }>('/auth/login/passwordless/request', { email })
      set({ isLoading: false })
      return res.data.message
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  verifyLoginOtp: async (email, otp) => {
    set({ isLoading: true })
    try {
      const res = await api.post<LoginResponse>('/auth/login/passwordless/verify', { email, otp })
      setCsrfToken(res.data.csrfToken)
      set({ user: res.data.user, isAuthenticated: true, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setCsrfToken(null)
      set({ user: null, isAuthenticated: false })
    }
  },

  register: async (data) => {
    set({ isLoading: true })
    try {
      const res = await api.post<RegisterResponse>('/auth/register', data)
      set({ isLoading: false })
      return res.data.message
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  verifyRegistration: async (email, otp) => {
    set({ isLoading: true })
    try {
      await api.post('/auth/register/verify', { email, otp })
      set({ isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },


  forceChangePassword: async (currentPassword, newPassword) => {
    set({ isLoading: true })
    try {
      const res = await api.post<ForceChangePasswordResponse>('/auth/force-change-password', { currentPassword, newPassword })
      set({ user: res.data.user, isAuthenticated: true, isLoading: false })
      return res.data.message
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  fetchMe: async () => {
    try {
      const res = await api.get<User>('/auth/me')
      set({ user: res.data, isAuthenticated: true, isLoading: false })
    } catch {
      setCsrfToken(null)
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  hasRole: (role) => {
    const { user } = get()
    return user?.roles?.includes(role) ?? false
  },
}))