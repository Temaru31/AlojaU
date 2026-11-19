import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import NivelConfianza from '../../components/NivelConfianza'

// Pestaña Confianza: completitud del perfil y desglose del puntaje por aviso.
export default function ConfianzaTab({ perfil, check, onIrADatos }) {
  const estaVerificado = !!perfil?.telefono_verificado
  return (
    <div id="panel-confianza" role="tabpanel" aria-labelledby="tab-confianza" aria-label="Índice de confianza" tabIndex={0} className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
      {/* F3 tarjeta de nivel radial (el desglose por factor sigue debajo intacto). */}
      {(() => {
        const checkRadial = check
        return <NivelConfianza pct={checkRadial.pct} />
      })()}
      <h2 className="text-base font-semibold text-navy-900">Tu confianza (0–100)</h2>
      <p className="text-xs text-neutral-500 leading-relaxed">
        El anillo del panel lateral es la <b>completitud de tu perfil</b>. El desglose de abajo es el
        <b> puntaje que hereda cada aviso publicado</b> (pesos del administrador: 40+20+15+15+10).
      </p>
      {/* Deslinde explícito: lo tuyo (cuenta) vs lo de tus avisos. */}
      <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wide pt-1">Requisitos de tu perfil (usuario)</h3>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center gap-2 py-1.5 border-b border-neutral-100">
          <span className="text-neutral-600">Completitud de oferta <span className="text-neutral-400">(se calcula por aviso al publicar)</span></span>
          <span className="font-semibold text-navy-800 shrink-0">40 pts</span>
        </div>
        <div className={`flex justify-between items-center gap-2 py-1.5 px-2 rounded ${estaVerificado ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'bg-amber-50 text-amber-800'}`}>
          <span>Teléfono verificado {estaVerificado ? '(activo en tu cuenta)' : '(pendiente en tu cuenta)'}</span>
          <span className="font-bold shrink-0 inline-flex items-center gap-1">{estaVerificado ? (<>+20 pts <Check aria-hidden="true" className="w-4 h-4" /></>) : '0 pts'}</span>
        </div>
        {!estaVerificado && (
          <button
            type="button"
            onClick={() => onIrADatos()}
            className="text-[11px] font-semibold text-navy-700 underline hover:text-navy-900 inline-flex items-center gap-1"
          >
            <ArrowRight aria-hidden="true" className="w-4 h-4" /> Vincula tu teléfono en Datos y contacto
          </button>
        )}
      </div>
      <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wide pt-2">Calidad de tus inmuebles (arrendador)</h3>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center gap-2 py-1.5 border-b border-neutral-100">
          <span className="text-neutral-600">Fotos reales (≥3) <span className="text-neutral-400">(súbelas al crear o editar cada aviso)</span></span>
          <span className="font-semibold text-navy-800 shrink-0">15 pts</span>
        </div>
        <div className="flex justify-between items-center gap-2 py-1.5 border-b border-neutral-100">
          <span className="text-neutral-600">Vigencia reciente (≤30d) <span className="text-neutral-400">(renueva tus avisos a tiempo)</span></span>
          <span className="font-semibold text-navy-800 shrink-0">15 pts</span>
        </div>
        <div className="flex justify-between items-center gap-2 py-1.5">
          <span className="text-neutral-600">Sin reportes activos <span className="text-neutral-400">(los reportes confirmados restan)</span></span>
          <span className="font-semibold text-navy-800 shrink-0">10 pts</span>
        </div>
      </div>
      <p className="text-[11px] text-neutral-500 leading-relaxed rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2" role="note">
        Las fotos y la vigencia se evalúan individualmente en cada inmueble que publiques, no en tu cuenta personal.
      </p>
      {/* R3: cada pendiente con su acceso directo (la tarjeta deja de ser solo lectura). */}
      {(() => {
                const pendientes = check.items.filter(i => !i.ok)
        if (pendientes.length === 0) return null
        const destino = (id) => (id === 'aviso' ? '/publicar' : null)
        return (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-2" aria-label="Acciones para ganar confianza">
            <h3 className="text-xs sm:text-sm font-semibold text-navy-900">
              Súbela al 100% ({check.pct}% actual)
            </h3>
            <ul className="space-y-1.5">
              {pendientes.map(i => (
                <li key={i.id}>
                  {destino(i.id) ? (
                    <Link to={destino(i.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 underline hover:text-navy-900">
                      <ArrowRight aria-hidden="true" className="w-4 h-4" /> {i.id === 'aviso' ? 'Publicar mi primer aviso' : i.label} <span className="text-neutral-400 font-normal">(+{i.peso} pts)</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onIrADatos()}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 underline hover:text-navy-900"
                    >
                      <ArrowRight aria-hidden="true" className="w-4 h-4" /> {{
                        email: 'Verificar mi correo',
                        telefono: 'Vincular mi teléfono',
                        foto: 'Subir mi foto',
                        bio: 'Escribir mi presentación',
                        tags: 'Elegir mis preferencias',
                      }[i.id] || i.label} <span className="text-neutral-400 font-normal no-underline">(+{i.peso} pts)</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })()}
      <p className="text-xs text-neutral-500 leading-relaxed">
        Informativo, no garantiza seguridad. Verificar antes de pagar. Cada publicación muestra su propio puntaje con este mismo desglose.
      </p>
    </div>
  )
}
