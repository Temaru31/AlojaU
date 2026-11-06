// Ficha del inmueble: tipo, costos, servicios, fotos y distancia al lugar.
import { formatDistancia, formatTiempoCaminando } from '../../utils/formatters'












export default function CaracteristicasAviso({ pub, zona, tipoHumano, deposito, totalPrimerMes, numFotos, distMapa, etiquetaDist, modoTrayectoria }) {
  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Contrato y estadía</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md bg-neutral-50 border border-neutral-150 p-3">
            <dt className="text-[11px] text-neutral-400 mb-0.5">Tipo</dt>
            <dd className="font-medium text-navy-800">{tipoHumano}</dd>
          </div>
          <div className="rounded-md bg-neutral-50 border border-neutral-150 p-3">
            <dt className="text-[11px] text-neutral-400 mb-0.5">Depósito</dt>
            <dd className="font-medium text-navy-800">
              {deposito == null ? 'No informado' : deposito === 0 ? 'Sin depósito' : `$${Number(deposito).toLocaleString('es-CO')}`}
            </dd>
          </div>
          <div className="rounded-md bg-neutral-50 border border-neutral-150 p-3">
            <dt className="text-[11px] text-neutral-400 mb-0.5">Total entrada</dt>
            <dd className="font-medium text-navy-800">
              {totalPrimerMes != null ? `$${Number(totalPrimerMes).toLocaleString('es-CO')}` : 'No informado'}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-neutral-400 mt-2">
          Confirma reembolsabilidad del depósito, duración mínima y servicios incluidos por WhatsApp antes de separar.
        </p>
      </div>
      <div className="border-t border-neutral-100 pt-4">
        <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Reglas de convivencia</h3>
        <p className="text-sm text-neutral-600 leading-relaxed">{pub.reglas_convivencia || pub.reglas || 'No informado'}</p>
      </div>
      <div className="border-t border-neutral-100 pt-4">
        <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Dirección de referencia</h3>
        <p className="text-sm text-neutral-600">{pub.direccion_referencial || 'No informado'}</p>
      </div>
      <div className="border-t border-neutral-100 pt-4">
        {/* UX: sin columna "Estado" (ACTIVO/PENDIENTE es interno de BD, no del estudiante) */}
        <div className="flex items-center gap-4">
          <div>
            {modoTrayectoria ? (
              <>
                <p className="text-xs text-neutral-400 mb-0.5">{etiquetaDist}</p>
                <p className="text-sm font-semibold text-navy-800">{distMapa != null ? formatDistancia(distMapa) : 'No informado'}{distMapa != null && formatTiempoCaminando(distMapa) ? ` · ${formatTiempoCaminando(distMapa)}` : ''}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-neutral-400 mb-0.5">Ubicación de la vivienda</p>
                <p className="text-sm font-semibold text-navy-800">{zona}</p>
              </>
            )}
          </div>
          <div className="w-px h-8 bg-neutral-150" />
          <div>
            <p className="text-xs text-neutral-400 mb-0.5">Fotos</p>
            <p className="text-sm font-semibold text-navy-800">{numFotos}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
