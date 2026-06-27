import axios from 'axios'
import type { ApiError } from '../types'

const api = axios.create({
  baseURL: '/api',          // Vite proxies /api → http://localhost:5000
  withCredentials: true,    // Send cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor: attach JWT from localStorage if it exists ──────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: handle 401 globally ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    const apiError: ApiError = {
      message: error.response?.data?.message || 'An unexpected error occurred',
      errors: error.response?.data?.errors,
    }
    return Promise.reject(apiError)
  }
)

export default api
