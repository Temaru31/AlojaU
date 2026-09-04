// UploadFotos - HU-005 Subida real 3-10 imágenes con preview + drag-drop
// Usa POST /api/publicaciones/upload (multipart, solo ARRENDADOR, 5MB, image/*)
import { useState, useRef } from 'react'
import { api } from '../services/api'

const MAX_FILES = 10
const MIN_FILES = 3
const MAX_SIZE = 5 * 1024 * 1024

export default function UploadFotos({ token, onUrls, initialUrls = [] }) {
  const [files, setFiles] = useState([]) // File[]
  const [previews, setPreviews] = useState([]) // {id, url, name}
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedUrls, setUploadedUrls] = useState(initialUrls)
  const inputRef = useRef(null)

  const validateAndAdd = (newFiles) => {
    setError('')
    const arr = Array.from(newFiles)
    if (files.length + arr.length > MAX_FILES) {
      setError(`Máximo ${MAX_FILES} fotos, ya tienes ${files.length}`)
      return
    }
    for (const f of arr) {
      if (!f.type.startsWith('image/')) {
        setError(`"${f.name}" no es imagen (solo image/*)`)
        return
      }
      if (f.size > MAX_SIZE) {
        setError(`"${f.name}" excede 5MB (${(f.size/1024/1024).toFixed(1)}MB)`)
        return
      }
    }
    const nextFiles = [...files, ...arr].slice(0, MAX_FILES)
    setFiles(nextFiles)
    const nextPreviews = nextFiles.map(f => ({
      id: f.name + f.size + f.lastModified,
      url: URL.createObjectURL(f),
      name: f.name,
      size: f.size,
    }))
    // revocar anteriores para no leak
    previews.forEach(p => URL.revokeObjectURL(p.url))
    setPreviews(nextPreviews)
  }

  const onInputChange = (e) => {
    if (e.target.files) validateAndAdd(e.target.files)
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files) validateAndAdd(e.dataTransfer.files)
  }

  const removeFile = (idx) => {
    const next = files.filter((_, i) => i !== idx)
    setFiles(next)
    const p = previews[idx]
    if (p) URL.revokeObjectURL(p.url)
    setPreviews(next.map(f => ({
      id: f.name + f.size + f.lastModified,
      url: URL.createObjectURL(f),
      name: f.name,
      size: f.size,
    })))
  }

  const handleUpload = async () => {
    if (files.length < MIN_FILES) {
      setError(`Mínimo ${MIN_FILES} fotos para publicar (HU-005 C2) — tienes ${files.length}`)
      return
    }
    if (!token) {
      setError('Necesitas iniciar sesión como ARRENDADOR')
      return
    }
    setError(''); setUploading(true)
    try {
      const form = new FormData()
      files.forEach(f => form.append('files', f))
      const r = await api.post('/api/publicaciones/upload', form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      })
      const urls = r.data.urls || []
      setUploadedUrls(urls)
      onUrls(urls)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d=>d.msg).join(' | ') : err.message))
    } finally {
      setUploading(false)
    }
  }

  const total = files.length
  const canUpload = total >= MIN_FILES && total <= MAX_FILES && !uploading

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Fotos reales * <span className="text-gray-400 font-normal">(3-10, cada una max 5MB, image/*)</span></label>

      {/* Drop zone */}
      <div
        onDragOver={e=> e.preventDefault()}
        onDrop={onDrop}
        onClick={()=> inputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-4 sm:p-6 bg-gray-50 hover:bg-white hover:border-indigo-300 cursor-pointer text-center transition"
        role="button"
        tabIndex={0}
        aria-label="Seleccionar fotos"
      >
        <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onInputChange} />
        <p className="text-sm font-medium text-gray-700">Arrastra fotos aquí o haz clic para seleccionar</p>
        <p className="text-xs text-gray-400 mt-1">{total}/{MAX_FILES} fotos • {total>=MIN_FILES ? '✓ mínimo alcanzado' : `faltan ${MIN_FILES-total} para mínimo`}</p>
      </div>

      {/* Previews */}
      {previews.length>0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {previews.map((p, idx)=> (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 border">
              <img src={p.url} alt={`Preview ${idx+1}`} className="w-full h-full object-cover" />
              <button type="button" onClick={()=> removeFile(idx)} className="absolute top-1 right-1 bg-black/60 text-white text-xs w-6 h-6 rounded-full hover:bg-red-600">×</button>
              <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">{(p.size/1024).toFixed(0)}KB</span>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded URLs preview */}
      {uploadedUrls.length>0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-medium text-green-800">✓ Subidas {uploadedUrls.length} URLs listas para publicar:</p>
          <ul className="text-xs text-green-700 truncate mt-1 space-y-1">
            {uploadedUrls.map((u,i)=> <li key={i} className="truncate">{u}</li>)}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={handleUpload} disabled={!canUpload} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-medium text-sm">
          {uploading ? 'Subiendo...' : `Subir ${total} fotos → obtener URLs`}
        </button>
        {files.length>0 && <button type="button" onClick={()=>{
          previews.forEach(p=> URL.revokeObjectURL(p.url))
          setFiles([]); setPreviews([]); setUploadedUrls([]); onUrls([]); setError('')
        }} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Limpiar</button>}
      </div>
      <p className="text-xs text-gray-400">Las URLs se usarán automáticamente al “Enviar a PENDIENTE”. En Render Free los archivos son efímeros (se borran al redeploy), para prod usar Cloudinary/Supabase Storage.</p>
    </div>
  )
}
