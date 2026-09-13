// EditarPublicacionModal - edición parcial del dueño (PATCH /api/publicaciones/{id}).
// Solo escalares (título, descripción, tipo, canon, depósito, dirección, reglas);
// servicios/fotos/zona llegan en T3. El estado NO cambia con la edición.
// Uso: {editando && <EditarPublicacionModal pub={editando} token={token} onClose={...} onSaved={...} />}
import { useState, useEffect } from 'react'
import { api } from '../services/api'

const TIPOS = ['HABITACION_FAMILIAR', 'HABITACION_INDEPENDIENTE', 'APARTAESTUDIO', 'COMPARTIDO']

export default function EditarPublicacionModal({ pub, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    titulo: pub.titulo || '',
    descripcion: pub.descripcion || '',
    tipo_inmueble: pub.tipo_inmueble || 'HABITACION_INDEPENDIENTE',
    canon_mensual: pub.canon_mensual ?? '',
    deposito_requerido: pub.deposito_requerido ?? 0,
    direccion_referencial: pub.direccion_referencial || '',
    reglas_convivencia: pub.reglas_convivencia || pub.reglas || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Esc cierra (igual que ReportarModal).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  // Validación espejo del backend (PublicacionUpdate): evita un 422 evitable.
  const validate = () => {
    if (form.titulo.trim().length < 10) return 'Título: mínimo 10 caracteres'
    if (form.descripcion.trim().length < 20) return 'Descripción: mínimo 20 caracteres'
    if (!(Number(form.canon_mensual) > 0)) return 'Canon: debe ser mayor a 0'
    if (Number(form.canon_mensual) > 10_000_000) return 'Canon: máximo 10M'
    if (form.deposito_requerido === '' || Number(form.deposito_requerido) < 0) return 'Depósito: 0 o más'
    if (form.direccion_referencial.trim().length < 10) return 'Dirección: mínimo 10 caracteres'
    if (form.reglas_convivencia.trim().length < 10) return 'Reglas: mínimo 10 caracteres'
    return ''
  }

  const guardar = async (e) => {
    e?.preventDefault()
    if (saving) return
    const v = validate()
    if (v) { setError(v); return }
    setSaving(true)
    setError('')
    try {
      const r = await api.patch(`/api/publicaciones/${pub.id}`, {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        tipo_inmueble: form.tipo_inmueble,
        canon_mensual: Number(form.canon_mensual),
        deposito_requerido: Number(form.deposito_requerido),
        direccion_referencial: form.direccion_referencial.trim(),
        reglas_convivencia: form.reglas_convivencia.trim(),
      }, { headers: { Authorization: `Bearer ${token}` } })
      onSaved?.(r.data)
      onClose?.()
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      setError(
        status === 401 ? 'Sesión vencida. Inicia sesión de nuevo.'
        : status === 403 ? 'Solo el dueño puede editar este aviso.'
        : status === 404 ? 'Este aviso ya no existe.'
        : typeof detail === 'string' ? detail
        : 'No se pudo guardar. Intenta de nuevo.'
      )
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'input-field text-sm'

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Editar ${pub.titulo}`}>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-navy-900/50" />
      <form onSubmit={guardar} className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display font-bold text-lg text-navy-900">Editar aviso</h2>
            <p className="text-xs text-neutral-400">El estado no cambia con la edición.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-lg leading-none shrink-0">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-titulo">Título (10-150)</label>
            <input id="edit-titulo" value={form.titulo} onChange={set('titulo')} className={inputCls} maxLength={150} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-desc">Descripción (20-2000)</label>
            <textarea id="edit-desc" value={form.descripcion} onChange={set('descripcion')} rows={3} className={`${inputCls} resize-none`} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-tipo">Tipo</label>
              <select id="edit-tipo" value={form.tipo_inmueble} onChange={set('tipo_inmueble')} className="select-field text-sm">
                {TIPOS.map(t => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-canon">Canon COP/mes</label>
              <input id="edit-canon" type="number" min={1} value={form.canon_mensual} onChange={set('canon_mensual')} className={inputCls} required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-dep">Depósito (0 si no aplica)</label>
            <input id="edit-dep" type="number" min={0} value={form.deposito_requerido} onChange={set('deposito_requerido')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-dir">Dirección referencial (mín 10)</label>
            <input id="edit-dir" value={form.direccion_referencial} onChange={set('direccion_referencial')} className={inputCls} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-reglas">Reglas (mín 10)</label>
            <textarea id="edit-reglas" value={form.reglas_convivencia} onChange={set('reglas_convivencia')} rows={2} className={`${inputCls} resize-none`} required />
          </div>
        </div>

        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3" role="alert">{error}</p>}

        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-accent text-sm disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
