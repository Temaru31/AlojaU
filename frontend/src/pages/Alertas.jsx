// Alertas — "Mis búsquedas guardadas" (Fase 3).
//
// - Lista mis alertas (GET /api/busquedas-guardadas), crear (POST, tope 10
//   activas con mensaje amigable) y eliminar con ConfirmDialog.
// - filtrosABusqueda(): mapea los filtros de Buscar -> payload de alerta
//   (misma normalización en Buscar y aquí; testeado sin backend).
// - GuardarAlerta: botón para Buscar ("🔔 Guardar alerta") que publica los
//   filtros actuales; sin sesión lleva a /perfil.
// Uso: <Route path="/alertas" element={<Alertas />} /> (requiere sesión).
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { notifyToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { SERVICIOS_OPCIONES } from '../components/Filtros'
import useTiposVivienda from '../hooks/useTiposVivienda'
import { MAX_ALERTAS, filtrosABusqueda } from '../utils/alertas'

export function GuardarAlerta({ filtros, campusId }) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!token) {
      notifyToast('Inicia sesión para guardar alertas.')
      navigate('/perfil')
      return
    }
    setGuardando(true)
    try {
      await api.post('/api/busquedas-guardadas', filtrosABusqueda(filtros, campusId), {
        headers: { Authorization: `Bearer ${token}` },
      })
      notifyToast('🔔 Alerta guardada: te avisaremos de nuevos arriendos.')
    } catch (e) {
      const d = e?.response?.data?.detail
      notifyToast(typeof d === 'string' && d ? d : 'No se pudo guardar la alerta.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={guardar}
      disabled={guardando}
      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold text-navy-700 border border-navy-200 rounded-lg hover:bg-navy-50 active:bg-navy-100 transition disabled:opacity-50"
    >
      {guardando ? 'Guardando…' : '🔔 Guardar alerta'}
    </button>
  )
}

const FORM_INICIAL = { nombre: '', min: '', max: '', tipo: '', campus_id: '', servicios: [] }

