// Tarjeta KPI con ayuda contextual.
import InfoTooltip from '../../components/InfoTooltip'






// Tarjetas KPI con ayuda contextual (datos en vivo de /api/admin/metricas).
export default function Stat({ label, value, tone, ayuda }) {
  const tones = {
    navy: 'bg-navy-50 border-navy-100 text-navy-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone] || tones.navy}`}>
      <p className="text-2xl font-extrabold">{value ?? '—'}</p>
      <p className="text-[11px] font-medium opacity-80 mt-0.5 inline-flex items-center gap-1 justify-center">
        {label}
        {ayuda && <InfoTooltip texto={ayuda} />}
      </p>
    </div>
  )
}
