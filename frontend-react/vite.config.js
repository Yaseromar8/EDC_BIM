import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Modulo ES: __dirname no existe y hay que derivarlo.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],

  // LAS PRIMITIVAS COMPARTIDAS VIVEN FUERA DE ESTA APP, Y REACT NO LAS ALCANZA.
  //
  // `design/ui/*.jsx` es fuente única igual que los tokens, pero un componente
  // NO es CSS: importa `react`, y sobre `design/` no hay node_modules, asi que
  // Rollup falla con «could not resolve react/jsx-runtime». Los tokens no
  // tuvieron este problema porque el CSS no importa nada.
  //
  // El alias apunta a la copia de React de ESTA app. `dedupe` evita la segunda
  // copia -- el mismo defecto que dejo el banco de pruebas sin montar en UX-01
  // («Invalid hook call»), y no conviene repetirlo.
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },


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
