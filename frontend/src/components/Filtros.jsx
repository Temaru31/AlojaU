// HU-002: Filtros combinables precio, tipo, servicios - FIX responsive + overflow
export default function Filtros({ filtros, setFiltros }) {
  return (
    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-center">
        <input type="number" placeholder="Min COP" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-32 min-w-0 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={filtros.min||''} onChange={e=>setFiltros({...filtros,min:e.target.value})} />
        <input type="number" placeholder="Max COP" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-32 min-w-0 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={filtros.max||''} onChange={e=>setFiltros({...filtros,max:e.target.value})} />
        <select aria-label="Filtrar por tipo" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-auto min-w-0 col-span-2 sm:col-span-1 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={filtros.tipo||''} onChange={e=>setFiltros({...filtros,tipo:e.target.value})}>
          <option value="">Tipo</option><option value="HABITACION_FAMILIAR">Habitación familiar</option><option value="HABITACION_INDEPENDIENTE">Habitación independiente</option><option value="APARTAESTUDIO">Apartaestudio</option><option value="COMPARTIDO">Compartido</option>
        </select>
        <label className="text-xs sm:text-sm flex items-center gap-1.5 col-span-1 sm:col-auto select-none cursor-pointer">
          <input type="checkbox" className="rounded" checked={filtros.servicios==='1'} onChange={e=> setFiltros({...filtros, servicios: e.target.checked ? '1' : undefined})} />
          WiFi
        </label>
        <button className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium sm:ml-auto col-span-1 sm:col-auto w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={()=>setFiltros({})}>Limpiar</button>
      </div>
    </div>
  )
}
