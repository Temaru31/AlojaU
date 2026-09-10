// ProtectedAdminRoute - RBAC frontend para /admin/* (espejo de require_admin backend).
// Sin token -> /perfil (login). Con sesión no-ADMIN -> / (home).
// Token válido pero perfil sin cargar (red caída) -> aviso con reintentar (no redirige en bucle).
// Uso: <Route path="/admin/dashboard" element={<ProtectedAdminRoute><AdminDashboard /></ProtectedAdminRoute>} />
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedAdminRoute({ children }) {
  const { token, user, loading, refresh } = useAuth()

  if (loading) {
    return (
      <div className="container-main py-12">
        <div className="max-w-md mx-auto card p-8 animate-pulse space-y-3">
          <div className="h-5 bg-neutral-150 rounded w-1/2" />
          <div className="h-4 bg-neutral-150 rounded w-2/3" />
        </div>
      </div>
    )
  }

  if (!token) return <Navigate to="/perfil" replace />

  if (!user) {
    return (
      <div className="container-main py-16 text-center">
        <div className="card p-12 max-w-md mx-auto">
          <p className="font-medium text-neutral-700 mb-1">No pudimos verificar tu rol</p>
          <p className="text-xs text-neutral-400 mb-4">Revisa tu conexión e intenta de nuevo.</p>
          <button onClick={() => refresh?.()} className="btn-accent text-sm">Reintentar</button>
        </div>
      </div>
    )
  }

  if (user.rol !== 'ADMIN') return <Navigate to="/" replace />

  return children
}
