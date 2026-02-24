import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@store': path.resolve(__dirname, './src/store'),
      '@lms-types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 5000,
    strictPort: true,
    proxy: {
      // Route each /api/* path to the correct microservice (dev only — Kong in production)
      '/api/admin':         { target: 'http://localhost:3008', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/auth':          { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/users':         { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/courses':       { target: 'http://localhost:3002', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/content':       { target: 'http://localhost:3003', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/quiz':          { target: 'http://localhost:3004', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/badges':        { target: 'http://localhost:3005', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/certificates':  { target: 'http://localhost:3006', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/notifications': { target: 'http://localhost:3007', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/tools':         { target: 'http://localhost:3009', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/enrollments':   { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/settings':      { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/chats':         { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/companion':     { target: 'http://localhost:3011', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
