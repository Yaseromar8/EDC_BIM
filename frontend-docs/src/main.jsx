import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App_Refactor.jsx'
import { ConfirmHost } from './utils/confirm.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {/* Host único del diálogo de confirmación: disponible en TODAS las rutas
        (login, proyectos, archivos, enlace compartido). */}
    <ConfirmHost />
  </StrictMode>,
)
