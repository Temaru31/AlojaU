import { useState } from 'react'

export default function Publicar() {
  const [submitted, setSubmitted] = useState(false)

  return (
    <div className="container-main py-8 md:py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
            <a href="/" className="hover:text-navy-600 transition-colors">Buscar</a>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-neutral-600">Publicar</span>
          </nav>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-2">
            Publicar vivienda
          </h1>
          <p className="text-sm text-neutral-500">
            Completa los datos de tu habitacion o apartaestudio. La publicacion pasara a estado PENDIENTE hasta ser revisada.
          </p>
        </div>

        {submitted ? (
          <div className="card p-10 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="font-display font-bold text-navy-900 mb-1">Enviado correctamente</h3>
            <p className="text-sm text-neutral-500 mb-4">Tu publicacion esta en estado PENDIENTE.</p>
            <button onClick={() => setSubmitted(false)} className="btn-secondary">
              Publicar otra vivienda
            </button>
          </div>
        ) : (
          <form
            className="card p-6 md:p-8 space-y-5"
            onSubmit={e => { e.preventDefault(); setSubmitted(true) }}
          >
            {/* Titulo */}
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Titulo de la publicacion</label>
              <input
                placeholder="Ej: Habitacion amoblada cerca al Tulcan"
                className="input-field"
                required
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Tipo de vivienda</label>
              <select className="select-field" required>
                <option value="">Selecciona un tipo</option>
                <option value="HABITACION_FAMILIAR">Habitacion familiar</option>
                <option value="HABITACION_INDEPENDIENTE">Habitacion independiente</option>
                <option value="APARTAESTUDIO">Apartaestudio</option>
                <option value="COMPARTIDO">Compartido</option>
              </select>
            </div>

            {/* Precio */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Canon mensual (COP)</label>
                <input
                  type="number"
                  placeholder="450000"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1.5">Deposito</label>
                <input
                  type="number"
                  placeholder="0 si no aplica"
                  className="input-field"
                />
              </div>
            </div>

            {/* Reglas */}
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Reglas de convivencia</label>
              <textarea
                placeholder="Describe las reglas de convivencia..."
                rows={3}
                className="input-field resize-none"
              />
            </div>

            {/* Direccion */}
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Direccion referencial</label>
              <input
                placeholder="No compartas tu direccion exacta"
                className="input-field"
                required
              />
            </div>

            {/* Fotos */}
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1.5">Fotos (minimo 3)</label>
              <div className="border-2 border-dashed border-neutral-200 rounded-lg p-6 text-center hover:border-navy-300 transition-colors cursor-pointer">
                <svg className="w-8 h-8 text-neutral-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-neutral-500">Arrastra fotos aqui o haz clic para seleccionar</p>
                <p className="text-xs text-neutral-400 mt-1">JPG, PNG — max 5MB c/u</p>
              </div>
              <input type="file" multiple accept="image/*" className="hidden" />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button type="submit" className="btn-accent w-full justify-center">
                Enviar a revision
              </button>
              <p className="text-xs text-neutral-400 text-center mt-3">
                Requiere cuenta de arrendador. Estado inicial: PENDIENTE.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
