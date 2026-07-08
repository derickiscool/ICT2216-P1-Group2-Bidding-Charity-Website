import axios from 'axios'
import DOMPurify from 'dompurify'
import type { ApiError } from '../types'

let csrfToken: string | null = sessionStorage.getItem('csrfToken')

export const setCsrfToken = (token: string | null) => {
  csrfToken = token
  if (token) sessionStorage.setItem('csrfToken', token)
  else sessionStorage.removeItem('csrfToken')
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

const SENSITIVE_KEYS = /password|token|otp|code|csrf|secret|authorization/i

const sanitizePayload = (value: unknown, key = ''): unknown => {
  if (typeof value === 'string') {
    if (SENSITIVE_KEYS.test(key)) return value
    return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  }
  if (Array.isArray(value)) return value.map(item => sanitizePayload(item, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizePayload(entryValue, entryKey),
      ]),
    )
  }
  return value
}

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }
  if (config.data && !(config.data instanceof FormData)) {
    config.data = sanitizePayload(config.data)
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    const headerToken = response.headers['x-csrf-token']
    if (headerToken) setCsrfToken(headerToken)
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      setCsrfToken(null)
    }
    const apiError: ApiError = {
      message: error.response?.data?.message || 'An unexpected error occurred',
      errors: error.response?.data?.errors,
    }
    return Promise.reject(apiError)
  }
)

export default api
