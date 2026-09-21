// CONFIGURACION DEL BANCO DE PRUEBAS -- NO ES LA DE PRODUCCION.
//
// El banco (`probar-lector.html`) es una segunda entrada, y en el servidor de
// desarrollo se quedaba sin montar: vite descubria React tarde y la pagina
// terminaba con dos copias («Invalid hook call»). Normalmente lo tapa una
// recarga por HMR, pero aqui el websocket no conecta.
//
// Construir el banco COMO PRODUCCION lo evita entero: sin HMR, sin optimizador
// de dependencias y sin React Refresh. Ademas es el entorno que de verdad se
// quiere medir -- el mismo codigo que ve el usuario.
//
// Vive aparte a proposito: `vite.config.js` NO se toca, asi que no hay forma
// de que el banco se cuele en la construccion que se despliega.
//
// DOCS EN LOCAL CONTRA EL BACKEND REAL (`--mode docslocal`, 20-sep-2026). La
// app del portal con los cambios locales, con SU sesion y SUS laminas, como el
// visor en el 5181 (docs/visor/03 §9.6): se construye SOLA en `dist-local`,
// construida con VITE_BACKEND_URL y VITE_API_URL apuntando a su propio origen,
// y `vite preview` reenvia /api al backend que diga `dist-local/backend-remoto.txt`.
// La ruta del mosaico, que produccion aun no tiene, va al puente local
// (backend/herramientas/servidor_mosaicos_local.py --backend ..., puerto 5190),
// que pasa por la puerta de produccion. El banco (`dist-banco`) no se toca.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import base from './vite.config.js'

const carpeta = path.dirname(fileURLToPath(import.meta.url))

const backendRemoto = (salida) => {
  try {
    const url = fs.readFileSync(path.join(carpeta, salida, 'backend-remoto.txt'), 'utf8').trim()
    return /^https:\/\/[a-z0-9.-]+$/i.test(url) ? url : null
  } catch {
    return null
  }
}

export default (env) => {
  const c = typeof base === 'function' ? base(env) : { ...base }
  const docsLocal = env.mode === 'docslocal'
  const salida = docsLocal ? 'dist-local' : 'dist-banco'
  c.build = {
    ...(c.build || {}),
    outDir: salida,
    emptyOutDir: true,
    rollupOptions: {
      ...((c.build && c.build.rollupOptions) || {}),
      input: docsLocal ? { index: 'index.html' } : {
        index: 'index.html',
        banco: 'probar-lector.html',
        tabla: 'probar-tabla.html',
        busqueda: 'probar-busqueda.html',
        subida: 'probar-subida.html',
        cad: 'probar-cad.html',
        revisiones: 'probar-revisiones.html',
      },
    },
  }
  const destino = docsLocal ? backendRemoto(salida) : null
  if (destino) {
    const reenvio = { target: destino, changeOrigin: true, secure: true }
    c.preview = {
      ...(c.preview || {}),
      proxy: {
        // PRIMERO la del mosaico: el reenvio elige la primera que encaja.
        '/api/docs/mosaico': { target: 'http://127.0.0.1:5190' },
        '/api': reenvio,
        '/docs/uploads': reenvio,
        '/maps/uploads': reenvio,
      },
    }
    console.log(`[docs local] /api se reenvia a ${destino}; /api/docs/mosaico al puente local (5190)`)
  }
  return c
}
