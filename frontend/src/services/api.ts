import axios from 'axios'
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

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
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
