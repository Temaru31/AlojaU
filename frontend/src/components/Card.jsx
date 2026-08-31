// HU-001/003: Tarjeta de publicación con índice de confianza
// Props: pub = {id, titulo, canon, zona, dist_m, indice_confianza, fotos}
export default function Card({ pub }) {
  const color = pub.indice_confianza >= 80 ? 'bg-green-100 text-green-700' : pub.indice_confianza >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
  return (
    <div className="bg-white rounded shadow p-4 hover:shadow-md transition">
      <div className="flex justify-between">
        <span className={`text-xs px-2 py-1 rounded ${color}`}>Confianza {pub.indice_confianza} • {pub.indice_confianza>=80?'Alto':pub.indice_confianza>=50?'Medio':'Básico'}</span>
        <span className="text-xs text-gray-500">{pub.dist_m}m • {pub.zona}</span>
      </div>
      <h3 className="font-semibold mt-2">{pub.titulo}</h3>
      <p className="text-indigo-600 font-bold">${pub.canon?.toLocaleString()} COP/mes</p>
      <p className="text-xs text-gray-400">{pub.fotos} fotos • ACTIVO • Vigencia 30d</p>
    </div>
  )
}
