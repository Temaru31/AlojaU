import PreferenceChip from '../../components/PreferenceChip'
import { Sparkles, User } from 'lucide-react'
import { TAGS_DISPONIBLES } from '../../utils/perfil'
import ContactoSeccion from './ContactoSeccion'

function TusPreferencias({ borrador, onToggleTag, onIrARoomie }) {
  return (
    // M3 "Tus Preferencias": SOLO filtros.* (sin Estudiante ni demográficos Ley 1581).
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
      <h3 className="text-xs sm:text-sm font-semibold text-navy-900">
        Tus Preferencias
        {borrador.tagsDirty && <span className="ml-2 font-semibold text-amber-700">· sin guardar</span>}
      </h3>
      <p className="text-xs text-neutral-500">
        Opcionales y revocables: solo hábitos de convivencia (filtros.*). Nada sensible ni demográfico.
      </p>
      <div className="flex flex-wrap gap-2">
        {TAGS_DISPONIBLES.map(t => (
          <PreferenceChip
            key={t.key}
            icono={t.icono}
            titulo={t.label}
            hint={t.hint}
            activa={!!borrador.tags[t.key]}
            onToggle={() => onToggleTag(t.key)}
          />
        ))}
      </div>

      {/* Acceso directo a Preferencias de Convivencia Roomie */}
      <div className="pt-2 border-t border-neutral-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-neutral-600">
          ¿Buscas compañero de habitación? Configura tus hábitos de convivencia para hacer match con otros estudiantes.
        </p>
        <button
          type="button"
          onClick={onIrARoomie}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-navy-900 bg-gold-400 hover:bg-gold-500 transition shrink-0 min-h-[36px]"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Perfil de Roomie
        </button>
      </div>
    </div>
  )
}

/** Pestaña "Datos y Verificación": identidad, contacto, presentación y etiquetas. */
export default function DatosTab({
  perfil, token, borrador, saving, setPerfil, onGuardar, onRecargarPerfil, onToggleTag, onIrARoomie,
}) {
  return (
    <div id="panel-datos" role="tabpanel" aria-labelledby="tab-datos" aria-label="Datos personales y contacto" tabIndex={0} className="space-y-4">
      {/* La identidad y el progreso viven en el sidebar (sin duplicados). */}
      <form onSubmit={onGuardar} className="space-y-4">
        <section aria-label="Identidad" className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><User aria-hidden="true" className="w-4 h-4" /> Identidad</h3>
          <div>
            <label htmlFor="perfil-nombre" className="block text-sm font-semibold text-navy-800 mb-1.5">Nombre completo</label>
            <input
              id="perfil-nombre"
              type="text"
              value={borrador.nombre}
              onChange={e => borrador.setNombre(e.target.value)}
              placeholder="Tu nombre y apellido"
              className="input-field"
              minLength={3}
              maxLength={150}
            />
          </div>
        </section>

        <ContactoSeccion
          perfil={perfil}
          token={token}
          borrador={borrador}
          setPerfil={setPerfil}
          onRecargarPerfil={onRecargarPerfil}
        />

        {/* Presentación: bio (la foto vive en el avatar superior, sin URL expuesta) */}
        <section aria-label="Presentación" className="card rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><Sparkles aria-hidden="true" className="w-4 h-4" /> Presentación</h3>
          <p className="text-xs text-neutral-500 -mt-2">Opcional. Cuéntales a otros quién eres y qué buscas.</p>
          <div>
            <label htmlFor="perfil-bio" className="block text-sm font-semibold text-navy-800 mb-1.5">Presentación <span className="text-neutral-400 font-normal">(opcional, máx 500)</span></label>
            <textarea
              id="perfil-bio"
              value={borrador.bio}
              onChange={e => borrador.setBio(e.target.value.slice(0, 500))}
              placeholder="Cuéntanos quién eres: estudio, hábitos, qué buscas…"
              rows={2}
              className="input-field resize-none"
            />
          </div>
        </section>

        <TusPreferencias borrador={borrador} onToggleTag={onToggleTag} onIrARoomie={onIrARoomie} />

        {/* Acciones alineadas abajo-derecha con acento y focus visible. */}
        <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-2">
          {borrador.sucio && !saving && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2.5 py-1 self-start sm:self-auto" role="status">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Tienes cambios pendientes sin guardar
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="btn-accent w-full sm:w-auto justify-center !py-3.5 !rounded-2xl !text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
