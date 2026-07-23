import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Producción: fuera los console.log (warn/error se conservan para
  // diagnóstico). Cada log construye strings y toca el hilo principal.
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.debug'], drop: ['debugger'] }
    : undefined,

  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Librerías pesadas en su propio chunk: xlsx solo se descarga cuando
        // el usuario importa/exporta Excel, no al entrar a la app.
        manualChunks: {
          vendor: ['react', 'react-dom'],
          xlsx: ['xlsx'],
        },
      },
    },
  },

  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
}))
