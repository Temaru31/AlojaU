// AdminDashboard - panel maestro /admin/dashboard (solo ADMIN, ver ProtectedAdminRoute).
// a) Métricas globales, b) accesos a moderación (reportes + pendientes),
// c) control maestro por aviso: Aprobar / Rechazar / Eliminar (2 pasos).
// Uso: ruta /admin/dashboard. Ej: métricas {total_publicaciones, pendientes, ...}.
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { formatearSesionFecha } from '../utils/sesion'
import { etiquetaEvento, describirAuditoria } from '../utils/historial'
import InfoTooltip from '../components/InfoTooltip'
import BreadcrumbsAdmin from '../components/BreadcrumbsAdmin'

const authHead = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

// M1: tarjetas KPI con ayuda contextual (datos en vivo de /api/admin/metricas).
function Stat({ label, value, tone, ayuda }) {
  const tones = {
    navy: 'bg-navy-50 border-navy-100 text-navy-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone] || tones.navy}`}>
      <p className="text-2xl font-extrabold">{value ?? '—'}</p>
      <p className="text-[11px] font-medium opacity-80 mt-0.5 inline-flex items-center gap-1 justify-center">
        {label}
        {ayuda && <InfoTooltip texto={ayuda} />}
      </p>
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

// M1: ayuda ampliada por ajuste (la leyenda corta vive en SETTING_LABELS).
const SETTING_AYUDA = {
  moderacion_automatica: 'Si está ON, las reglas + heurística pueden aprobar avisos sin revisión humana. Con OFF (recomendado al inicio), todo pasa por tu bandeja.',
  umbral_aprobacion_ia: 'Solo aplica con moderación automática ON. Más alto = más estricto (menos auto-aprobados).',
  auto_aprobar_arrendadores_verificados: 'PENDIENTE: aún no surte efecto en el flujo de publicación; hoy todos los avisos nacen PENDIENTE. Próximamente permitirá auto-aprobar a verificados.',
  vistas_visibles_publico: 'ON expone el contador a cualquier visitante. OFF (prudente) lo muestra solo al dueño y al admin.',
  max_reportes_para_pausa_automatica: 'Al alcanzar este número de reportes, el aviso se pausa solo y avisa en la bandeja.',
  titulo_min: 'Mínimo exigido al publicar y al editar (el formulario lo valida antes de enviar).',
  titulo_max: 'Máximo exigido al publicar y al editar.',
  descripcion_min: 'Mínimo exigido al publicar y al editar.',
  descripcion_max: 'Máximo exigido al publicar y al editar.',
  fotos_min_publicar: 'Fotos mínimas al publicar (el gestor de edición exige al menos 1).',
  dias_desactualizada: 'Días tras la renovación para mostrar el badge "Desactualizada" en el detalle.',
  dias_vigencia_publicacion: 'Vigencia estándar al publicar y al renovar (renovar suma 30 días).',
  palabras_prohibidas: 'Lista anti-spam de la automoderación, separada por comas.',
}

// Claves sin efecto real todavía (badge veraz, no roadmap inventado).
const SETTING_PENDIENTE = new Set(['auto_aprobar_arrendadores_verificados'])

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
              <p className="text-sm font-semibold text-navy-800 inline-flex items-center gap-1.5 flex-wrap">
                {meta.titulo}
                {SETTING_PENDIENTE.has(s.clave) && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                    PENDIENTE
                  </span>
                )}
                {SETTING_AYUDA[s.clave] && <InfoTooltip texto={SETTING_AYUDA[s.clave]} />}
              </p>
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
                    // M3 táctil: área 44px vía pseudo-elemento (sin deformar el track).
                    className={`relative w-11 h-7 rounded-full transition before:absolute before:-inset-2 before:content-[''] ${String(draft[s.clave]) === 'true' ? 'bg-emerald-500' : 'bg-neutral-300'}`}
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

// M4: historial de cambios (usa GET /api/admin/auditoria existente).
export function HistorialAdmin({ token }) {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const SIZE = 15

  const cargar = useCallback(async (p) => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const r = await api.get('/api/admin/auditoria', {
        params: { page: p, size: SIZE }, ...authHead(token),
      })
      setItems(r.data?.items || [])
      setTotal(r.data?.total || 0)
      setPages(Math.max(1, Math.ceil((r.data?.total || 0) / SIZE)))
    } catch {
      setError('No se pudo cargar el historial.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar(page) }, [cargar, page])

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error}</p>}
      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="Cargando historial">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-neutral-150 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-neutral-700">Sin actividad registrada</p>
          <p className="text-xs text-neutral-400">Las aprobaciones, ajustes y eliminaciones aparecerán aquí.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map(a => {
              const legible = describirAuditoria(a)
              const pid = a.publicacion_id
              // Publicación eliminada -> texto plano sin link (hard delete CASCADE).
              const puedeLinkear = pid != null && a.publicacion_existe !== false
              return (
                <li key={a.id} className="card p-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs font-bold text-navy-800 shrink-0 min-w-32">
                    {etiquetaEvento(a.evento)}
                  </span>
                  <span className="text-xs text-neutral-600 flex-1 min-w-0" title={a.detalle || legible}>
                    {legible}
                    {a.usuario_email && (
                      <span className="block text-[11px] text-neutral-400 truncate" title={a.usuario_email}>
                        por {a.usuario_email}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-400 shrink-0">
                    {pid != null ? (
                      puedeLinkear ? (
                        <Link
                          to={`/publicacion/${pid}`}
                          className="text-navy-600 underline decoration-navy-300 underline-offset-2 hover:text-navy-800"
                          aria-label={`Abrir aviso #${pid}`}
                        >
                          aviso #{pid}
                        </Link>
                      ) : (
                        <span title="Aviso eliminado">aviso #{pid} (eliminado)</span>
                      )
                    ) : null}
                    {pid != null ? ' · ' : ''}
                    {formatearSesionFecha(a.creado_en) || 'fecha desconocida'}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-200 disabled:opacity-40">
              ← Anterior
            </button>
            <span className="text-xs text-neutral-500">Página {page} de {pages} ({total})</span>
            <button type="button" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-200 disabled:opacity-40">
              Siguiente →
            </button>
          </div>
        </>
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

  const TAB_LABEL = { moderacion: 'Moderación', ajustes: 'Ajustes del Sistema', historial: 'Historial' }
  return (
    <div className="container-main py-6 md:py-8">
      <BreadcrumbsAdmin actual={TAB_LABEL[tab] || 'Moderación'} volverA="/" volverTexto="Inicio" />
      <h1 className="font-display text-xl md:text-2xl font-bold text-navy-900 mb-1">
        🛡️ Panel Administrador
      </h1>
      <p className="text-xs text-neutral-400 mb-5">Métricas, moderación, avisos y ajustes del sistema.</p>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4" role="alert">{error}</p>}

      <div className="flex gap-1 border-b border-neutral-150 mb-5" role="tablist" aria-label="Secciones del panel">
        {[
          { id: 'moderacion', label: '🛡️ Moderación' },
          { id: 'ajustes', label: '⚙️ Ajustes del Sistema' },
          { id: 'historial', label: '📜 Historial' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 -mb-px transition ${tab === t.id
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
      ) : tab === 'historial' ? (
        <HistorialAdmin token={token} />
      ) : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-neutral-150 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Stat label="Alojamientos" value={metricas?.total_publicaciones} tone="navy"
              ayuda="Avisos totales en plataforma (todos los estados, sin cuentas eliminadas)." />
            <Stat label="Usuarios" value={metricas?.total_usuarios} tone="navy"
              ayuda="Cuentas activas registradas (excluye eliminadas)." />
            <Stat
              label="Pendientes de revisión"
              value={metricas?.pendientes}
              tone="amber"
              ayuda={`Avisos en cola de moderación esperando aprobación o rechazo. Denuncias totales acumuladas: ${metricas?.reportes_activos ?? '—'} (pendientes o confirmadas) · Inmuebles con reportes pendientes: ${metricas?.inmuebles_con_reportes ?? '—'} (un mismo aviso puede tener varias denuncias).`}
            />
            <Stat label="Reportes activos" value={metricas?.reportes_activos} tone="red"
              ayuda={`Denuncias pendientes o confirmadas de la comunidad. Inmuebles distintos con pendientes: ${metricas?.inmuebles_con_reportes ?? '—'}.`} />
            <Stat label="Verificados" value={metricas?.arrendadores_verificados} tone="emerald"
              ayuda="Arrendadores con teléfono verificado por un administrador." />
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Link
              to="/admin/reportes"
              className="btn-ghost text-xs inline-flex items-center gap-2"
              aria-label={metricas?.reportes_pendientes ? `Bandeja de reportes, ${metricas.reportes_pendientes} pendientes` : 'Bandeja de reportes'}
            >
              🚩 Bandeja de reportes
              {(metricas?.reportes_pendientes ?? 0) > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-red-600 text-white text-[11px] font-extrabold shadow"
                  aria-label={`${metricas.reportes_pendientes} reportes pendientes`}
                >
                  {metricas.reportes_pendientes}
                </span>
              )}
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
