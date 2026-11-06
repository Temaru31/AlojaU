import { Link, useLocation } from 'react-router-dom'
import { Bell, Heart, LogOut, Megaphone, Scale, Search, ShieldCheck, Users } from 'lucide-react'
import { TarjetaUsuario } from './TarjetaUsuario'
import { esAdmin } from '../../utils/rolUsuario'

const linkCls = (active) =>
  `flex items-center justify-between px-3 py-2.5 min-h-[44px] text-sm font-medium rounded-md transition-colors duration-200 ${active ? 'text-navy-800 bg-navy-50' : 'text-neutral-600 hover:bg-neutral-100'
  }`

function EnlaceMovil({ to, Icono, texto, onCerrar, children }) {
  const { pathname } = useLocation()
  const activo = pathname === to
  return (
    <Link to={to} onClick={onCerrar} aria-current={activo ? 'page' : undefined} className={linkCls(activo)}>
      <span className="inline-flex items-center gap-2"><Icono aria-hidden="true" className="w-5 h-5" /> {texto}</span>
      {children}
    </Link>
  )
}

/** BUG-12: dropdown flotante (no empuja contenido, no obliga scroll) + backdrop. */
export default function MenuMovil({
  sesionActiva, user, displayName, muestraMisPubs, favCount, compCount, compMax, onCerrar, onLogout,
}) {
  const { pathname } = useLocation()
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onCerrar}
        className="md:hidden fixed inset-0 bg-navy-900/30 z-40 transition-opacity duration-200"
      />
      <div
        id="mobile-menu"
        className="md:hidden absolute inset-x-3 top-[68px] rounded-xl border border-neutral-150 shadow-xl bg-white p-2 z-50 transition-all duration-200"
      >
        {/* R5 tarjeta destacada de sesión: avatar+nombre+correo+rol → /perfil */}
        {sesionActiva ? (
          <TarjetaUsuario user={user} displayName={displayName} onClick={onCerrar} tamano="lg" />
        ) : (
          <Link
            to="/perfil"
            onClick={onCerrar}
            className="block w-full px-3 py-3 mb-1 text-sm font-bold text-center text-white bg-navy-800 rounded-xl active:bg-navy-900 transition"
          >
            Iniciar sesión / Registrarse
          </Link>
        )}
        <EnlaceMovil to="/" Icono={Search} texto="Buscar vivienda" onCerrar={onCerrar} />
        <EnlaceMovil to="/favoritos" Icono={Heart} texto="Favoritos" onCerrar={onCerrar}>
          {favCount > 0 && <span className="bg-red-100 text-red-700 text-[11px] px-1.5 py-0.5 rounded-full" aria-label={`${favCount} favoritos`}>{favCount}</span>}
        </EnlaceMovil>
        <EnlaceMovil to="/comparar" Icono={Scale} texto="Comparar" onCerrar={onCerrar}>
          <span className="bg-indigo-100 text-indigo-700 text-[11px] px-1.5 py-0.5 rounded-full" aria-label={`${compCount} de ${compMax} para comparar`}>{compCount}/{compMax}</span>
        </EnlaceMovil>
        <EnlaceMovil to="/roomies" Icono={Users} texto="Roomies" onCerrar={onCerrar} />
        {sesionActiva && muestraMisPubs && (
          <EnlaceMovil to="/mis-publicaciones" Icono={Megaphone} texto="Mis Publicaciones" onCerrar={onCerrar} />
        )}
        <EnlaceMovil to="/alertas" Icono={Bell} texto="Mis Alertas y Notificaciones" onCerrar={onCerrar} />
        {esAdmin(user) && (
          <EnlaceMovil to="/admin/dashboard" Icono={ShieldCheck} texto="Panel Admin" onCerrar={onCerrar} />
        )}
        <Link
          to="/publicar"
          onClick={onCerrar}
          aria-current={pathname === '/publicar' ? 'page' : undefined}
          className="block w-full px-3 py-3 text-sm font-bold text-navy-900 bg-gold-400 rounded-xl text-center mt-1 min-h-[44px] transition-colors duration-200 hover:bg-gold-500 active:bg-gold-500"
        >
          + Publicar vivienda
        </Link>
        {sesionActiva && (
          <button type="button"
            onClick={() => { onLogout(); onCerrar() }}
            className="w-full px-3 py-3 mt-1 min-h-[44px] text-sm font-bold rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            <span className="inline-flex items-center justify-center gap-2"><LogOut aria-hidden="true" className="w-5 h-5" /> Cerrar sesión</span>
          </button>
        )}
      </div>
    </>
  )
}
