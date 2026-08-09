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
