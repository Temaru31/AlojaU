// Tarjeta de un candidato a roomie: afinidad, hábitos clave y contacto.

import { inicialesDe } from '../../contexts/AuthContext'

import { obtenerBandaCompatibilidad } from '../../utils/preferenciasRoomie'
import { Users, Heart, Clock, Utensils, Moon, MessageCircle } from 'lucide-react'
export default function TarjetaCandidato({ cand, onVerDetalle, urlWhatsApp }) {
  const banda = obtenerBandaCompatibilidad(cand.score)
  const detalle = cand.detalle || null
  const tieneDetalle = Boolean(detalle && Object.keys(detalle).length > 0)
  const tienePreferencias = Boolean(cand.preferencias && Object.keys(cand.preferencias).length > 0)

  return (
    <div
      className="card rounded-2xl p-5 sm:p-6 bg-white border border-neutral-150 shadow-sm hover:shadow-md transition space-y-5 flex flex-col justify-between"
    >
      {/* Cabecera del Candidato */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="w-12 h-12 rounded-full bg-navy-900 text-white text-sm font-bold flex items-center justify-center shrink-0 border border-neutral-200 shadow-sm"
          >
            {inicialesDe({ nombre_completo: cand.nombre_completo })}
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-navy-950 leading-tight">
              {cand.nombre_completo}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {cand.carrera || 'Estudiante universitario'} {cand.email ? `· ${cand.email}` : '· Popayán'}
            </p>
          </div>
        </div>

        {/* Insignia de Score de Afinidad */}
        <div
          className={`inline-flex flex-col items-end px-3 py-1.5 rounded-xl border font-bold text-xs shrink-0 ${banda.badgeClass}`}
        >
          <span className="text-sm font-black">{cand.score}%</span>
          <span className="text-[10px] font-medium leading-none">{banda.etiqueta}</span>
        </div>
      </div>

      {/* Presentación / Bio */}
      {cand.bio && (
        <p className="text-xs text-neutral-600 bg-neutral-50/70 p-3 rounded-xl border border-neutral-100 leading-relaxed italic">
          &ldquo;{cand.bio}&rdquo;
        </p>
      )}

      {/* Desglose visual por 5 dimensiones (solo si viene en la respuesta) */}
      {tieneDetalle && (
        <div className="space-y-2 pt-1 border-t border-neutral-100">
          <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600">
            <span>Afinidad por dimensiones:</span>
            <span className="text-navy-900 font-bold">{cand.score}/100</span>
          </div>

          <div className="grid grid-cols-5 gap-1.5 text-center">
            <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
              <Utensils className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
              <span className="block text-[10px] text-neutral-500">Aseo</span>
              <span className="text-[11px] font-bold text-navy-900">
                {Math.round((detalle.aseo ?? 1) * 100)}%
              </span>
            </div>

            <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
              <Moon className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
              <span className="block text-[10px] text-neutral-500">Sueño</span>
              <span className="text-[11px] font-bold text-navy-900">
                {Math.round((detalle.sueno ?? 1) * 100)}%
              </span>
            </div>

            <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
              <Users className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
              <span className="block text-[10px] text-neutral-500">Visitas</span>
              <span className="text-[11px] font-bold text-navy-900">
                {Math.round((detalle.invitados ?? 1) * 100)}%
              </span>
            </div>

            <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
              <Clock className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
              <span className="block text-[10px] text-neutral-500">Pagos</span>
              <span className="text-[11px] font-bold text-navy-900">
                {Math.round((detalle.pagos ?? 1) * 100)}%
              </span>
            </div>

            <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
              <Heart className="w-3.5 h-3.5 text-navy-700 mx-auto mb-0.5" aria-hidden="true" />
              <span className="block text-[10px] text-neutral-500">Carácter</span>
              <span className="text-[11px] font-bold text-navy-900">
                {Math.round((detalle.caracter ?? 0.8) * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Acciones de Contacto */}
      <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
        {tienePreferencias && (
          <button
            type="button"
            onClick={() => onVerDetalle()}
            className="w-full sm:w-1/2 px-3 py-2.5 rounded-xl text-xs font-semibold text-navy-800 bg-neutral-100 hover:bg-neutral-200 transition min-h-[44px] flex items-center justify-center gap-1.5"
          >
            Ver hábitos completos
          </button>
        )}

        {cand.telefono_whatsapp ? (
          <a
            href={urlWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full ${tienePreferencias ? 'sm:w-1/2' : ''} px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition min-h-[44px] flex items-center justify-center gap-1.5 shadow-sm`}
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            Contactar WhatsApp
          </a>
        ) : (
          <span className={`w-full ${tienePreferencias ? 'sm:w-1/2' : ''} text-center text-xs text-neutral-400 py-2.5`}>
            {cand.ejemplo ? 'Perfil de ejemplo: sin contacto' : 'Sin WhatsApp público'}
          </span>
        )}
      </div>
    </div>
  )
}
