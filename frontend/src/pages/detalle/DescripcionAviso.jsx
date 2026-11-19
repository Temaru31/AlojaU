// Descripción del aviso, plegable si es larga.

























export default function DescripcionAviso({ descripcion, descExpandida, setDescExpandida }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-navy-800 mb-1.5">Descripción</h3>
      {descripcion ? (
        <div>
          <p className={`text-sm text-neutral-600 leading-relaxed whitespace-pre-line ${descExpandida ? '' : 'line-clamp-2'}`}>
            {descripcion}
          </p>
          {descripcion.length > 180 && (
            <button
              type="button"
              onClick={() => setDescExpandida(v => !v)}
              className="mt-2 text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
              aria-expanded={descExpandida}
            >
              {descExpandida ? 'Leer menos' : 'Leer más'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">El arrendador aún no agregó una descripción.</p>
      )}
    </div>
  )
}
