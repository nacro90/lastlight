import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Cekirdek saf fonksiyonlar; DOM'a ihtiyac yok.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
