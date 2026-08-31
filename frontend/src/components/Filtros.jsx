// HU-002: Filtros combinables precio, tipo, servicios
export default function Filtros({ filtros, setFiltros }) {
  return (
    <div className="bg-white p-3 rounded shadow flex flex-wrap gap-2">
      <input type="number" placeholder="Min COP" className="border rounded px-2 py-1 w-32" value={filtros.min||''} onChange={e=>setFiltros({...filtros,min:e.target.value})} />
      <input type="number" placeholder="Max COP" className="border rounded px-2 py-1 w-32" value={filtros.max||''} onChange={e=>setFiltros({...filtros,max:e.target.value})} />
      <select className="border rounded px-2 py-1" onChange={e=>setFiltros({...filtros,tipo:e.target.value})}>
        <option value="">Tipo</option><option>HABITACION_FAMILIAR</option><option>APARTAESTUDIO</option><option>COMPARTIDO</option>
      </select>
      <label className="text-xs flex items-center gap-1"><input type="checkbox" /> WiFi</label>
      <button className="ml-auto text-xs bg-indigo-600 text-white px-3 py-1 rounded" onClick={()=>setFiltros({})}>Limpiar</button>
    </div>
  )
}
