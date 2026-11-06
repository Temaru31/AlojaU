// Paso 3 de Publicar: servicios, reglas de convivencia y fotos (con portada).
import UploadFotos from '../../components/UploadFotos'
import ContadorCaracteres from '../../components/ContadorCaracteres'
import { LIMITES, estadoRango, RANGO_CLS } from '../../constants'
import { SERVICIOS } from '../../utils/servicios'
import { ArrowRight, Star } from 'lucide-react'

import { iconoServicio } from '../../utils/publicar'

export default function PasoServiciosFotos({ form, setForm, errors, token, toggleArray, hacerPortada, quitarFotoUrl, setFotosPendientes }) {
  return (
    <section aria-labelledby="paso3" className="card p-6 md:p-8 space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-7 h-7 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">3</span>
        <div>
          <h2 id="paso3" className="font-semibold text-navy-900">Servicios, reglas y fotos</h2>
          <p className="text-xs text-neutral-400">Toca para elegir. La primera foto es la portada.</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Servicios *</label>
        <div className="flex flex-wrap gap-2 mt-1" role="group" aria-label="Servicios">
          {SERVICIOS.map(s => {
            const IconoServicio = iconoServicio(s.id, s.nombre)
            return (
              <label key={s.id} className={`text-xs sm:text-sm px-3 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-full border cursor-pointer select-none transition active:scale-[0.97] ${form.servicios_ids.includes(s.id) ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-neutral-200 text-neutral-600 hover:border-navy-300'}`}>
                <input type="checkbox" className="sr-only" checked={form.servicios_ids.includes(s.id)} onChange={() => toggleArray('servicios_ids', s.id)} />
                <IconoServicio aria-hidden="true" className="w-4 h-4" />
                {s.nombre}
              </label>
            )
          })}
        </div>
        {errors.servicios_ids && <p className="text-xs text-red-600 mt-1">{errors.servicios_ids}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Reglas de convivencia *</label>
        <div className="relative">
          <textarea
            value={form.reglas_convivencia}
            onChange={e => setForm({ ...form, reglas_convivencia: e.target.value })}
            placeholder="Describe las reglas de convivencia..."
            rows={3}
            maxLength={LIMITES.reglas.max}
            aria-describedby="reglas-contador"
            className={`input-field resize-none ${errors.reglas_convivencia ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.reglas_convivencia.trim().length, LIMITES.reglas.min, LIMITES.reglas.max)]}`}
          />
          <ContadorCaracteres id="reglas-contador" len={form.reglas_convivencia.trim().length} min={LIMITES.reglas.min} max={LIMITES.reglas.max} />
        </div>
        {errors.reglas_convivencia && <p className="text-xs text-red-600 mt-1">{errors.reglas_convivencia}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Fotos * <span className="text-neutral-400 font-normal">(3 a 10 fotos tuyas)</span></label>
        {/* El vaciado del uploader debe vaciar el formulario (respetar Limpiar). */}
        <UploadFotos token={token} initialUrls={form.fotos} onUrls={(urls) => setForm(f => ({ ...f, fotos: urls }))} onPendientes={setFotosPendientes} />
        {errors.fotos && <p className="text-xs text-red-600 mt-1">{errors.fotos}</p>}
        {/* Selector de portada: la primera es la que se ve en Buscar. */}
        {(form.fotos || []).filter(f => (f || '').trim() !== '').length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-navy-800 mb-2">Elige la portada (se muestra en Buscar):</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {(form.fotos || []).filter(f => (f || '').trim() !== '').map((url, idx) => (
                <div key={url} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${idx === 0 ? 'border-gold-400' : 'border-neutral-200'}`}>
                  <img src={url} alt={idx === 0 ? `Portada principal ${idx + 1}` : `Foto ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  {idx === 0 ? (
                    <span className="absolute top-1 left-1 bg-gold-400 text-navy-900 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"><Star aria-hidden="true" className="w-3 h-3 fill-current" /> Portada</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => hacerPortada(idx)}
                      aria-label={`Hacer portada la foto ${idx + 1}`}
                      className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-1 rounded hover:bg-navy-800"
                    >
                      Hacer portada
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => quitarFotoUrl(idx)}
                    aria-label={`Quitar foto ${idx + 1}`}
                    className="absolute top-1 right-1 bg-black/60 text-white text-xs w-6 h-6 rounded-full hover:bg-red-600 before:absolute before:-inset-2.5 before:content-['']"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-neutral-400 mt-2">Tip iPhone: si tu foto sale como .HEIC, cámbiala a JPG en Ajustes <ArrowRight aria-hidden="true" className="w-3 h-3 inline" /> Cámara <ArrowRight aria-hidden="true" className="w-3 h-3 inline" /> Formatos <ArrowRight aria-hidden="true" className="w-3 h-3 inline" /> Más compatible.</p>
      </div>
    </section>
  )
}
