// Tarjeta de un aviso propio en Mis publicaciones: estado, vigencia y acciones.
import { Link } from 'react-router-dom'
import { ArrowRight, Eye, Pause, Play, RefreshCw } from 'lucide-react'

import { formatDistancia } from '../../utils/formatters'
import SmartImage from '../../components/SmartImage'
import { portadaUrl, zonaTextoDe } from '../../utils/portada'
import { getEtiquetaTipo } from '../../utils/tiposVivienda'

import { ESTADO, ESTADO_LABEL } from '../../utils/estados'
import { calcularVigencia, formatFechaExpiracion } from '../../utils/vigencia'

const ESTADO_STYLE = {
  ACTIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  EXPIRADO: 'bg-red-50 text-red-700 border-red-200',
  PAUSADO: 'bg-neutral-50 text-neutral-600 border-neutral-200',
  PAUSADO_POR_REPORTE: 'bg-red-50 text-red-700 border-red-200',
  REVISION_REQUERIDA: 'bg-orange-50 text-orange-700 border-orange-200',
  RECHAZADO: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function TarjetaMiAviso({
  p, tiposCatalogo, cambiando, confirmandoPausa,
  onCambiarEstado, onCancelarPausa, onRenovar, onEditar, onEliminar,
}) {
  const vigencia = calcularVigencia(p.fecha_expiracion)
  const fechaExpTexto = formatFechaExpiracion(p.fecha_expiracion)
  // BUG#1: portada = orden=1 vía helper central.
  const cover = portadaUrl(p)
  const zonaTexto = zonaTextoDe(p) || 'Zona no informada'
  // Fuente única (dinámico + fallback central).
  const tipoTexto = getEtiquetaTipo(p.tipo_inmueble, tiposCatalogo, 'Vivienda')
  const canonValor = p.canon_mensual ?? p.canon
  const distM = p.distancia_geodesica_m ?? p.dist_m

  return (
    <article
      className="card p-0 overflow-hidden flex flex-col sm:flex-row hover:border-navy-200 transition group"
    >
      {/* 1. Imagen principal */}
      <div className="sm:w-44 h-36 sm:h-auto bg-neutral-100 relative shrink-0 overflow-hidden">
        {cover ? (
          <SmartImage
            src={cover}
            alt={p.titulo}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
          />
        ) : (
          <div className="w-full h-full min-h-[140px] flex flex-col items-center justify-center bg-navy-50/50 text-navy-300 p-4">
            <svg className="w-8 h-8 mb-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="text-[11px] text-neutral-400 font-medium">Sin fotos</span>
          </div>
        )}
      </div>

      {/* Cuerpo de la tarjeta */}
      <div className="p-4 flex-1 flex flex-col justify-between min-w-0">
        <div>
          {/* Meta superior: Tipo de inmueble, Zona y Estado */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span className="font-semibold text-navy-800">{tipoTexto}</span>
              <span>•</span>
              <span>{zonaTexto}</span>
              {distM != null && (
                <>
                  <span>•</span>
                  <span>{formatDistancia(distM)}</span>
                </>
              )}
            </div>

            {/* Estado de publicación */}
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${ESTADO_STYLE[p.estado] || 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
              {ESTADO_LABEL[p.estado] || p.estado}
            </span>
          </div>

          {/* Título de la publicación */}
          <h2 className="text-base font-semibold text-navy-900 group-hover:text-navy-700 transition line-clamp-1 mb-1" title={p.titulo}>
            {p.titulo}
          </h2>

          {/* Canon mensual */}
          <p className="text-sm font-bold text-navy-900 mb-2">
            {canonValor != null
              ? `$${Number(canonValor).toLocaleString('es-CO')} COP/mes`
              : 'Canon no informado'}
            {p.indice_confianza != null && (
              <span className="text-xs font-normal text-neutral-400 ml-2">
                · Confianza {p.indice_confianza}/100
              </span>
            )}
            {typeof p.vistas === 'number' && (
              <span className="text-xs font-normal text-neutral-400 ml-2 inline-flex items-center gap-1" aria-label={`${p.vistas} vistas`}>
                · <Eye aria-hidden="true" className="w-4 h-4" /> {p.vistas}
              </span>
            )}
          </p>

          {/* Fechas de vigencia */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {fechaExpTexto && (
              <span className="text-neutral-500">
                Expira: <span className="font-medium text-neutral-700">{fechaExpTexto}</span>
              </span>
            )}

            {/* Días restantes o estado de vencimiento */}
            {vigencia && (
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${vigencia.badgeClass}`}
              >
                {vigencia.texto}
              </span>
            )}
          </div>
        </div>

        {/* Acciones de la tarjeta */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-3 border-t border-neutral-100">
          {/* v15.2 switch ACTIVA/PAUSADA del dueño (pausar: 2 pasos) */}
          {(p.estado === ESTADO.ACTIVO || p.estado === ESTADO.PAUSADO) && (
            <button
              onClick={() => onCambiarEstado()}
              onBlur={() => onCancelarPausa()}
              disabled={cambiando}
              aria-label={p.estado === ESTADO.ACTIVO
                ? (confirmandoPausa ? `Confirmar pausa de ${p.titulo}` : `Pausar ${p.titulo}`)
                : `Reanudar ${p.titulo}`}
              aria-pressed={p.estado === ESTADO.ACTIVO}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${p.estado === ESTADO.ACTIVO
                ? (confirmandoPausa
                  ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                  : 'border-amber-300 text-amber-700 hover:bg-amber-50')
                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }`}
            >
              {cambiando ? '…' : p.estado === ESTADO.ACTIVO
                ? (confirmandoPausa ? '¿Pausar?' : (<span className="inline-flex items-center gap-1"><Pause aria-hidden="true" className="w-4 h-4" /> Pausar</span>))
                : (<span className="inline-flex items-center gap-1"><Play aria-hidden="true" className="w-4 h-4" /> Reanudar</span>)}
            </button>
          )}
          <button
            onClick={() => onRenovar()}
            aria-label={`Renovar ${p.titulo}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1 shadow-sm"
          >
            <RefreshCw aria-hidden="true" className="w-4 h-4" /> Renovar
          </button>

          {/* Publicidad v1: destacar aviso activo (pago manual + aprobación). */}
          {p.estado === ESTADO.ACTIVO && (
            <Link
              to={`/publicitar?publicacion_id=${p.id}`}
              aria-label={`Destacar ${p.titulo}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gold-400 text-navy-800 hover:bg-gold-400/10 transition inline-flex items-center gap-1"
            >
              Destacar
            </Link>
          )}

          <button
            onClick={() => onEditar()}
            aria-label={`Editar ${p.titulo}`}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 text-neutral-600 hover:border-navy-300 hover:text-navy-700 transition"
          >
            Editar
          </button>

          <button
            onClick={() => onEliminar()}
            aria-label={`Eliminar ${p.titulo}`}
            className="px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium border border-neutral-200 text-neutral-400 hover:border-red-300 hover:text-red-600 active:bg-red-50 transition"
          >
            Eliminar
          </button>

          <Link
            to={`/publicacion/${p.id}`}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-navy-700 hover:text-navy-900 hover:bg-neutral-100 transition inline-flex items-center gap-1"
          >
            Ver detalle <ArrowRight aria-hidden="true" className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  )
}
