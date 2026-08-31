// HU-007: Índice 0-100 con desglose 40+20+15+15+10 Tabla14:25
// No es garantía -> disclaimer obligatorio
export default function IndiceConfianza({ indice=0, desglose={} }) {
  const color = indice>=80?'text-green-600':indice>=50?'text-yellow-600':'text-orange-600'
  const bg = indice>=80?'bg-green-500':indice>=50?'bg-yellow-500':'bg-orange-500'
  return (
    <div className="border rounded p-3 bg-white">
      <div className="flex items-center gap-2">
        <div className={`w-12 h-12 rounded-full ${bg} text-white flex items-center justify-center font-bold`}>{indice}</div>
        <div><p className={`font-bold ${color}`}>{indice>=80?'Alto':indice>=50?'Medio':'Básico'}</p><p className="text-xs text-gray-500">0-49 Básico • 50-79 Medio • 80-100 Alto</p></div>
      </div>
      <ul className="text-xs mt-2 space-y-1">
        <li>Completitud: {desglose.completitud||0}/40</li>
        <li>Tel validado: {desglose.telefono||0}/20</li>
        <li>Fotos ≥3: {desglose.fotos||0}/15</li>
        <li>Vigencia 30d: {desglose.vigencia||0}/15</li>
        <li>Sin reportes: {desglose.reportes||0}/10</li>
      </ul>
      <p className="text-[11px] text-orange-600 mt-2">⚠ Informativo, no garantiza seguridad. Verificar antes de pagar.</p>
    </div>
  )
}
