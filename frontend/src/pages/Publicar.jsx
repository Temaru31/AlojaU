// HU-005 Registrar publicación estructurada (PENDIENTE) + HU-006 Renovar vigencia
export default function Publicar(){
  return (
    <div className="max-w-3xl mx-auto p-4 bg-white rounded shadow">
      <h1 className="text-xl font-bold">Publicar habitación / apartaestudio (HU-005)</h1>
      <p className="text-xs text-gray-500">Campos obligatorios: título, tipo, canon, depósito, servicios, reglas, dirección referencial, ≥3 fotos. Estado inicial PENDIENTE.</p>
      <form className="grid gap-3 mt-4" onSubmit={e=>e.preventDefault()}>
        <input placeholder="Título" className="border rounded px-3 py-2" required />
        <select className="border rounded px-3 py-2"><option>HABITACION_FAMILIAR</option><option>HABITACION_INDEPENDIENTE</option><option>APARTAESTUDIO</option><option>COMPARTIDO</option></select>
        <input type="number" placeholder="Canon mensual COP" className="border rounded px-3 py-2" required />
        <input type="number" placeholder="Depósito (0 si no aplica)" className="border rounded px-3 py-2" />
        <textarea placeholder="Reglas de convivencia" className="border rounded px-3 py-2" />
        <input placeholder="Dirección referencial (no número exacto si no quieres)" className="border rounded px-3 py-2" required />
        <input type="file" multiple accept="image/*" className="border rounded px-3 py-2" />
        <button className="bg-indigo-600 text-white py-2 rounded">Enviar a PENDIENTE (requiere login ARRENDADOR)</button>
      </form>
      <p className="text-xs text-gray-400 mt-2">HU-006: Mis publicaciones → Renov ar → +30 días + recalcula índice.</p>
    </div>
  )
}
