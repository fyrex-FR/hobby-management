import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      // Équivalent dev de la Pages Function functions/cdn/[[path]].ts
      '/cdn': {
        target: process.env.VITE_R2_PUBLIC_URL || 'https://images.cardvaults.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cdn/, ''),
      },
    },
  },
})
