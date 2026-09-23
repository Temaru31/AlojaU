// EditarPublicacionModal - edición parcial del dueño (PATCH /api/publicaciones/{id}).
// Escalares + gestión multimedia v15.2 (subir/borrar/portada vía /upload).
// El estado NO cambia con la edición.
// Uso: {editando && <EditarPublicacionModal pub={editando} token={token} onClose={...} onSaved={...} />}
import { useState, useEffect } from 'react'
import { api } from '../services/api'
import ContadorCaracteres from './ContadorCaracteres'
import { LIMITES, estadoRango, RANGO_CLS } from '../constants'

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
  // v15.2 multimedia: fotos con id/orden desde el detalle.
  const [fotos, setFotos] = useState(() => (pub.imagenes || []).map(f => ({ ...f })))
  const [fotosCargando, setFotosCargando] = useState(!pub.imagenes)
  const [subiendo, setSubiendo] = useState(false)
  const [fotoAccion, setFotoAccion] = useState(null) // id en curso (borrar/portada)
  const [aBorrar, setABorrar] = useState(null) // confirmación en dos pasos
  const headers = { headers: { Authorization: `Bearer ${token}` } }

  // Esc cierra (igual que ReportarModal).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Si el padre no trae imagenes (cards), se cargan del detalle una vez.
  useEffect(() => {
    if (pub.imagenes) return
    let vivo = true
    api.get(`/api/publicaciones/${pub.id}`, headers)
      .then(r => { if (vivo) setFotos((r.data?.imagenes || []).map(f => ({ ...f }))) })
      .catch(() => { /* sin fotos gestionables: solo escalares */ })
      .finally(() => { if (vivo) setFotosCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub.id])

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

  const refrescarFotos = (lista) => {
    const ordenadas = [...lista].sort((a, b) => a.orden - b.orden)
    setFotos(ordenadas)
    onSaved?.({ fotos: ordenadas.map(f => f.url), imagenes: ordenadas, num_fotos: ordenadas.length })
  }

  const handleSubir = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0 || subiendo) return
    if (fotos.length + files.length > 10) {
      setError('Máximo 10 fotos por aviso.')
      return
    }
    setSubiendo(true)
    setError('')
    try {
      const urls = []
      for (const f of files) {
        const fd = new FormData()
        fd.append('file', f)
        const r = await api.post('/api/publicaciones/upload/una', fd, {
          ...headers,
          headers: { ...headers.headers, 'Content-Type': 'multipart/form-data' },
        })
        urls.push(...(r.data?.urls || []))
      }
      if (urls.length === 0) throw new Error('sin urls')
      await api.post('/api/publicaciones/upload/vincular',
        { publicacion_id: pub.id, urls }, headers)
      const det = await api.get(`/api/publicaciones/${pub.id}`, headers)
      refrescarFotos(det.data?.imagenes || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudieron subir las fotos (máx 5MB, JPG/PNG/WebP/GIF).')
    } finally {
      setSubiendo(false)
    }
  }

  const handleBorrarFoto = async (foto) => {
    if (aBorrar !== foto.id) {
      setABorrar(foto.id)
      return
    }
    setFotoAccion(foto.id)
    setError('')
    try {
      await api.delete(`/api/publicaciones/upload/${foto.id}`, headers)
      const det = await api.get(`/api/publicaciones/${pub.id}`, headers)
      refrescarFotos(det.data?.imagenes || [])
      setABorrar(null)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo eliminar la foto.')
    } finally {
      setFotoAccion(null)
    }
  }

  const handlePortada = async (foto) => {
    if (foto.orden === 1 || fotoAccion) return
    setFotoAccion(foto.id)
    setError('')
    try {
      const resto = fotos.filter(f => f.id !== foto.id).map(f => f.id)
      await api.patch('/api/publicaciones/upload/orden',
        { publicacion_id: pub.id, orden_ids: [foto.id, ...resto] }, headers)
      const det = await api.get(`/api/publicaciones/${pub.id}`, headers)
      refrescarFotos(det.data?.imagenes || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo cambiar la portada.')
    } finally {
      setFotoAccion(null)
    }
  }

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
            <div className="relative">
              <input id="edit-titulo" value={form.titulo} onChange={set('titulo')} className={`${inputCls} ${RANGO_CLS[estadoRango(form.titulo.trim().length, LIMITES.titulo.min, LIMITES.titulo.max)]}`} maxLength={150} required />
              <ContadorCaracteres len={form.titulo.trim().length} min={LIMITES.titulo.min} max={LIMITES.titulo.max} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="edit-desc">Descripción (20-2000)</label>
            <div className="relative">
              <textarea id="edit-desc" value={form.descripcion} onChange={set('descripcion')} rows={3} className={`${inputCls} resize-none ${RANGO_CLS[estadoRango(form.descripcion.trim().length, LIMITES.descripcion.min, LIMITES.descripcion.max)]}`} required />
              <ContadorCaracteres len={form.descripcion.trim().length} min={LIMITES.descripcion.min} max={LIMITES.descripcion.max} />
            </div>
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

        {/* v15.2 gestión multimedia: subir / borrar / portada */}
        <div className="mt-4 border-t border-neutral-150 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-navy-900">
              Fotos del aviso ({fotos.length}/10)
            </h3>
            <label className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition ${subiendo ? 'opacity-50 pointer-events-none' : 'border-navy-200 text-navy-700 hover:bg-navy-50'}`}>
              {subiendo ? 'Subiendo…' : '+ Agregar'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={subiendo || fotos.length >= 10}
                onChange={handleSubir}
                className="sr-only"
                aria-label="Agregar fotos al aviso"
              />
            </label>
          </div>
          {fotosCargando ? (
            <div className="grid grid-cols-3 gap-2 animate-pulse" aria-label="Cargando fotos">
              {[0, 1, 2].map(i => <div key={i} className="h-20 bg-neutral-150 rounded-lg" />)}
            </div>
          ) : fotos.length === 0 ? (
            <p className="text-xs text-neutral-400">Sin fotos. Agrega al menos 3 para publicar.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {fotos.map(f => (
                <li key={f.id} className="relative group rounded-lg overflow-hidden border border-neutral-200">
                  <img src={f.url} alt={`Foto ${f.orden}`} className="h-20 w-full object-cover" loading="lazy" />
                  {f.orden === 1 && (
                    <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold-400 text-navy-900">
                      Portada
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    {f.orden !== 1 && (
                      <button
                        type="button"
                        onClick={() => handlePortada(f)}
                        disabled={fotoAccion != null}
                        aria-label={`Usar como portada la foto ${f.orden}`}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/90 text-navy-800 disabled:opacity-50"
                      >
                        {fotoAccion === f.id ? '…' : 'Portada'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleBorrarFoto(f)}
                      disabled={fotoAccion != null}
                      aria-label={aBorrar === f.id ? `Confirmar eliminación de la foto ${f.orden}` : `Eliminar la foto ${f.orden}`}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded disabled:opacity-50 ${aBorrar === f.id ? 'bg-red-600 text-white' : 'bg-white/90 text-red-600'}`}
                    >
                      {fotoAccion === f.id ? '…' : aBorrar === f.id ? '¿Confirmar?' : 'Quitar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-neutral-400 mt-1.5">La primera foto es la portada. JPG/PNG/WebP/GIF, máx 5MB.</p>
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
