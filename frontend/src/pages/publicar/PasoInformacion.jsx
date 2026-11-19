// Paso 1 de Publicar: título, tipo, descripción, canon y depósito.
import ContadorCaracteres from '../../components/ContadorCaracteres'
import { LIMITES, estadoRango, RANGO_CLS } from '../../constants'

import InfoTooltip from '../../components/InfoTooltip'
import { soloDigitos } from '../../utils/publicar'
import SelectorTipoPublicar from './SelectorTipoPublicar'

export default function PasoInformacion({ form, setForm, errors, canonFormateado, depositoFormateado }) {
  return (
    <section aria-labelledby="paso1" className="card p-6 md:p-8 space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-7 h-7 rounded-full bg-navy-800 text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
        <div>
          <h2 id="paso1" className="font-semibold text-navy-900">Información principal</h2>
          <p className="text-xs text-neutral-400">Título, tipo y precio. El precio se formatea solo.</p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Titulo de la publicacion * <span className="text-neutral-400 font-normal">(10-150)</span></label>
        <div className="relative">
          <input
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            placeholder="Ej: Habitacion amoblada cerca al Tulcan"
            maxLength={LIMITES.titulo.max}
            aria-describedby="titulo-contador"
            className={`input-field ${errors.titulo ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.titulo.trim().length, LIMITES.titulo.min, LIMITES.titulo.max)]}`}
            required
          />
          <ContadorCaracteres id="titulo-contador" len={form.titulo.trim().length} min={LIMITES.titulo.min} max={LIMITES.titulo.max} />
        </div>
        {errors.titulo && <p className="text-xs text-red-600 mt-1">{errors.titulo}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">Descripcion * <span className="text-neutral-400 font-normal">(20-2000)</span></label>
        <div className="relative">
          <textarea
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
            rows={3}
            placeholder="Amoblada, baño privado, WiFi 200MB, cerca universidad..."
            maxLength={LIMITES.descripcion.max}
            aria-describedby="descripcion-contador"
            className={`input-field resize-none ${errors.descripcion ? '!border-red-300 !shadow-none' : RANGO_CLS[estadoRango(form.descripcion.trim().length, LIMITES.descripcion.min, LIMITES.descripcion.max)]}`}
          />
          <ContadorCaracteres id="descripcion-contador" len={form.descripcion.trim().length} min={LIMITES.descripcion.min} max={LIMITES.descripcion.max} />
        </div>
        {errors.descripcion && <p className="text-xs text-red-600 mt-1">{errors.descripcion}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1.5">
          <span className="inline-flex items-center gap-1.5">
            Tipo de vivienda *
            <InfoTooltip texto="Elige el tipo que mejor describe tu aviso. Pasa el cursor por cada opción para ver su descripción." />
          </span>
        </label>
        <SelectorTipoPublicar value={form.tipo_inmueble} onChange={(v) => setForm({ ...form, tipo_inmueble: v })} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5">Canon mensual (COP) *</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.canon_mensual}
            onChange={e => setForm({ ...form, canon_mensual: soloDigitos(e.target.value).slice(0, 8) })}
            placeholder="450000"
            className={`input-field ${errors.canon_mensual ? '!border-red-300 !shadow-none' : ''}`}
            required
          />
          {canonFormateado ? (
            <p className="text-xs text-emerald-700 font-semibold mt-1" aria-live="polite">{canonFormateado} COP/mes</p>
          ) : (
            <p className="text-[11px] text-neutral-400 mt-1">Escribe solo números, lo formateamos por ti.</p>
          )}
          {errors.canon_mensual && <p className="text-xs text-red-600 mt-1">{errors.canon_mensual}</p>}
          {!errors.canon_mensual && form.canon_mensual !== '' && Number(form.canon_mensual) > 0 && Number(form.canon_mensual) < 100000 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-1.5" role="status">
              ¿El precio es correcto? Recuerda ingresar el monto total mensual.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1.5">Deposito (0 si no aplica)</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.deposito_requerido}
            onChange={e => setForm({ ...form, deposito_requerido: soloDigitos(e.target.value).slice(0, 8) })}
            placeholder="0"
            className={`input-field ${errors.deposito_requerido ? '!border-red-300 !shadow-none' : ''}`}
          />
          {depositoFormateado && Number(form.deposito_requerido) > 0 && (
            <p className="text-xs text-neutral-500 mt-1" aria-live="polite">{depositoFormateado}</p>
          )}
          {errors.deposito_requerido && <p className="text-xs text-red-600 mt-1">{errors.deposito_requerido}</p>}
        </div>
      </div>
    </section>
  )
}
