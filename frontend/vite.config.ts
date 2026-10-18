/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET = process.env.RC_API_URL ?? 'http://127.0.0.1:7413'

// Mount path of the built frontend: "/" (default) or a sub path such as "/cyr/".
const BASE = (process.env.VITE_BASE_PATH ?? '/').replace(/\/?$/, '/')

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022' }, // top-level await (runtime config before the first render)
  server: {
    port: 5173,
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
