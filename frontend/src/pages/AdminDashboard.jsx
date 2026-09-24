// AdminDashboard - panel maestro /admin/dashboard (solo ADMIN, ver ProtectedAdminRoute).
// a) Métricas globales, b) accesos a moderación (reportes + pendientes),
// c) control maestro por aviso: Aprobar / Rechazar / Eliminar (2 pasos).
// Uso: ruta /admin/dashboard. Ej: métricas {total_publicaciones, pendientes, ...}.
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const authHead = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

function Stat({ label, value, tone }) {
  const tones = {
    navy: 'bg-navy-50 border-navy-100 text-navy-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone] || tones.navy}`}>
      <p className="text-2xl font-extrabold">{value ?? '—'}</p>
      <p className="text-[11px] font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  )
}

// Claves internas de PostgreSQL -> etiquetas de dominio.
const SETTING_LABELS = {
  dias_vigencia_publicacion: {
    titulo: 'Días de vigencia por aviso',
    leyenda: 'Duración estándar en días antes de que una publicación pase a expirada',
  },
  auto_aprobar_arrendadores_verificados: {
    titulo: 'Aprobación automática a verificados',
    leyenda: 'Permite que usuarios con teléfono verificado publiquen sin pasar por cola de moderación',
  },
  max_reportes_para_pausa_automatica: {
    titulo: 'Límite de reportes para pausa',
    leyenda: 'Número de denuncias pendientes necesarias para suspender temporalmente un aviso',
  },
  moderacion_automatica: {
    titulo: 'Moderación automática (IA)',
    leyenda: 'Si está ON, las reglas + heurística pueden aprobar avisos sin revisión humana',
  },
  umbral_aprobacion_ia: {
    titulo: 'Umbral de aprobación IA',
    leyenda: 'Score mínimo 0-1 para auto-aprobar (ej. 0.85)',
  },
  dias_desactualizada: {
    titulo: 'Días para badge Desactualizada',
    leyenda: 'Desde la última renovación, el aviso muestra insignia de desactualizado',
  },
  titulo_min: { titulo: 'Título: mínimo', leyenda: 'Caracteres mínimos del título' },
  titulo_max: { titulo: 'Título: máximo', leyenda: 'Caracteres máximos del título' },
  descripcion_min: { titulo: 'Descripción: mínimo', leyenda: 'Caracteres mínimos de la descripción' },
  descripcion_max: { titulo: 'Descripción: máximo', leyenda: 'Caracteres máximos de la descripción' },
  fotos_min_publicar: { titulo: 'Fotos mínimas', leyenda: 'Fotos mínimas exigidas al publicar' },
  palabras_prohibidas: { titulo: 'Palabras prohibidas', leyenda: 'Spam separado por comas para la automoderación' },
  vistas_visibles_publico: {
    titulo: 'Vistas visibles para visitantes',
    leyenda: 'ON: todo visitante ve el contador. OFF: solo el dueño y el admin',
  },
}

// v15.x: secciones del panel (agrupan por `seccion` del backend; sin sección -> General).
const SECCIONES = {
  publicaciones: { titulo: '📰 Publicaciones y contenido', hint: 'Límites de texto, fotos y vigencia de avisos.' },
  moderacion: { titulo: '🛡️ Moderación y auto-moderación', hint: 'Reglas automáticas, umbrales e IA.' },
  visibilidad: { titulo: '👁️ Visibilidad', hint: 'Qué ve cada rol en la plataforma.' },
  general: { titulo: '⚙️ General', hint: 'Otros ajustes del sistema.' },
}

function seccionDe(s) {
  return SECCIONES[s.seccion] ? s.seccion : 'general'
}

function etiquetaSetting(s) {
  const m = SETTING_LABELS[s.clave]
  if (m) return m
  const titulo = s.clave.replace(/_/g, ' ')
  return { titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), leyenda: s.descripcion || '' }
}

