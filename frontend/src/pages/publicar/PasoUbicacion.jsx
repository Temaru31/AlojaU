// Paso 2 de Publicar: zona, dirección de referencia y punto en el mapa.
import MapPicker from '../../components/MapPicker'
import ZonaSelect from '../../components/ZonaSelect'
import { notifyToast } from '../../components/Toast'
import ContadorCaracteres from '../../components/ContadorCaracteres'
import { LIMITES, estadoRango, RANGO_CLS } from '../../constants'
import { MapPin } from 'lucide-react'


export default function PasoUbicacion({ form, setForm, errors }) {
  return (
    <section aria-labelledby="paso2" className="card p-6 md:p-8 space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-7 h-7 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
        <div>
          <h2 id="paso2" className="font-semibold text-navy-900">Ubicación &amp; mapa</h2>
          <p className="text-xs text-neutral-400">Barrio + punto en Popayán. Las distancias se calculan solas.</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5" htmlFor="zona-barrio">Zona / barrio *</label>
        <ZonaSelect
          value={{ zona_barrio_id: form.zona_barrio_id, barrio_texto: form.barrio_texto }}
          onChange={(z) => setForm({ ...form, zona_barrio_id: z.zona_barrio_id, barrio_texto: z.barrio_texto })}
          inputId="zona-barrio"
          error={errors.zona}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Direccion referencial *</label>
        <div className="relative">
          <input
            value={form.direccion_referencial}
            onChange={e => setForm({ ...form, direccion_referencial: e.target.value })}
            placeholder="No compartas tu direccion exacta"
            maxLength={LIMITES.direccion.max}
            aria-describedby="direccion-contador"
            className={`input-field ${errors.direccion_referencial ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.direccion_referencial.trim().length, LIMITES.direccion.min, LIMITES.direccion.max)]}`}
            required
          />
          <ContadorCaracteres id="direccion-contador" len={form.direccion_referencial.trim().length} min={LIMITES.direccion.min} max={LIMITES.direccion.max} />
        </div>
        {errors.direccion_referencial && <p className="text-xs text-red-600 mt-1">{errors.direccion_referencial}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Ubicación en mapa <span className="text-neutral-400 font-normal">(opcional, guarda coords directo)</span></label>
        <p className="text-[11px] text-neutral-400 mb-2">Ubicación de referencia en mapa detectada. Si el nombre del sector no coincide exactamente, selecciona o escribe el nombre correcto de tu barrio abajo.</p>
        <MapPicker
          lat={form.latitud}
          lng={form.longitud}
          onChange={(nuevaLat, nuevaLng) => setForm(f => ({ ...f, latitud: nuevaLat, longitud: nuevaLng }))}
          onAddressSuggestion={(dir) => setForm(f => ({
            ...f,
            direccion_referencial: f.direccion_referencial.trim().length >= 10 ? f.direccion_referencial : String(dir || '').slice(0, 200),
          }))}
          onGeoError={(msg) => notifyToast(msg)}
        />
      </div>

      {/* Coords vinculadas al mapa, sin cajas numéricas visibles. */}
      <div aria-live="polite">
        {form.latitud !== '' && form.longitud !== '' ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <p className="text-xs text-emerald-800 flex items-center gap-1">
              <MapPin aria-hidden="true" className="w-4 h-4" /> Ubicación confirmada: <b>{form.latitud}, {form.longitud}</b>
            </p>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, latitud: '', longitud: '' }))}
              className="text-xs font-medium text-emerald-700 hover:text-red-600 hover:underline shrink-0"
            >
              Quitar
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">
            Sin ubicación marcada: usa el mapa de arriba para fijar el punto (opcional).
          </p>
        )}
        {(errors.latitud || errors.longitud) && (
          <p className="text-xs text-red-600 mt-1">{errors.latitud || errors.longitud}</p>
        )}
      </div>
      <p className="text-xs text-neutral-500 bg-navy-50 border border-navy-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
        <MapPin aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" /> Las distancias a Tulcán, Torobajo, Centro y demás puntos se calculan solas con la ubicación que marques en el mapa.
      </p>
    </section>
  )
}
