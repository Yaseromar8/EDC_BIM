/* eslint-disable no-restricted-globals */
/**
 * GAP 07 · EL SERVICE WORKER — que la app ABRA sin cobertura.
 *
 * SU ÚNICO TRABAJO ES QUE LA APLICACIÓN ARRANQUE
 * -----------------------------------------------
 * Cachea el armazón: el HTML, el JS, el CSS, los iconos. Nada más. Los datos
 * viven en IndexedDB, que es donde se puede consultar, ordenar y —sobre todo—
 * saber CUÁNDO se descargaron.
 *
 * NUNCA SE CACHEA `/api/*` EN BLOQUE
 * -----------------------------------
 * Y este es el punto que más importa de todo el fichero.
 *
 * Un `Cache-First` genérico sobre `/api/*` haría que la app respondiera con
 * datos viejos sin decirlo. Alguien vería un issue como ABIERTO cuando ya está
 * cerrado, o —peor— un `POST` cacheado devolvería un 200 de otro momento y el
 * móvil daría por hecho un acto que nunca ocurrió. En un CDE eso no es un fallo
 * de rendimiento: es un acta que dice algo falso.
 *
 * Así que las peticiones a la API pasan DERECHAS a la red. Si no hay red,
 * fallan, y la aplicación lo sabe y usa lo que tiene en IndexedDB — que es
 * distinto, porque eso viene con su fecha y la pantalla la enseña.
 *
 * Y `/api/sync` en particular JAMÁS se toca. Una respuesta de sincronización
 * servida desde caché le diría al móvil que su cola subió cuando no subió.
 */

const CACHE = 'alephia-campo-v1';

// El armazón mínimo. Lo demás entra solo cuando se pide, y solo si es nuestro.
const ARMAZON = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/site.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // `addAll` es todo-o-nada: si un icono falta, la instalación entera se
      // cae y el usuario se queda sin service worker. Uno a uno, lo que se
      // pueda guardar se guarda.
      .then(c => Promise.all(ARMAZON.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function esNuestro(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;              // nada que no sea GET, nunca

  const url = new URL(req.url);
  if (!esNuestro(url)) return;                   // no tocamos otros orígenes
  if (url.pathname.startsWith('/api/')) return;  // LA API VA A LA RED, SIEMPRE

  // NAVEGACIÓN: red primero, y el index cacheado como red de seguridad. Así la
  // app abre sin cobertura, que es todo lo que se le pide a esto.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put('/index.html', copia)).catch(() => {});
          return r;
        })
        .catch(() => caches.match('/index.html').then(r => r || Response.error()))
    );
    return;
  }

  // ESTÁTICOS: caché primero. Los assets de Vite llevan hash en el nombre, así
  // que un fichero cacheado nunca es «la versión vieja de otro» — al desplegar
  // cambia el nombre y se pide de nuevo.
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(r => {
        if (r && r.ok && r.type === 'basic') {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return r;
      });
    })
  );
});

/**
 * Background Sync, si el navegador la tiene. Aquí no se sincroniza nada: se
 * despierta a la app, que es la que tiene la sesión y la cola.
 *
 * Es una MEJORA. iOS no la implementa, y el producto tiene que funcionar igual
 * allí — por eso el sincronizador engancha `online`, `visibilitychange` y el
 * botón, que existen en todas partes.
 */
self.addEventListener('sync', (e) => {
  if (e.tag !== 'alephia-campo') return;
  e.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true })
      .then(cs => cs.forEach(c => c.postMessage({ tipo: 'sincroniza-si-puedes' })))
  );
});
