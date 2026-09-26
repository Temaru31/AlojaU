// AdminTipos — Gestión del catálogo de tipos de vivienda (R10, solo ADMIN).
// Usa el CRUD protegido de /api/admin/housing-types (migración 013).
// Deshabilitación lógica vía `esta_activo` (nunca borra slugs en uso: la FK
// RESTRICT responde 409). Los cambios quedan auditados (evento SETTINGS) y
// el backend invalida la caché de 5min. Uso: ruta /admin/tipos-vivienda.
import { useEffect, useState, useCallback } from 'react'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import BreadcrumbsAdmin from '../components/BreadcrumbsAdmin'

const authHead = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

export default function AdminTipos() {
  const { token } = useAuth()
  const [tipos, setTipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(null)
  const [aBorrar, setABorrar] = useState(null)
  const [nuevo, setNuevo] = useState({ slug: '', nombre_visible: '', descripcion_tooltip: '', icono: '' })
  const [edit, setEdit] = useState({}) // slug -> {nombre_visible, descripcion_tooltip, icono}

  const cargar = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const r = await api.get('/api/admin/housing-types', authHead(token))
      const lista = Array.isArray(r.data) ? r.data : []
      setTipos(lista)
      const e = {}
      for (const t of lista) {
        e[t.slug] = { nombre_visible: t.nombre_visible || '', descripcion_tooltip: t.descripcion_tooltip || '', icono: t.icono || '' }
      }
      setEdit(e)
    } catch (err) {
      setError(err?.response?.status === 401 || err?.response?.status === 403
        ? 'Sin permiso de administrador.'
        : 'No se pudo cargar el catálogo.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const crear = async (e) => {
    e?.preventDefault()
    setSaving('nuevo')
    setError('')
    setOk('')
    try {
      await api.post('/api/admin/housing-types', {
        slug: nuevo.slug.trim().toUpperCase(),
        nombre_visible: nuevo.nombre_visible.trim(),
        descripcion_tooltip: nuevo.descripcion_tooltip.trim() || null,
        icono: nuevo.icono.trim() || null,
        esta_activo: true,
      }, authHead(token))
      setNuevo({ slug: '', nombre_visible: '', descripcion_tooltip: '', icono: '' })
      setOk('Tipo creado y visible en filtros/publicar.')
      await cargar()
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo crear el tipo.')
    } finally {
      setSaving(null)
    }
  }

  const guardar = async (slug) => {
    setSaving(slug)
    setError('')
    setOk('')
    try {
      const d = edit[slug] || {}
      const r = await api.patch(`/api/admin/housing-types/${slug}`, {
        nombre_visible: (d.nombre_visible || '').trim() || undefined,
        descripcion_tooltip: (d.descripcion_tooltip || '').trim(),
        icono: (d.icono || '').trim(),
      }, authHead(token))
      setTipos((prev) => prev.map((t) => (t.slug === slug ? r.data : t)))
      setOk(`"${slug}" actualizado.`)
    } catch (err) {
      setError(err?.response?.data?.detail || `No se pudo guardar "${slug}".`)
    } finally {
      setSaving(null)
    }
  }

  const alternar = async (t) => {
    setSaving(t.slug)
    setError('')
    setOk('')
    try {
      const r = await api.patch(`/api/admin/housing-types/${t.slug}`, {
        esta_activo: !t.esta_activo,
      }, authHead(token))
      setTipos((prev) => prev.map((x) => (x.slug === t.slug ? r.data : x)))
      setOk(`"${t.slug}" ${r.data.esta_activo ? 'activado' : 'desactivado (lógico, sin romper avisos)'}.`)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo cambiar el estado.')
    } finally {
      setSaving(null)
    }
  }

  const eliminar = async (slug) => {
    setSaving(slug)
    setError('')
    setOk('')
    try {
      await api.delete(`/api/admin/housing-types/${slug}`, authHead(token))
      setABorrar(null)
      setOk(`"${slug}" eliminado.`)
      await cargar()
    } catch (err) {
      const status = err?.response?.status
      setError(status === 409
        ? `No se puede eliminar "${slug}": tiene avisos publicados (desactívalo en su lugar).`
        : (err?.response?.data?.detail || 'No se pudo eliminar.'))
      setABorrar(null)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="container-main py-6 md:py-8">
      <BreadcrumbsAdmin actual="Tipos de vivienda" volverA="/admin/dashboard" volverTexto="Panel" />
      <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 mb-1">
        🏠 Tipos de vivienda
      </h1>
      <p className="text-xs text-neutral-400 mb-5">
        Catálogo dinámico de filtros y publicación. Desactivar oculta el tipo sin romper avisos pasados.
      </p>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}
      {ok && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mb-4" role="status">{ok}</p>}

      <form onSubmit={crear} className="card p-4 mb-4 space-y-3" aria-label="Crear tipo de vivienda">
        <h2 className="text-sm font-bold text-navy-800">Nuevo tipo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            aria-label="Slug del nuevo tipo"
            placeholder="SLUG_EJEMPLO"
            value={nuevo.slug}
            onChange={(e) => setNuevo({ ...nuevo, slug: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 40) })}
            className="input-field font-mono"
            required
            minLength={3}
            maxLength={40}
          />
          <input
            aria-label="Nombre visible del nuevo tipo"
            placeholder="Nombre visible"
            value={nuevo.nombre_visible}
            onChange={(e) => setNuevo({ ...nuevo, nombre_visible: e.target.value.slice(0, 80) })}
            className="input-field"
            required
            minLength={3}
            maxLength={80}
          />
          <input
            aria-label="Descripción del nuevo tipo"
            placeholder="Descripción (tooltip, opcional)"
            value={nuevo.descripcion_tooltip}
            onChange={(e) => setNuevo({ ...nuevo, descripcion_tooltip: e.target.value.slice(0, 500) })}
            className="input-field"
          />
          <input
            aria-label="Icono del nuevo tipo"
            placeholder="Icono (emoji, opcional)"
            value={nuevo.icono}
            onChange={(e) => setNuevo({ ...nuevo, icono: e.target.value.slice(0, 20) })}
            className="input-field"
          />
        </div>
        <button
          type="submit"
          disabled={saving === 'nuevo'}
          className="px-4 py-2 bg-navy-800 text-white text-xs font-semibold rounded-md hover:bg-navy-900 transition disabled:opacity-50"
        >
          {saving === 'nuevo' ? 'Creando…' : 'Crear tipo'}
        </button>
      </form>

      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="Cargando tipos">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-neutral-150 rounded-xl" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          {tipos.map((t) => {
            const d = edit[t.slug] || {}
            return (
              <li key={t.slug} className={`card p-4 space-y-2 ${t.esta_activo ? '' : 'opacity-70'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-navy-800">{t.slug}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${t.esta_activo ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
                    {t.esta_activo ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => alternar(t)}
                    disabled={saving === t.slug}
                    aria-label={t.esta_activo ? `Desactivar ${t.slug}` : `Activar ${t.slug}`}
                    className="px-3 py-1.5 min-h-[44px] text-xs font-semibold rounded-md border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {t.esta_activo ? 'Desactivar' : 'Activar'}
                  </button>
                  {aBorrar === t.slug ? (
                    <>
                      <button
                        type="button"
                        onClick={() => eliminar(t.slug)}
                        disabled={saving === t.slug}
                        aria-label={`Confirmar eliminar ${t.slug}`}
                        className="px-3 py-1.5 min-h-[44px] text-xs font-bold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button type="button" onClick={() => setABorrar(null)} className="text-xs text-neutral-500 hover:underline">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setABorrar(t.slug)}
                      aria-label={`Eliminar ${t.slug}`}
                      className="px-3 py-1.5 min-h-[44px] text-xs font-semibold rounded-md text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    aria-label={`Nombre visible de ${t.slug}`}
                    value={d.nombre_visible ?? ''}
                    onChange={(e) => setEdit({ ...edit, [t.slug]: { ...d, nombre_visible: e.target.value } })}
                    className="input-field text-xs"
                  />
                  <input
                    aria-label={`Descripción de ${t.slug}`}
                    value={d.descripcion_tooltip ?? ''}
                    onChange={(e) => setEdit({ ...edit, [t.slug]: { ...d, descripcion_tooltip: e.target.value } })}
                    className="input-field text-xs"
                    placeholder="Tooltip"
                  />
                  <div className="flex gap-2">
                    <input
                      aria-label={`Icono de ${t.slug}`}
                      value={d.icono ?? ''}
                      onChange={(e) => setEdit({ ...edit, [t.slug]: { ...d, icono: e.target.value } })}
                      className="input-field text-xs"
                      placeholder="🏠"
                    />
                    <button
                      type="button"
                      onClick={() => guardar(t.slug)}
                      disabled={saving === t.slug}
                      aria-label={`Guardar ${t.slug}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md bg-navy-800 text-white hover:bg-navy-900 disabled:opacity-50 shrink-0"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
