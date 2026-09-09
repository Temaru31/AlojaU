// ReportarModal - denuncia anónima de avisos (HU-011).
// Uso: <ReportarModal publicacionId titulo onClose /> en Detalle. Ej: <ReportarModal publicacionId={1} titulo="Apto" onClose={...} />.
import { useState, useEffect } from 'react'
import { api } from '../services/api'

const MOTIVOS = [
  { value: 'POSIBLE_ESTAFA', label: 'Posible estafa' },
  { value: 'DATOS_FALSOS', label: 'Datos falsos' },
  { value: 'INMUEBLE_ARRENDADO', label: 'Ya está arrendado' },
  { value: 'FOTOS_ENGANOSAS', label: 'Fotos engañosas' },
  { value: 'OTRO', label: 'Otro motivo' },
]

export default function ReportarModal({ publicacionId, titulo = '', onClose }) {
  const [motivo, setMotivo] = useState('DATOS_FALSOS')
  const [detalle, setDetalle] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // UX-AUDIT P1: cerrar con Esc + un solo nombre accesible "Cerrar"
  // (antes: dos botones "Cerrar"/"Cerrar ventana" en el mismo dialog).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const enviar = async (e) => {
    e?.preventDefault()
    if (sending) return
    setSending(true)
    setError('')
    try {
      await api.post('/api/reportes', {
        publicacion_id: Number(publicacionId),
        motivo,
        detalle: detalle.trim() || undefined,
      })
      setDone(true)
    } catch (err) {
      const status = err?.response?.status
      if (status === 429) {
        setError('Ya recibimos tu reporte. Espera 1 minuto antes de enviar otro (anti-spam).')
      } else if (status === 404) {
        setError('Esta publicación ya no existe.')
      } else {
        setError(err?.response?.data?.detail || 'No se pudo enviar el reporte. Intenta de nuevo.')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reportar aviso">
      {/* Backdrop solo-ratón (teclado usa Esc o el botón Cerrar) */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-navy-900/50" />
      <form onSubmit={enviar} className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-display font-bold text-lg text-navy-900">Reportar aviso</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-lg leading-none">×</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4 truncate" title={titulo}>{titulo || `Publicación #${publicacionId}`}</p>

        {done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 text-sm text-emerald-700" role="status">
            Gracias, revisaremos este aviso. Tu reporte es anónimo.
          </div>
        ) : (
          <>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5" htmlFor="reporte-motivo">Motivo</label>
            <select
              id="reporte-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
              className="select-field w-full mb-3"
            >
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <label className="block text-xs font-medium text-neutral-600 mb-1.5" htmlFor="reporte-detalle">
              Detalle <span className="text-neutral-400 font-normal">(opcional, máx 500)</span>
            </label>
            <textarea
              id="reporte-detalle"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Ej: las fotos no coinciden con el lugar real"
              className="input-field w-full mb-3"
            />

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3" role="alert">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
              <button type="submit" disabled={sending} className="btn-accent text-sm disabled:opacity-50">
                {sending ? 'Enviando…' : 'Enviar anónimo'}
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-3">Sin cuenta. Solo guardamos motivo y detalle.</p>
          </>
        )}
      </form>
    </div>
  )
}
