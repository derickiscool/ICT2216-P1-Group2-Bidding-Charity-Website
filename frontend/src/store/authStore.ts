import { create } from 'zustand'
import type { User, UserRole } from '../types'
import api from '../services/api'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (data: RegisterData) => Promise<void>
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
  token: string
  user: User
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password })
      const { token, user } = res.data
      localStorage.setItem('token', token)
      set({ user, token, isAuthenticated: true, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err   
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      localStorage.removeItem('token')
      set({ user: null, token: null, isAuthenticated: false })
    }
  },

  register: async (data) => {
    set({ isLoading: true })
    try {
      await api.post('/auth/register', data)
      set({ isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  fetchMe: async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await api.get<User>('/auth/me')
      set({ user: res.data, isAuthenticated: true })
    } catch {
      localStorage.removeItem('token')
      set({ user: null, token: null, isAuthenticated: false })
    }
  },

  hasRole: (role) => {
    const { user } = get()
    return user?.roles?.includes(role) ?? false
  },
}))
