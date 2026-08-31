// HU-007: Índice 0-100 con desglose 40+20+15+15+10 Tabla14:25 - FIX responsive + overflow
export default function IndiceConfianza({ indice=0, desglose={} }) {
  const color = indice>=80?'text-green-600':indice>=50?'text-yellow-600':'text-orange-600'
  const bg = indice>=80?'bg-green-500':indice>=50?'bg-yellow-500':'bg-orange-500'
  return (
    <div className="border border-gray-200 rounded-xl p-3 sm:p-4 bg-white min-w-0 overflow-hidden">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full ${bg} text-white flex items-center justify-center font-bold shrink-0 text-sm sm:text-base`}>{indice}</div>
        <div className="min-w-0"><p className={`font-bold text-sm sm:text-base truncate ${color}`}>{indice>=80?'Alto':indice>=50?'Medio':'Básico'}</p><p className="text-[11px] sm:text-xs text-gray-500 break-words">0-49 Básico • 50-79 Medio • 80-100 Alto</p></div>
      </div>
      <ul className="text-xs sm:text-sm mt-3 space-y-1.5 min-w-0">
        <li className="flex justify-between gap-2"><span>Completitud</span> <span className="font-medium">{desglose.completitud||0}/40</span></li>
        <li className="flex justify-between gap-2"><span>Tel validado</span> <span className="font-medium">{desglose.telefono||0}/20</span></li>
        <li className="flex justify-between gap-2"><span>Fotos ≥3</span> <span className="font-medium">{desglose.fotos||0}/15</span></li>
        <li className="flex justify-between gap-2"><span>Vigencia 30d</span> <span className="font-medium">{desglose.vigencia||0}/15</span></li>
        <li className="flex justify-between gap-2"><span>Sin reportes</span> <span className="font-medium">{desglose.reportes||0}/10</span></li>
      </ul>
      <p className="text-[11px] text-orange-600 mt-3 break-words leading-tight">⚠ Informativo, no garantiza seguridad. Verificar antes de pagar.</p>
    </div>
  )
}
