// ContadorCaracteres.jsx — Contador dinámico v15.2 (M6).
// Esquina inferior derecha "24 / 150" + color por rango (ok/cerca/mal).
// Uso: <ContadorCaracteres len={form.titulo.length} min={10} max={150} />
import { estadoRango } from '../constants'

const TEXTO_CLS = {
  ok: 'text-emerald-600',
  cerca: 'text-amber-600',
  mal: 'text-red-500',
}

export default function ContadorCaracteres({ len = 0, min = 0, max = null, id }) {
  const estado = estadoRango(len, min, max)
  return (
    <span
      id={id}
      aria-live="polite"
      aria-label={`${len} de ${max ?? 'sin límite'} caracteres`}
      className={`pointer-events-none absolute bottom-2 right-3 text-[11px] font-medium tabular-nums ${TEXTO_CLS[estado]}`}
    >
      {len}{max != null ? ` / ${max}` : ''}
    </span>
  )
}
