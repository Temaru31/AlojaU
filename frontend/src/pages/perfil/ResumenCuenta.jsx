import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import AvatarPerfil from '../../components/AvatarPerfil'
import BotonCompartir from '../../components/BotonCompartir'
import NivelConfianza from '../../components/NivelConfianza'
import { calcularCompletitudRoomie } from '../../utils/preferenciasRoomie'

// Barra lateral de Mi Perfil: identidad, nivel de confianza y acceso a Roomies.
export default function ResumenCuenta({ perfil, token, check, onCambioFoto, irTab }) {
  return (
    <aside className="md:col-span-4" aria-label="Resumen de cuenta">
      <div className="lg:sticky lg:top-24 space-y-4">
        {/* Tarjeta de identidad: avatar grande con cambio rápido + rol. */}
        <section aria-label="Tu identidad" className="card rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-4">
            <AvatarPerfil
              perfil={perfil}
              token={token}
              onCambio={onCambioFoto}
              tamano="lg"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-navy-900 truncate" title={perfil?.nombre_completo || ''}>{perfil?.nombre_completo || 'Usuario AlojaU'}</h2>
              <p className="text-xs text-neutral-500 truncate" title={perfil?.email || ''}>{perfil?.email || ''}</p>
            </div>
          </div>
          {perfil?.bio && (
            <p className="text-xs text-neutral-600 leading-relaxed line-clamp-2" title={perfil.bio}>{perfil.bio}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex badge bg-navy-50 text-navy-700 border border-navy-100 font-semibold text-xs" title={perfil?.rol === 'ARRENDADOR' ? 'Publica y gestiona avisos' : 'Busca, guarda favoritos y contacta'}>
              {perfil?.rol === 'ADMIN' ? 'Administrador' : perfil?.rol === 'ARRENDADOR' ? 'Arrendador' : 'Estudiante'}
            </span>
            <BotonCompartir
              titulo={`Perfil de ${perfil?.nombre_completo || 'usuario'} en AlojaU`}
              url={typeof window !== 'undefined' ? `${window.location.origin}/perfil` : '/perfil'}
              etiqueta="Compartir perfil"
            />
          </div>
        </section>
        {/* Widget radial: la ÚNICA métrica visible (sin barra plana duplicada). */}
        <section aria-label="Nivel de confianza" className="card rounded-2xl p-5 sm:p-6 space-y-3 shadow-sm">
          {(() => {
            const checkSide = check
            const pendientes = checkSide.items.filter(i => !i.ok).slice(0, 3)
            return (
              <>
                <NivelConfianza pct={checkSide.pct} />
                {pendientes.length > 0 && (
                  <ul className="space-y-1.5 pt-1 border-t border-neutral-100">
                    {pendientes.map(i => (
                      <li key={i.id}>
                        {i.id === 'aviso' ? (
                          <Link
                            to="/publicar"
                            className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline inline-flex items-center gap-1"
                          >
                            <ArrowRight aria-hidden="true" className="w-4 h-4" /> Publicar aviso
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => irTab('datos')}
                            className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline inline-flex items-center gap-1"
                          >
                            <ArrowRight aria-hidden="true" className="w-4 h-4" /> {{
                              email: 'Verificar correo',
                              telefono: 'Vincular teléfono',
                              foto: 'Subir foto',
                              bio: 'Escribir presentación',
                              tags: 'Elegir preferencias',
                            }[i.id] || i.label}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          })()}
        </section>

        {/* Widget Roomie & Convivencia */}
        <section aria-label="Afinidad Roomie" className="card rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-sm bg-gradient-to-br from-navy-50/70 to-white border border-navy-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-navy-900 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-gold-500" aria-hidden="true" />
              Match de Roomies
            </span>
            <span className="text-xs font-black text-navy-900 bg-gold-400/20 px-2 py-0.5 rounded-full">
              {calcularCompletitudRoomie(perfil?.preferencias).porcentaje}%
            </span>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Completa tus 5 hábitos de convivencia para desbloquear el emparejamiento con otros estudiantes.
          </p>
          <button
            type="button"
            onClick={() => irTab('roomie')}
            className="w-full text-center px-3 py-2 rounded-xl text-xs font-bold text-navy-900 bg-gold-400 hover:bg-gold-500 transition min-h-[38px]"
          >
            Configurar Hábitos de Roomie
          </button>
        </section>
      </div>
    </aside>
  )
}
