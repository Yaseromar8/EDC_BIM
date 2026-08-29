import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App_Refactor.jsx'
import { ConfirmHost } from './utils/confirm.jsx'
import { IdoneidadHost } from './utils/idoneidad.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {/* Host único del diálogo de confirmación: disponible en TODAS las rutas
        (login, proyectos, archivos, enlace compartido). */}
    <ConfirmHost />
    {/* Y el de idoneidad: publicar exige decir para qué queda autorizado el
        documento, así que el diálogo tiene que existir dondequiera que se pueda
        publicar. */}
    <IdoneidadHost />
  </StrictMode>,
)

/**
 * GAP 07 · EL SERVICE WORKER.
 *
 * Se registra DESPUES de pintar, y si falla no se dice nada: su unico trabajo
 * es que la app abra sin cobertura. Un aviso de «no se pudo registrar el
 * service worker» no le sirve a nadie en una obra, y bloquear el arranque por
 * eso seria cambiar una degradacion por una caida.
 *
 * `sw-campo.js` NO cachea `/api/*`. El motivo esta escrito alli, y es el punto
 * que impide que una respuesta vieja se lea como el estado de la obra.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-campo.js').catch(() => {});
  });
}

/* global __ALEPHIA_BUILD__ */   // lo inyecta vite (`define`), no existe en el fuente
// El commit desplegado, a la vista: escribe `__ALEPHIA_BUILD` en la
// consola del navegador. El porque, en vite.config.js.
try { window.__ALEPHIA_BUILD = __ALEPHIA_BUILD__; } catch { /* sin define */ }
