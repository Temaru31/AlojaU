// Panel de ajustes del sistema (system_settings) agrupados por sección.
import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import InfoTooltip from '../../components/InfoTooltip'
import { Eye, Newspaper, Settings, ShieldCheck } from 'lucide-react'
import { authHead } from '../../services/authHeaders'

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

// Ayuda ampliada por ajuste (la leyenda corta vive en SETTING_LABELS).
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
  publicaciones: { titulo: 'Publicaciones y contenido', icono: Newspaper, hint: 'Límites de texto, fotos y vigencia de avisos.' },
  moderacion: { titulo: 'Moderación y auto-moderación', icono: ShieldCheck, hint: 'Reglas automáticas, umbrales e IA.' },
  visibilidad: { titulo: 'Visibilidad', icono: Eye, hint: 'Qué ve cada rol en la plataforma.' },
  general: { titulo: 'General', icono: Settings, hint: 'Otros ajustes del sistema.' },
}

function IconoSeccion({ sec, className = 'w-4 h-4' }) {
  const Icono = SECCIONES[sec]?.icono
  if (!Icono) return null
  return <Icono aria-hidden="true" className={className} />
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
export default function AjustesSistema({ token }) {
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
            <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><IconoSeccion sec={sec} />{SECCIONES[sec].titulo}</h3>
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
                    // Táctil: área 44px vía pseudo-elemento (sin deformar el track).
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
