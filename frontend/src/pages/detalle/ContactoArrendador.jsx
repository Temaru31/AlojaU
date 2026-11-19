// Contacto con el arrendador: WhatsApp, copiar número, marcar contactado y reportar.

import { Check, Flag, Heart } from 'lucide-react'
import IconoWhatsApp from '../../components/IconoWhatsApp'
















export default function ContactoArrendador({ pub, wa, hasTel, isActivo, mensajeWa, copiado, yaContactado, isFav, handleWhatsAppClick, handleCopiar, handleMarcarContactado, handleToggleFav, setReportOpen }) {
  return (
    <div className="card p-5 sm:p-6">
      {hasTel ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-navy-900 mb-0.5">Contactar arrendador</h3>
            <p className="text-xs text-neutral-500">Respuesta directa por WhatsApp</p>
            {yaContactado && (
              <p className="text-xs font-medium text-emerald-700 mt-1.5 inline-flex items-center gap-1">
                <Check aria-hidden="true" className="w-4 h-4" /> Ya contactaste este aviso
              </p>
            )}
          </div>
          {/* Acción primaria: CTA dominante, ancho completo en móvil */}
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            className="flex w-full items-center justify-center gap-2.5 px-6 py-3.5 min-h-[52px] bg-emerald-700 text-white font-semibold text-base rounded-xl shadow-sm hover:bg-emerald-800 hover:shadow active:bg-emerald-800 active:scale-[0.99] transition"
          >
            <IconoWhatsApp />
            Contactar por WhatsApp
          </a>
          {/* Acciones secundarias: ghost, agrupadas, sin competir con el CTA */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => handleCopiar(pub.telefono_whatsapp, 'numero')}
              className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
            >
              {copiado === 'numero' ? (<span className="inline-flex items-center gap-1"><Check aria-hidden="true" className="w-4 h-4" /> Número copiado</span>) : 'Copiar número'}
            </button>
            <button
              type="button"
              onClick={() => handleCopiar(mensajeWa, 'mensaje')}
              className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
            >
              {copiado === 'mensaje' ? (<span className="inline-flex items-center gap-1"><Check aria-hidden="true" className="w-4 h-4" /> Mensaje copiado</span>) : 'Copiar mensaje'}
            </button>
            {!yaContactado && (
              <button
                type="button"
                onClick={handleMarcarContactado}
                className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
              >
                Ya contacté por otro medio
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            <p className="text-xs text-orange-700">
              {/* UX: sin enum de BD; el estudiante solo necesita saber que no hay contacto */}
              {!isActivo
                ? 'Este aviso no está disponible por ahora'
                : 'Sin WhatsApp autorizado — no se muestra botón de contacto'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
            <button
              type="button"
              onClick={handleToggleFav}
              className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
            >
              {isFav ? (<span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="w-4 h-4 fill-current" /> Guardado en favoritos</span>) : (<span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="w-4 h-4" /> Guardar y avísame si habilita contacto</span>)}
            </button>
            {!yaContactado && (
              <button
                type="button"
                onClick={handleMarcarContactado}
                className="text-xs text-neutral-500 hover:text-navy-800 hover:underline transition py-1"
              >
                Ya contacté por otro medio
              </button>
            )}
          </div>
        </div>
      )}
      {/* UX: segunda vía clara para reportar, junto al contacto (texto oscuro legible) */}
      <button type="button"
        onClick={() => setReportOpen(true)}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-md py-2 transition-colors"
      >
        <Flag aria-hidden="true" className="w-4 h-4" /> ¿Hay algún problema con este anuncio?
      </button>
    </div>
  )
}
