// Paginación limpia - HU-001/002 con URL state
export default function Paginacion({ page=1, pages=1, total=0, onPage }){
  if(pages <= 1) return (
    <p className="text-xs text-gray-400 text-center py-2">Mostrando {total} resultado{total!==1?'s':''}</p>
  )
  const prev = page > 1 ? page -1 : null
  const next = page < pages ? page +1 : null
  // genera 5 páginas alrededor de la actual
  const start = Math.max(1, page -2)
  const end = Math.min(pages, start +4)
  const nums = []
  for(let i=start;i<=end;i++) nums.push(i)

  return (
    <nav className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t border-gray-100 mt-2" aria-label="Paginación">
      <p className="text-xs sm:text-sm text-gray-500">Total {total} • Página {page} de {pages}</p>
      <div className="flex items-center gap-1.5">
        <button disabled={!prev} onClick={()=> prev && onPage(prev)} className="px-3 py-1.5 text-xs sm:text-sm rounded-lg border bg-white border-gray-200 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">Anterior</button>
        {start > 1 && (<><button onClick={()=> onPage(1)} className="px-2.5 py-1.5 text-xs rounded-lg border bg-white border-gray-200 hover:bg-gray-50">1</button><span className="text-gray-400">…</span></>)}
        {nums.map(n=>(
          <button key={n} onClick={()=> onPage(n)} aria-current={n===page ? 'page':undefined} className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-lg border ${n===page ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>{n}</button>
        ))}
        {end < pages && (<><span className="text-gray-400">…</span><button onClick={()=> onPage(pages)} className="px-2.5 py-1.5 text-xs rounded-lg border bg-white border-gray-200 hover:bg-gray-50">{pages}</button></>)}
        <button disabled={!next} onClick={()=> next && onPage(next)} className="px-3 py-1.5 text-xs sm:text-sm rounded-lg border bg-white border-gray-200 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">Siguiente</button>
      </div>
    </nav>
  )
}
