import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './registrarSW'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { iniciarAcento } from './lib/acento'

// Antes del primer render: el acento de este dispositivo, para que la app no
// arranque en morado y cambie de color cuando llega el perfil.
iniciarAcento()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
