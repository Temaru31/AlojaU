import { Link } from 'react-router-dom'
import { inicialesDe } from '../../contexts/AuthContext'
import { etiquetaRol } from '../../utils/rolUsuario'

const TAMANOS = {
  sm: { caja: 'w-8 h-8 text-xs', foto: 'w-8 h-8 border-neutral-200' },
  md: { caja: 'w-10 h-10 text-xs', foto: 'w-10 h-10 border-navy-100' },
  lg: { caja: 'w-11 h-11 text-sm', foto: 'w-11 h-11 border-navy-100' },
}

/** Iniciales con la foto encima (si carga); decorativo (aria-hidden). */
export function AvatarUsuario({ user, tamano }) {
  const t = TAMANOS[tamano]
  return (
    <span aria-hidden="true" className={`relative ${t.caja} rounded-full bg-navy-800 text-white font-bold flex items-center justify-center shrink-0`}>
      {inicialesDe(user)}
      {user?.foto_perfil_url && (
        <img src={user.foto_perfil_url} alt="" referrerPolicy="no-referrer" className={`absolute inset-0 ${t.foto} rounded-full object-cover border bg-navy-800`} onError={(e) => { e.currentTarget.style.display = 'none' }} />
      )}
    </span>
  )
}

/** Tarjeta de sesión (avatar + nombre + correo + rol) que lleva a /perfil. */
export function TarjetaUsuario({ user, displayName, onClick, tamano, className, role }) {
  return (
    <Link
      to="/perfil"
      onClick={onClick}
      role={role}
      aria-label="Abrir mi perfil"
      className={`flex items-center gap-3 px-3 py-3 mb-1 rounded-xl bg-navy-50 border border-navy-100 active:bg-navy-100 transition ${className || ''}`}
    >
      <AvatarUsuario user={user} tamano={tamano} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-navy-900 truncate">{displayName}</span>
        <span className="block text-[11px] text-neutral-500 truncate">{user?.email || ''}</span>
        <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-px rounded bg-white text-navy-700 border border-navy-100">
          {etiquetaRol(user?.rol)}
        </span>
      </span>
      <span aria-hidden="true" className="text-neutral-400">›</span>
    </Link>
  )
}
