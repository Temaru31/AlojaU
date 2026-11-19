// Selector de tipo de vivienda del formulario de publicación (catálogo dinámico).
import useTiposVivienda from '../../hooks/useTiposVivienda'
import TipoIcono from '../../components/TipoIcono'






// Selector dinámico (/config-publica con fallback local). Mantiene el
// contrato (value slug) y muestra tooltip por opción vía `title`.
export default function SelectorTipoPublicar({ value, onChange, id = 'tipo-vivienda' }) {
  const { tipos } = useTiposVivienda()
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="select-field"
      required
      aria-label="Tipo de vivienda"
    >
      {tipos.map((t) => (
        <option key={t.slug} value={t.slug} title={t.descripcion_tooltip || ''}>
          <TipoIcono icono={t.icono} className="w-4 h-4" />{t.nombre_visible || t.slug}
        </option>
      ))}
    </select>
  )
}