export default function Alertas() {
  const { token } = useAuth()
  const [alertas, setAlertas] = useState([])
  const [campus, setCampus] = useState([])
  const { tipos } = useTiposVivienda()
  const [form, setForm] = useState(FORM_INICIAL)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const vivoRef = useRef(true)
  useEffect(() => () => { vivoRef.current = false }, [])

  const head = token ? { Authorization: `Bearer ${token}` } : {}
  const activas = alertas.filter((a) => a.activa).length
  const topeAlcanzado = activas >= MAX_ALERTAS

  const cargar = async () => {
    if (!token) return
    try {
      const [rAlertas, rCampus] = await Promise.all([
        api.get('/api/busquedas-guardadas', { headers: head }),
        api.get('/api/campus').catch(() => ({ data: [] })),
      ])
      if (!vivoRef.current) return
      setAlertas(Array.isArray(rAlertas.data) ? rAlertas.data : [])
      if (Array.isArray(rCampus.data)) setCampus(rCampus.data)
      setError('')
    } catch {
      if (vivoRef.current) setError('No se pudieron cargar tus alertas.')
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const crear = async (e) => {
    e?.preventDefault()
    if (topeAlcanzado || creando) return
    setCreando(true)
    setError('')
    try {
      const body = {
        nombre: form.nombre.trim() || null,
        precio_min: form.min === '' ? null : Number(form.min),
        precio_max: form.max === '' ? null : Number(form.max),
        campus_id: form.campus_id === '' ? null : Number(form.campus_id),
        tipo: form.tipo || null,
        servicios_ids: form.servicios,
      }
      const r = await api.post('/api/busquedas-guardadas', body, { headers: head })
      if (!vivoRef.current) return
      setAlertas((cur) => [r.data, ...cur])
      setForm(FORM_INICIAL)
      notifyToast('🔔 Alerta creada.')
    } catch (err) {
      if (!vivoRef.current) return
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' && d ? d : 'No se pudo crear la alerta.')
    } finally {
      if (vivoRef.current) setCreando(false)
    }
  }

  const toggleServicio = (id) => {
    setForm((f) => ({
      ...f,
      servicios: f.servicios.includes(id)
        ? f.servicios.filter((s) => s !== id)
        : [...f.servicios, id],
    }))
  }

  const eliminar = async () => {
    if (!aEliminar || eliminando) return
    setEliminando(true)
    try {
      await api.delete(`/api/busquedas-guardadas/${aEliminar}`, { headers: head })
      if (!vivoRef.current) return
      setAlertas((cur) => cur.filter((a) => a.id !== aEliminar))
      setAEliminar(null)
      notifyToast('Alerta eliminada.')
    } catch {
      if (vivoRef.current) setError('No se pudo eliminar la alerta.')
    } finally {
      if (vivoRef.current) setEliminando(false)
    }
  }

  if (!token) {
    return (
      <div className="container-main py-12">
        <div className="max-w-md mx-auto card p-8 text-center space-y-3">
          <p className="text-3xl" aria-hidden="true">🔔</p>
          <h1 className="text-lg font-bold text-navy-900">Alertas de búsqueda</h1>
          <p className="text-sm text-neutral-500">Inicia sesión para guardar alertas y recibir avisos de arriendos nuevos.</p>
          <Link to="/perfil" className="btn-accent inline-flex justify-center">Iniciar sesión</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container-main py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Mis alertas de búsqueda</h1>
        <p className="text-sm text-neutral-500">Te avisamos en la campanita cuando un arriendo nuevo coincida. Máximo {MAX_ALERTAS} activas.</p>
      </div>

      <section aria-label="Crear alerta" className="card rounded-2xl p-4 sm:p-6 space-y-3">
        <h2 className="text-sm font-bold text-navy-800">Nueva alerta</h2>
        {topeAlcanzado && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2" role="note">
            Tienes {MAX_ALERTAS} alertas activas (máximo). Elimina una para crear otra.
          </p>
        )}
        <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-neutral-600">
            Nombre (opcional)
            <input
              type="text" value={form.nombre} maxLength={80}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Cerca a la U, barato" className="input-field mt-1"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-neutral-600">
              Precio mín.
              <input
                type="number" min="0" value={form.min}
                onChange={(e) => setForm({ ...form, min: e.target.value })}
                placeholder="300000" className="input-field mt-1" inputMode="numeric"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Precio máx.
              <input
                type="number" min="0" value={form.max}
                onChange={(e) => setForm({ ...form, max: e.target.value })}
                placeholder="600000" className="input-field mt-1" inputMode="numeric"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-neutral-600">
            Campus cercano (opcional)
            <select
              value={form.campus_id}
              onChange={(e) => setForm({ ...form, campus_id: e.target.value })}
              className="input-field mt-1"
            >
              <option value="">Cualquiera</option>
              {campus.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.institucion, c.nombre_sede].filter(Boolean).join(' — ')}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Tipo (opcional)
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="input-field mt-1"
            >
              <option value="">Cualquiera</option>
              {(tipos || []).filter((t) => t.esta_activo !== false).map((t) => (
                <option key={t.slug} value={t.slug}>{t.nombre_visible || t.slug}</option>
              ))}
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-xs font-medium text-neutral-600 mb-1.5">Servicios exigidos (vacío = cualquiera)</legend>
            <div className="flex flex-wrap gap-2">
              {SERVICIOS_OPCIONES.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-1.5 text-xs text-neutral-700 border border-neutral-200 rounded-full px-3 py-2 min-h-[44px] cursor-pointer has-checked:bg-navy-50 has-checked:border-navy-300">
                  <input
                    type="checkbox"
                    checked={form.servicios.includes(s.id)}
                    onChange={() => toggleServicio(s.id)}
                    className="accent-navy-800 w-4 h-4"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="sm:col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creando || topeAlcanzado}
              className="btn-accent justify-center"
            >
              {creando ? 'Creando…' : 'Crear alerta'}
            </button>
          </div>
        </form>
      </section>

      <section aria-label="Alertas guardadas" className="space-y-2">
        <h2 className="text-sm font-bold text-navy-800">Guardadas ({alertas.length})</h2>
        {alertas.length === 0 && (
          <p className="text-sm text-neutral-400 card rounded-2xl p-5 text-center">Aún no tienes alertas. Crea la primera arriba.</p>
        )}
        {alertas.map((a) => (
          <article key={a.id} className="card rounded-2xl p-4 flex items-center gap-3">
            <span aria-hidden="true" className="text-xl shrink-0">🔔</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy-900 truncate">{a.nombre || 'Alerta sin nombre'}</p>
              <p className="text-xs text-neutral-500 truncate">
                {[a.precio_min != null || a.precio_max != null
                  ? `$${a.precio_min ?? '…'}–$${a.precio_max ?? '…'}`
                  : 'Cualquier precio',
                  a.tipo, (a.servicios_ids || []).length ? `${(a.servicios_ids || []).length} servicios` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAEliminar(a.id)}
              aria-label={`Eliminar alerta ${a.nombre || a.id}`}
              className="shrink-0 px-3 py-2 min-h-[44px] text-xs font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition"
            >
              Eliminar
            </button>
          </article>
        ))}
      </section>

      {aEliminar != null && (
        <ConfirmDialog
          titulo="Eliminar alerta"
          descripcion="Dejarás de recibir avisos de esta búsqueda. Los avisos ya recibidos se conservan."
          cancelar="Cancelar"
          confirmar="Sí, eliminar"
          peligro
          ocupado={eliminando}
          onCancelar={() => { if (!eliminando) setAEliminar(null) }}
          onConfirmar={eliminar}
        />
      )}
    </div>
  )
}
