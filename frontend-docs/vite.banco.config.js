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
import base from './vite.config.js'

export default (env) => {
  const c = typeof base === 'function' ? base(env) : { ...base }
  c.build = {
    ...(c.build || {}),
    outDir: 'dist-banco',
    emptyOutDir: true,
    rollupOptions: {
      ...((c.build && c.build.rollupOptions) || {}),
      input: {
        index: 'index.html',
        banco: 'probar-lector.html',
      },
    },
  }
  return c
}
