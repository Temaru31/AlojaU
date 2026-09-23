// PasswordStrength.jsx — Indicador de fortaleza v13.
//
// Regla: mínimo 8 caracteres + mayúscula + número + carácter especial.
// Muestra 4 criterios en vivo (verde/gris) y barra de nivel.
// Uso: <PasswordStrength value={pw} /> (puro, sin side-effects).
export function criteriosPassword(pw = '') {
  const v = String(pw || '')
  return {
    longitud: v.length >= 8,
    mayuscula: /[A-Z]/.test(v),
    numero: /[0-9]/.test(v),
    especial: /[^A-Za-z0-9]/.test(v),
  }
}

export function passwordValidaV13(pw = '') {
  const c = criteriosPassword(pw)
  return c.longitud && c.mayuscula && c.numero && c.especial
}

export default function PasswordStrength({ value = '' }) {
  const c = criteriosPassword(value)
  const nivel = [c.longitud, c.mayuscula, c.numero, c.especial].filter(Boolean).length
  const pct = `${(nivel / 4) * 100}%`
  const color = nivel <= 1 ? 'bg-red-400' : nivel === 2 ? 'bg-amber-400' : nivel === 3 ? 'bg-yellow-500' : 'bg-emerald-500'
  const items = [
    [c.longitud, 'Mínimo 8 caracteres'],
    [c.mayuscula, 'Al menos una mayúscula (A-Z)'],
    [c.numero, 'Al menos un número (0-9)'],
    [c.especial, 'Al menos un carácter especial (!@#…)'],
  ]
  return (
    <div className="space-y-2">
      <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: pct }} />
      </div>
      <ul className="space-y-1 text-xs" aria-live="polite">
        {items.map(([ok, texto]) => (
          <li key={texto} className={ok ? 'text-emerald-700' : 'text-neutral-400'}>
            {ok ? '✓' : '•'} {texto}
          </li>
        ))}
      </ul>
    </div>
  )
}
