import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { frontendDevSecurityHeaders, frontendSecurityHeaders } from './src/config/securityHeaders'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: frontendDevSecurityHeaders,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      // NFR02: Proxy Socket.IO WebSocket connections to the backend so that
      // real-time bid updates work across tabs without requiring VITE_WS_URL.
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  preview: {
    headers: frontendSecurityHeaders,
  }
})
