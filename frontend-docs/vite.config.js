/* global process */   // este fichero corre en Node: `process` existe aqui
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// LOS RECURSOS DE pdf.js, AL SITIO DONDE SE SIRVEN.
//
// La biblioteca trae descompresores en WebAssembly, tablas de codificacion y
// las tipografias estandar del formato, pero NO los publica sola. Sin ellos
// cae a sus caminos de reserva --el descompresor en JavaScript, mucho mas
// lento-- y eso ocurre dentro del dibujado del plano.
//
// Se copian aqui, al arrancar, y NO se versionan (ver .gitignore): vienen del
// paquete instalado, asi que al subir de version se copian los nuevos solos.
// No pesan en el arranque: el navegador solo pide el que un documento
// necesita.
for (const carpeta of ['wasm', 'cmaps', 'standard_fonts']) {
  const origen = path.resolve('node_modules/pdfjs-dist', carpeta)
  const destino = path.resolve('public/pdfjs', carpeta)
  if (fs.existsSync(origen)) fs.cpSync(origen, destino, { recursive: true })
}

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // QUE COMMIT ESTA DESPLEGADO, legible desde fuera.
  //
  // Durante toda una sesion de correcciones se perdio muchisimo tiempo en la
  // misma duda: el dueño probaba, decia «sigue igual», y no habia forma barata
  // de saber si estaba viendo el arreglo o la version anterior -- entre el
  // push y el despliegue pasan minutos, y por delante hay una cache de borde
  // de 5 minutos. Varias veces se diagnostico sobre codigo viejo.
  //
  // Render expone el commit en RENDER_GIT_COMMIT. Se hornea en el bundle y se
  // publica en `window.__ALEPHIA_BUILD`, asi que basta con mirarlo en la
  // consola -- o descargar el bundle y buscarlo -- para saber EXACTAMENTE que
  // esta corriendo. Cuesta doce bytes.
  define: {
    __ALEPHIA_BUILD__: JSON.stringify(
      (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7)),
  },

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
