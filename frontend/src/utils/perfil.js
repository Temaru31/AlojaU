// Reglas puras del perfil: teléfono E.164, roles, preferencias y completitud.

// Indicativo +57 separado del número local (10 dígitos CO).
// canónico E.164: '+57' + local. Ej: '573001234567' <-> '3001234567'.
export function telefonoALocal(raw = '') {
  const d = String(raw || '').replace(/\D/g, '')
  return d.startsWith('57') && d.length > 10 ? d.slice(2) : d
}

export function telefonoAE164(local = '') {
  return `+57${telefonoALocal(local)}`
}

export const ROL_LABEL = {
  ESTUDIANTE: 'Usuario Base',
  ARRENDADOR: 'Arrendador Activo',
  ADMIN: 'Administrador',
  MODERADOR_CAMPUS: 'Moderador',
  AUDITOR_LEGAL: 'Auditor',
}

// "Tus Preferencias": 8 dimensiones universitarias, SOLO namespace
// filtros.* (válido por el backend: solo chequea prefijo, máx 30 claves).
// Ley 1581: nada sensible, sin "Estudiante" ni demográficos.
// roomie.*/notis.* siguen aceptados por el backend (retrocompatibilidad),
// pero la UI solo ofrece filtros.*. Iconos del set propio estilo Lucide.
// Etiquetas con sujeto explícito (soy/acepto vs busco/necesito): evitan el
// match ambiguo entre lo que el usuario ES y lo que BUSCA en un aviso.
export const TAGS_DISPONIBLES = [
  { key: 'filtros.mascotas', label: 'Acepto mascotas', hint: 'Convivo con mascotas (pet friendly)', icono: 'mascotas' },
  { key: 'filtros.tranquilo', label: 'Busco tranquilidad', hint: 'Prioridad estudio y descanso', icono: 'silencio' },
  { key: 'filtros.no_fumador', label: 'Soy no fumador', hint: 'Ambientes libres de humo', icono: 'humo' },
  { key: 'filtros.misma_facultad', label: 'Busco misma facultad', hint: 'Compartir con compañeros del campus', icono: 'facultad' },
  { key: 'filtros.cocina_equipada', label: 'Necesito cocina equipada', hint: 'Uso libre de cocina', icono: 'cocina' },
  { key: 'filtros.lavadora', label: 'Necesito zona de lavado', hint: 'Acceso a lavadora o lavandería', icono: 'lavado' },
  { key: 'filtros.sin_horario', label: 'Entrada libre 24/7', hint: 'Llave y acceso sin horario de cierre', icono: 'horario' },
  { key: 'filtros.parqueadero', label: 'Parqueadero moto/bici', hint: 'Espacio seguro para moto o bicicleta', icono: 'movilidad' },
]

// Barra gamificada con pesos explícitos (suma 100% exacto).
// - Correo verificado 20% · Teléfono 20% · Foto 20%
// - Presentación 15% · ≥1 preferencia 15% · Primer aviso (o ARRENDADOR) 10%
export const PESOS_PERFIL = {
  email: 20, telefono: 20, foto: 20, bio: 15, tags: 15, aviso: 10,
}

export function checklistPerfil(perfil, extra = {}) {
  const tieneAviso = !!extra.tieneAviso || perfil?.rol === 'ARRENDADOR' || perfil?.rol === 'ADMIN'
  const items = [
    { id: 'email', label: 'Correo verificado', peso: PESOS_PERFIL.email, ok: !!perfil?.email_verificado },
    { id: 'telefono', label: 'Teléfono vinculado', peso: PESOS_PERFIL.telefono, ok: !!perfil?.telefono_whatsapp },
    { id: 'foto', label: 'Foto de perfil subida', peso: PESOS_PERFIL.foto, ok: !!perfil?.foto_perfil_url },
    { id: 'bio', label: 'Presentación escrita', peso: PESOS_PERFIL.bio, ok: (perfil?.bio || '').trim().length > 0 },
    { id: 'tags', label: 'Al menos 1 preferencia', peso: PESOS_PERFIL.tags, ok: Object.values(perfil?.preferencias || {}).some(Boolean) },
    { id: 'aviso', label: 'Primer aviso publicado', peso: PESOS_PERFIL.aviso, ok: tieneAviso },
  ]
  const pct = items.reduce((acc, i) => acc + (i.ok ? i.peso : 0), 0)
  return { items, pct }
}

export function fortalezaPassword(pw) {
  return {
    longitud: pw.length >= 8,
    alfanumerica: /[A-Za-z]/.test(pw) && /[0-9]/.test(pw),
  }
}
