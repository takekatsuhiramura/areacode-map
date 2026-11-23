import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Set VITE_BASE (e.g. "/areacode-map/") when deploying under a sub-path.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.ts'] },
})
