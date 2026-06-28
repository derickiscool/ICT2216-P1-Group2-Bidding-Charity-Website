import { create } from 'zustand'
import type { User, UserRole } from '../types'
import api, { setCsrfToken } from '../services/api'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (data: RegisterData) => Promise<string>
  verifyRegistration: (email: string, otp: string) => Promise<void>
  fetchMe: () => Promise<void>
  hasRole: (role: UserRole) => boolean
}

interface RegisterData {
  full_name: string
  email: string
  username: string
  password: string
  roles: UserRole[]
}

interface LoginResponse {
  csrfToken: string
  user: User
}

interface RegisterResponse {
  message: string
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password })
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

  fetchMe: async () => {
    try {
      const res = await api.get<User>('/auth/me')
      set({ user: res.data, isAuthenticated: true })
    } catch {
      setCsrfToken(null)
      set({ user: null, isAuthenticated: false })
    }
  },

  hasRole: (role) => {
    const { user } = get()
    return user?.roles?.includes(role) ?? false
  },
}))