// Gestor visual de system_settings (GET/PATCH /api/admin/automation/settings).
function AjustesSistema({ token }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(null)
  const [draft, setDraft] = useState({})

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get('/api/admin/automation/settings', authHead(token))
      setSettings(r.data)
      const d = {}
      for (const s of r.data) d[s.clave] = s.valor
      setDraft(d)
    } catch (err) {
      setError(err?.response?.status === 401 || err?.response?.status === 403
        ? 'Sin permiso de administrador.'
        : 'No se pudieron cargar los ajustes.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { if (token) cargar() }, [cargar, token])

  const guardar = async (clave) => {
    setSaving(clave)
    setError('')
    setOk('')
    try {
      const r = await api.patch(`/api/admin/automation/settings/${clave}`, { valor: String(draft[clave] ?? '') }, authHead(token))
      setSettings((prev) => (prev || []).map((s) => (s.clave === clave ? r.data : s)))
      setDraft((d) => ({ ...d, [clave]: r.data.valor }))
      setOk(`"${etiquetaSetting(r.data).titulo}" guardado.`)
    } catch (err) {
      setError(err?.response?.data?.detail || `No se pudo guardar "${etiquetaSetting({ clave }).titulo}".`)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <div className="card p-8 animate-pulse space-y-3"><div className="h-5 bg-neutral-150 rounded w-1/3" /><div className="h-10 bg-neutral-100 rounded" /><div className="h-10 bg-neutral-100 rounded" /></div>
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error}</p>}
      {ok && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2" role="status">{ok}</p>}
      {Object.keys(SECCIONES).filter(sec => (settings || []).some(s => seccionDe(s) === sec)).map((sec) => (
        <section key={sec} aria-label={SECCIONES[sec].titulo} className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-navy-900">{SECCIONES[sec].titulo}</h3>
            <p className="text-[11px] text-neutral-400">{SECCIONES[sec].hint}</p>
          </div>
          {(settings || []).filter(s => seccionDe(s) === sec).map((s) => {
        const meta = etiquetaSetting(s)
        const modificado = String(draft[s.clave] ?? '') !== String(s.valor)
        const guardando = saving === s.clave
        return (
        <article key={s.clave} className="card p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-800">{meta.titulo}</p>
              {meta.leyenda && <p className="text-[11px] text-neutral-400 mt-0.5">{meta.leyenda}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {s.tipo === 'bool' ? (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className={`text-[11px] font-bold ${String(draft[s.clave]) === 'true' ? 'text-emerald-700' : 'text-neutral-400'}`}>
                    {String(draft[s.clave]) === 'true' ? 'ON' : 'OFF'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={String(draft[s.clave]) === 'true'}
                    aria-label={meta.titulo}
                    onClick={() => setDraft((d) => ({ ...d, [s.clave]: String(d[s.clave]) === 'true' ? 'false' : 'true' }))}
                    className={`relative w-11 h-7 rounded-full transition ${String(draft[s.clave]) === 'true' ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                  >
                    <span aria-hidden="true" className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${String(draft[s.clave]) === 'true' ? 'left-[22px]' : 'left-1'}`} />
                  </button>
                </span>
              ) : s.tipo === 'float' ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  aria-label={meta.titulo}
                  value={draft[s.clave] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.clave]: e.target.value }))}
                  className="input-field w-28"
                />
              ) : s.tipo === 'str' ? (
                <input
                  type="text"
                  aria-label={meta.titulo}
                  value={draft[s.clave] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.clave]: e.target.value }))}
                  className="input-field w-64"
                  maxLength={2000}
                />
              ) : (
                <input
                  type="number"
                  aria-label={meta.titulo}
                  value={draft[s.clave] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.clave]: e.target.value }))}
                  className="input-field w-28"
                />
              )}
              <button
                type="button"
                onClick={() => guardar(s.clave)}
                disabled={guardando || !modificado}
                aria-label={`Guardar ${meta.titulo}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${modificado
                  ? 'bg-navy-800 text-white shadow hover:bg-navy-900'
                  : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  } disabled:cursor-wait`}
              >
                {guardando && (
                  <svg aria-hidden="true" className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </article>
        )
      })}
        </section>
      ))}
      {settings && settings.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-neutral-700">Sin ajustes configurados</p>
          <p className="text-xs text-neutral-400">Aplica la migración 005_admin_automation.</p>
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { token } = useAuth()
  const [tab, setTab] = useState('moderacion')
  const [metricas, setMetricas] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [totalPen, setTotalPen] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const cargar = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [m, p] = await Promise.all([
        api.get('/api/admin/metricas', authHead(token)),
        api.get('/api/admin/pendientes', { params: { size: 10 }, ...authHead(token) }),
      ])
      setMetricas(m.data)
      setPendientes(p.data.items || [])
      setTotalPen(p.data.total || 0)
    } catch (err) {
      setError(err?.response?.status === 401 || err?.response?.status === 403
        ? 'Sin permiso de administrador.'
        : 'No se pudo cargar el panel.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const cambiarEstado = async (id, estado) => {
    setActing(id)
    setError('')
    try {
      await api.patch(`/api/admin/publicaciones/${id}`, { estado }, authHead(token))
      await cargar()
    } catch {
      setError('No se pudo cambiar el estado.')
    } finally {
      setActing(null)
    }
  }

  const eliminar = async (id) => {
    setActing(id)
    setError('')
    try {
      await api.delete(`/api/admin/publicaciones/${id}`, authHead(token))
      setConfirmDel(null)
      await cargar()
    } catch {
      setError('No se pudo eliminar.')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="container-main py-6 md:py-8">
      <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
        <Link to="/" className="hover:text-navy-600">Buscar</Link>
        <span>›</span>
        <span className="text-neutral-600">Panel admin</span>
      </nav>
      <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 mb-1">
        🛡️ Panel Administrador
      </h1>
      <p className="text-xs text-neutral-400 mb-5">Métricas, moderación, avisos y ajustes del sistema.</p>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}

      <div className="flex gap-1 border-b border-neutral-150 mb-5" role="tablist" aria-label="Secciones del panel">
        {[
          { id: 'moderacion', label: '🛡️ Moderación' },
          { id: 'ajustes', label: '⚙️ Ajustes del Sistema' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition ${tab === t.id
              ? 'border-gold-400 text-navy-900'
              : 'border-transparent text-neutral-400 hover:text-navy-700'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ajustes' ? (
        <AjustesSistema token={token} />
      ) : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-neutral-150 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Alojamientos" value={metricas?.total_publicaciones} tone="navy" />
            <Stat label="Pendientes" value={metricas?.pendientes} tone="amber" />
            <Stat label="Reportes activos" value={metricas?.reportes_activos} tone="red" />
            <Stat label="Verificados" value={metricas?.arrendadores_verificados} tone="emerald" />
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Link to="/admin/reportes" className="btn-ghost text-xs">
              🚩 Bandeja de reportes{metricas?.reportes_pendientes ? ` (${metricas.reportes_pendientes})` : ''}
            </Link>
            <button type="button" onClick={cargar} className="btn-ghost text-xs">Recargar</button>
          </div>

          <h2 className="text-sm font-bold text-navy-800 mb-3">
            Pendientes de revisión {totalPen > 0 && <span className="font-normal text-neutral-400">({totalPen})</span>}
          </h2>
          {pendientes.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm font-medium text-neutral-700">Sin pendientes 🎉</p>
              <p className="text-xs text-neutral-400">No hay avisos por revisar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendientes.map((p) => (
                <article key={p.id} className="card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy-800 truncate">{p.titulo}</p>
                      <p className="text-[11px] text-neutral-400">
                        #{p.id} · {p.canon_mensual != null ? `$${Number(p.canon_mensual).toLocaleString('es-CO')}` : 's/canon'} · dueño #{p.usuario_id} · confianza {p.indice_confianza ?? 0}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link to={`/publicacion/${p.id}`} className="text-xs text-navy-600 hover:underline">Ver</Link>
                      <button type="button"
                        onClick={() => cambiarEstado(p.id, 'ACTIVO')}
                        disabled={acting === p.id}
                        aria-label={`Aprobar aviso ${p.id}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Aprobar
                      </button>
                      <button type="button"
                        onClick={() => cambiarEstado(p.id, 'RECHAZADO')}
                        disabled={acting === p.id}
                        aria-label={`Rechazar aviso ${p.id}`}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      {confirmDel === p.id ? (
                        <>
                          <button type="button"
                            onClick={() => eliminar(p.id)}
                            disabled={acting === p.id}
                            aria-label={`Confirmar eliminar aviso ${p.id}`}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button type="button" onClick={() => setConfirmDel(null)} className="text-xs text-neutral-500 hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button type="button"
                          onClick={() => setConfirmDel(p.id)}
                          aria-label={`Eliminar aviso ${p.id}`}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
