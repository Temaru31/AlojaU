// RenovarModal — PA-01 Renovación mensual
// Muestra fecha actual + preview estimada de nueva fecha (cálculo local, sólo visual).
// La fecha confirmada siempre viene del backend; si hay error NO se presenta fecha renovada.
// Uso: <RenovarModal pub={pub} token={token} onClose={() => ...} onRenovada={(upd) => ...} />
import { useState } from 'react'
import { api } from '../services/api'

/** Formatea un Date o string ISO a texto legible en español. */
function formatFecha(fechaRaw) {
  if (!fechaRaw) return '—'
  const d = fechaRaw instanceof Date ? fechaRaw : new Date(fechaRaw)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
}

/** Calcula la preview local de +30 días (solo orientativa, no confirmada por backend). */
function previewFechaNew(fechaExpiracion) {
  const now = new Date()
  const exp = fechaExpiracion ? new Date(fechaExpiracion) : null
  const base = exp && exp > now ? exp : now
  const nueva = new Date(base.getTime())
  nueva.setDate(nueva.getDate() + 30)
  return nueva
}

/** Días restantes hasta una fecha (negativo si ya venció). */
function diasRestantes(fechaRaw) {
  if (!fechaRaw) return null
  const d = new Date(fechaRaw)
  if (isNaN(d.getTime())) return null
  return Math.round((d.getTime() - Date.now()) / 86_400_000)
}

export default function RenovarModal({ pub, token, onClose, onRenovada }) {
  const [estado, setEstado] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [resultado, setResultado] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const fechaActual = pub?.fecha_expiracion
  const fechaPreview = previewFechaNew(fechaActual)
  const dias = diasRestantes(fechaActual)
  const yaVencio = dias !== null && dias < 0

  async function handleConfirmar() {
    setEstado('loading')
    setErrorMsg('')
    try {
      const res = await api.patch(
        `/api/publicaciones/${pub.id}/renovar`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setResultado(res.data)
      setEstado('success')
      if (onRenovada) onRenovada(res.data)
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 401) {
        setErrorMsg('Sesión vencida. Inicia sesión de nuevo.')
      } else if (status === 403) {
        setErrorMsg('No tienes permisos para renovar esta publicación.')
      } else if (status === 404) {
        setErrorMsg('La publicación no fue encontrada.')
      } else if (detail) {
        setErrorMsg(String(detail))
      } else {
        setErrorMsg('Error de red o de servidor. La publicación NO fue renovada.')
      }
      setEstado('error')
      // Criterio Gherkin: no presentar fecha renovada ante error
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="renovar-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-navy-800 to-navy-600 px-6 py-4 flex items-center justify-between">
          <h2 id="renovar-modal-title" className="text-white font-semibold text-base">
            Renovar publicación
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar modal de renovación"
            className="text-white/70 hover:text-white transition text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Título del aviso */}
          <p className="text-sm font-semibold text-navy-800 truncate" title={pub?.titulo}>
            {pub?.titulo}
          </p>

          {/* ---- idle / loading / error: muestra confirmación previa ---- */}
          {estado !== 'success' && (
            <div className="space-y-4">
              {/* Fechas comparadas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3">
                  <p className="text-[11px] text-neutral-400 font-medium mb-1 uppercase tracking-wide">
                    Vence actualmente
                  </p>
                  <p className={`text-sm font-bold ${yaVencio ? 'text-red-600' : 'text-neutral-700'}`}>
                    {formatFecha(fechaActual)}
                  </p>
                  {dias !== null && (
                    <p className={`text-[11px] mt-0.5 ${yaVencio ? 'text-red-500' : 'text-neutral-400'}`}>
                      {yaVencio ? `Venció hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}` : `${dias} días restantes`}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <p className="text-[11px] text-emerald-600 font-medium mb-1 uppercase tracking-wide">
                    Nueva fecha (est.)
                  </p>
                  <p className="text-sm font-bold text-emerald-700">
                    {formatFecha(fechaPreview)}
                  </p>
                  <p className="text-[11px] text-emerald-500 mt-0.5">+30 días calendario</p>
                </div>
              </div>

              {/* Aviso sobre preview */}
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                La fecha estimada es orientativa. La nueva fecha oficial se confirma
                con el servidor al aceptar la renovación.
              </p>

              {/* Mensaje de error (sin fecha renovada) */}
              {estado === 'error' && errorMsg && (
                <div
                  className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
                  role="alert"
                  id="renovar-error-msg"
                >
                  <span className="text-red-500 mt-0.5 shrink-0" aria-hidden="true">⚠</span>
                  <p className="text-xs text-red-700">{errorMsg}</p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={estado === 'loading'}
                  className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-neutral-200 text-neutral-600 hover:border-neutral-300 transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  id="renovar-confirmar-btn"
                  onClick={handleConfirmar}
                  disabled={estado === 'loading'}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-navy-800 hover:bg-navy-700 text-white transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {estado === 'loading' ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Renovando…
                    </>
                  ) : 'Confirmar renovación'}
                </button>
              </div>
            </div>
          )}

          {/* ---- success: muestra fechas confirmadas por el backend ---- */}
          {estado === 'success' && resultado && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-2 gap-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-semibold text-navy-800 text-sm text-center">
                  {resultado.mensaje || '¡Publicación renovada exitosamente!'}
                </p>
              </div>

              {/* Fechas confirmadas por el backend (nunca estimadas) */}
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-2">
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>Fecha anterior</span>
                  <span className="font-medium text-neutral-600">
                    {formatFecha(resultado.fecha_expiracion_anterior)}
                  </span>
                </div>
                <div className="border-t border-emerald-200 my-1" />
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700 font-semibold">Nueva fecha de vencimiento</span>
                  <span className="font-bold text-emerald-700" id="renovar-fecha-nueva-confirmada">
                    {formatFecha(resultado.fecha_expiracion_nueva)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>Días agregados</span>
                  <span className="font-medium">{resultado.dias_agregados} días reales</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 text-sm font-semibold rounded-xl bg-navy-800 hover:bg-navy-700 text-white transition"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
