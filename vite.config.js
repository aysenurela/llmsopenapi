import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        features: resolve(import.meta.dirname, 'features.html'),
        signup: resolve(import.meta.dirname, 'signup.html'),
      },
    },
  },
})
