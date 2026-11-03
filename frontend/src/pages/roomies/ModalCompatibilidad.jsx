// Modal con el desglose de hábitos y compatibilidad de un candidato.
import { obtenerEtiquetaOpcion } from '../../utils/preferenciasRoomie'
import { Utensils, Moon, PawPrint, X, MessageCircle, ExternalLink } from 'lucide-react'
export default function ModalCompatibilidad({ candidato, onCerrar, urlWhatsApp }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-match"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="fixed inset-0"
        onClick={() => onCerrar()}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl z-10 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between border-b border-neutral-150 pb-4">
          <div>
            <span className="text-[11px] font-bold text-gold-600 uppercase tracking-wider">
              Detalle de Convivencia
            </span>
            <h3 id="titulo-modal-match" className="text-lg font-bold text-navy-950">
              {candidato.nombre_completo}
            </h3>
            <p className="text-xs text-neutral-500">
              Compatibilidad general:{' '}
              <span className="font-bold text-navy-900">{candidato.score}%</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCerrar()}
            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Comparativa de Hábitos */}
        <div className="space-y-4 text-xs">
          {/* Higiene */}
          <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-150 space-y-2">
            <h4 className="font-bold text-navy-900 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />
              Higiene y Cocina
            </h4>
            <div className="grid grid-cols-2 gap-2 text-neutral-600">
              <div>
                <span className="block text-[10px] text-neutral-400">Aseo semanal:</span>
                <span className="font-semibold text-navy-900">
                  {obtenerEtiquetaOpcion(
                    'MomentoAseoSemana',
                    candidato.preferencias?.['roomie.aseo_momento_semana'],
                  )}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Horario de aseo:</span>
                <span className="font-semibold text-navy-900">
                  {obtenerEtiquetaOpcion(
                    'HorarioAseo',
                    candidato.preferencias?.['roomie.aseo_horario'],
                  )}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">En la cocina:</span>
                <span className="font-semibold text-navy-900">
                  {obtenerEtiquetaOpcion(
                    'EstiloCocina',
                    candidato.preferencias?.['roomie.cocina_estilo'],
                  )}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Lavar loza:</span>
                <span className="font-semibold text-navy-900">
                  {obtenerEtiquetaOpcion(
                    'TiempoLavarLoza',
                    candidato.preferencias?.['roomie.loza_tiempo'],
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Horarios de sueño */}
          <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-150 space-y-2">
            <h4 className="font-bold text-navy-900 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />
              Horarios y Descanso
            </h4>
            <div className="grid grid-cols-3 gap-2 text-neutral-600">
              <div>
                <span className="block text-[10px] text-neutral-400">Duerme hacia:</span>
                <span className="font-semibold text-navy-900">
                  {candidato.preferencias?.['roomie.sueno_hora_dormir'] || 'Sin dato'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Despierta hacia:</span>
                <span className="font-semibold text-navy-900">
                  {candidato.preferencias?.['roomie.sueno_hora_despertar'] || 'Sin dato'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Ritmo de sueño:</span>
                <span className="font-semibold text-navy-900">
                  {obtenerEtiquetaOpcion(
                    'TipoHorarioSueno',
                    candidato.preferencias?.['roomie.sueno_tipo'],
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Visitas y Mascotas */}
          <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-150 space-y-2">
            <h4 className="font-bold text-navy-900 flex items-center gap-1.5">
              <PawPrint className="w-3.5 h-3.5 text-navy-700" aria-hidden="true" />
              Visitas y Mascotas
            </h4>
            <div className="grid grid-cols-2 gap-2 text-neutral-600">
              <div>
                <span className="block text-[10px] text-neutral-400">Tiene mascotas:</span>
                <span className="font-semibold text-navy-900">
                  {candidato.preferencias?.['roomie.mascotas'] ? 'Sí' : 'No'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Acepta mascotas:</span>
                <span className="font-semibold text-navy-900">
                  {candidato.preferencias?.['roomie.acepta_mascotas'] ? 'Sí' : 'No'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Planea visitas:</span>
                <span className="font-semibold text-navy-900">
                  {candidato.preferencias?.['roomie.invitados_plan'] ? 'Sí' : 'No'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-400">Acepta visitas:</span>
                <span className="font-semibold text-navy-900">
                  {candidato.preferencias?.['roomie.acepta_invitados'] ? 'Sí' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Botón inferior en modal */}
        <div className="pt-2">
          {candidato.telefono_whatsapp ? (
            <a
              href={urlWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-3 rounded-2xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition min-h-[44px] flex items-center justify-center gap-2 shadow-sm"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              Iniciar conversación por WhatsApp
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onCerrar()}
              className="w-full px-4 py-3 rounded-2xl text-xs font-bold text-navy-900 bg-neutral-100 hover:bg-neutral-200 transition min-h-[44px]"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
