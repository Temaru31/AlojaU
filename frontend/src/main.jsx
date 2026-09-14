import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import './index.css'
import App from './App.jsx'

// Configuración de conexión con Keycloak
const oidcConfig = {
  authority: "http://localhost:8080/realms/AlojaU",
  client_id: "ClientAlojaU",
  redirect_uri: "http://localhost:5173",
  response_type: "code",
  scope: "openid profile email"
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <App />
    </AuthProvider>
  </StrictMode>
)