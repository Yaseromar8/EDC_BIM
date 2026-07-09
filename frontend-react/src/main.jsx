import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// --- TEMP: sello de LIVE-RELOAD (quitar cuando terminemos de iterar el AR) ---
// Si ves este sello en la tablet, la app carga desde el dev server = live-reload OK.
;(() => {
  const ID = '__live_badge__'
  if (typeof document === 'undefined' || document.getElementById(ID)) return
  const b = document.createElement('div')
  b.id = ID
  b.textContent = '🟢 LIVE-RELOAD v2 ✅'
  b.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;background:#16a34a;color:#fff;font:bold 12px monospace;padding:3px 10px;border-radius:0 0 8px 8px;pointer-events:none'
  document.body.appendChild(b)
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
