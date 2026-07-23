import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],

  // FLUIDEZ EN PRODUCCIÓN: la app emite cientos de console.log por sesión
  // (carga de modelos, filtros, rosetta…). Cada uno construye strings y toca
  // el hilo principal. En el BUILD se eliminan log/debug (warn/error se
  // conservan para diagnóstico). En dev quedan todos.
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.debug'], drop: ['debugger'] }
    : undefined,

  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Separar librerías pesadas: el navegador parsea menos JS para pintar
        // la primera pantalla (xlsx/jspdf se descargan solo al usarse).
        manualChunks: {
          vendor: ['react', 'react-dom'],
          xlsx: ['xlsx'],
          pdf: ['jspdf'],
        },
      },
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      '/maps/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      '/docs/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
}))
