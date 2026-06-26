import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import netlifyIdentity from 'netlify-identity-widget'
import './index.css'
import App from './App.tsx'

// Skip Identity widget when using Cloudflare Access auth
if (import.meta.env.VITE_AUTH_PROVIDER !== 'cloudflare') {
  netlifyIdentity.init()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
