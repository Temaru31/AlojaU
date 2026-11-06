import { Link } from 'react-router-dom'
import { Heart, LogOut, Megaphone, ShieldCheck, User, Users } from 'lucide-react'
import { AvatarUsuario, TarjetaUsuario } from './TarjetaUsuario'
import { esAdmin } from '../../utils/rolUsuario'

const ITEM = 'flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] text-sm font-medium rounded-xl text-neutral-600 hover:bg-neutral-100 active:bg-neutral-100 transition'

/** Dropdown de cuenta (escritorio): botón con avatar + menú con backdrop. */
export default function MenuUsuario({ user, displayName, abierto, onAlternar, onCerrar, onLogout, muestraMisPubs, favCount }) {
  return (
    <div className="relative">
      <button type="button"
        onClick={onAlternar}
        aria-label="Menú de usuario"
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-neutral-200 hover:border-navy-300 hover:bg-neutral-50 transition"
      >
        <AvatarUsuario user={user} tamano="sm" />
        <span className="text-sm font-medium text-navy-800 max-w-28 truncate">{displayName}</span>
        <span aria-hidden="true" className={`text-[10px] text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {abierto && (
        <>
          <div aria-hidden="true" onClick={onCerrar} className="fixed inset-0 z-40" />
          <div role="menu" aria-label="Cuenta" className="absolute right-0 top-11 w-64 rounded-2xl border border-neutral-150 shadow-xl bg-white p-2 z-50 animar-subir">
            {/* Tarjeta de usuario (mismo lenguaje que el drawer móvil). */}
            <TarjetaUsuario user={user} displayName={displayName} onClick={onCerrar} tamano="md" role="menuitem" className="hover:bg-navy-100" />
            <Link to="/perfil" onClick={onCerrar} role="menuitem" className={ITEM}>
              <User aria-hidden="true" className="w-5 h-5" /> Mi Perfil
            </Link>
            <Link to="/roomies" onClick={onCerrar} role="menuitem" className={ITEM}>
              <Users aria-hidden="true" className="w-5 h-5" /> Match Roomies
            </Link>
            {muestraMisPubs && (
              <Link to="/mis-publicaciones" onClick={onCerrar} role="menuitem" className={ITEM}>
                <Megaphone aria-hidden="true" className="w-5 h-5" /> Mis Publicaciones
              </Link>
            )}
            <Link to="/favoritos" onClick={onCerrar} role="menuitem" className="flex items-center justify-between gap-2 px-3 py-2.5 min-h-[44px] text-sm font-medium rounded-xl text-neutral-600 hover:bg-neutral-100 active:bg-neutral-100 transition">
              <span className="inline-flex items-center gap-2"><Heart aria-hidden="true" className="w-5 h-5" /> Favoritos</span>
              {favCount > 0 && <span className="bg-red-100 text-red-700 text-[11px] font-bold px-1.5 py-0.5 rounded-full" aria-label={`${favCount} favoritos`}>{favCount}</span>}
            </Link>
            {esAdmin(user) && (
              <Link to="/admin/dashboard" onClick={onCerrar} role="menuitem" className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] text-sm font-bold rounded-xl text-navy-800 bg-navy-50 hover:bg-navy-100 active:bg-navy-100 transition">
                <ShieldCheck aria-hidden="true" className="w-5 h-5" /> Panel Admin
              </Link>
            )}
            <button type="button"
              onClick={() => { onLogout(); onCerrar() }}
              role="menuitem"
              className="flex items-center justify-center gap-2 w-full px-3 py-2.5 min-h-[44px] mt-1 text-sm font-bold rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
            >
              <LogOut aria-hidden="true" className="w-5 h-5" /> Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  )
}
