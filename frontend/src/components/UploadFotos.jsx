/**
 * Subida de 3-10 imágenes con preview y drag-drop.
 *
 * El padre es dueño de las `fotos` finales vía `onUrls`; aquí solo vive estado
 * efímero (File + previews). Cada preview crea un objectURL que se revoca al
 * eliminar/limpiar/desmontar. Accesible por teclado (Enter/Espacio en la zona).
 */
import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'
import { comprimirImagen } from '../utils/compressImage'

export const UPLOAD_MIN_FILES = 3
export const UPLOAD_MAX_FILES = 10
export const UPLOAD_MAX_SIZE = 5 * 1024 * 1024 // 5MB (igual que backend uploads.py MAX_SIZE)
// Formatos permitidos en cliente (JPG, PNG, WEBP; el backend valida además magia binaria).
export const UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'

// Cada archivo tiene su propia entrada {key, file, url}: solo se revoca la
// eliminada (más cleanup al desmontar).
const newKey = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export default function UploadFotos({ token, onUrls, initialUrls = [], endpoint = '/api/publicaciones/upload' }) {
  // `items`: [{key, file, url, name, size}] — url es objectURL local para preview (no la final).
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  // Solo URLs realmente subidas (nunca placeholders iniciales).
  const [uploadedUrls, setUploadedUrls] = useState([])
  const [comprimiendo, setComprimiendo] = useState(false)
  const inputRef = useRef(null)
  // Ref espejo para cleanup al desmontar sin depender del closure (evita revocar de más/menos).
  const itemsRef = useRef([])
  itemsRef.current = items

  // Revoca todas las previews al desmontar (evita leak si el usuario navega sin Limpiar).
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => {
        try { URL.revokeObjectURL(it.url) } catch { /* noop */ }
      })
    }
  }, [])

  const validateAndAdd = async (newFiles) => {
    setError('')
    const arr = Array.from(newFiles || [])
    if (items.length + arr.length > UPLOAD_MAX_FILES) {
      setError(`Máximo ${UPLOAD_MAX_FILES} fotos, ya tienes ${items.length}`)
      return
    }
    for (const f of arr) {
      if (!f.type || !UPLOAD_ALLOWED_TYPES.includes(f.type.toLowerCase())) {
        setError(`"${f.name}" no es un formato válido (solo JPG, PNG o WEBP)`)
        return
      }
      if (f.size > UPLOAD_MAX_SIZE) {
        setError(`"${f.name}" es muy pesada (${(f.size / 1024 / 1024).toFixed(1)}MB). El tamaño máximo permitido es 5 MB.`)
        return
      }
    }
    // Compresión Canvas (máx 1200px, calidad 0.8) antes de previsualizar/subir.
    setComprimiendo(true)
    let livianas = arr
    try {
      livianas = await Promise.all(arr.map((f) => comprimirImagen(f)))
    } finally {
      setComprimiendo(false)
    }
    // Solo los nuevos crean objectURL (los existentes se reutilizan, sin recrear).
    const fresh = livianas.map((f) => ({
      key: newKey(),
      file: f,
      url: URL.createObjectURL(f),
      name: f.name,
      size: f.size,
    }))
    setItems((prev) => [...prev, ...fresh].slice(0, UPLOAD_MAX_FILES))
  }

  const onInputChange = (e) => {
    if (e.target.files) validateAndAdd(e.target.files)
    e.target.value = '' // permite re-seleccionar el mismo archivo
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files) validateAndAdd(e.dataTransfer.files)
  }

  const removeFile = (key) => {
    setItems((prev) => {
      const target = prev.find((it) => it.key === key)
      if (target) {
        try { URL.revokeObjectURL(target.url) } catch { /* noop */ }
      }
      return prev.filter((it) => it.key !== key)
    })
  }

  // Limpiar propaga `onUrls([])` para que el padre vacíe las fotos.
  const handleClear = () => {
    items.forEach((it) => {
      try { URL.revokeObjectURL(it.url) } catch { /* noop */ }
    })
    setItems([])
    setUploadedUrls([])
    onUrls([])
    setError('')
  }

  const handleUpload = async () => {
    if (items.length < UPLOAD_MIN_FILES) {
      setError(`Mínimo ${UPLOAD_MIN_FILES} fotos para publicar (HU-005 C2) — tienes ${items.length}`)
      return
    }
    if (!token) {
      setError('Necesitas iniciar sesión como ARRENDADOR')
      return
    }
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      items.forEach((it) => form.append('files', it.file))
      const r = await api.post(endpoint, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      })
      const urls = r.data.urls || []
      setUploadedUrls(urls)
      onUrls(urls)
    } catch (err) {
      // Prefiere el mensaje amigable del interceptor (español no-técnico).
      const detail = err.mensajeAmigable || err.response?.data?.detail
      setError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).join(' | ')
            : err.message,
      )
    } finally {
      setUploading(false)
    }
  }

  const total = items.length
  const canUpload = total >= UPLOAD_MIN_FILES && total <= UPLOAD_MAX_FILES && !uploading && !comprimiendo

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">
        Fotos reales * <span className="text-neutral-400 font-normal">(3-10, JPG/PNG/WEBP, cada una max 5MB)</span>
      </label>

      {/* Drop zone accesible por teclado */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className="border-2 border-dashed border-neutral-200 rounded-xl p-4 sm:p-6 bg-neutral-50 hover:bg-white hover:border-indigo-300 cursor-pointer text-center transition"
        role="button"
        tabIndex={0}
        aria-label="Seleccionar fotos"
      >
        <input ref={inputRef} type="file" multiple accept={UPLOAD_ACCEPT} className="hidden" onChange={onInputChange} />
        <p className="text-sm font-medium text-neutral-700">Arrastra fotos aquí o haz clic para seleccionar</p>
        <p className="text-xs text-neutral-400 mt-1" aria-live="polite">
          {comprimiendo
            ? 'Optimizando imágenes…'
            : `${total}/${UPLOAD_MAX_FILES} fotos • ${total >= UPLOAD_MIN_FILES ? '✓ mínimo alcanzado' : `faltan ${UPLOAD_MIN_FILES - total} para mínimo`}`}
        </p>
        {initialUrls.length > 0 && uploadedUrls.length === 0 && (
          <p className="text-[11px] text-neutral-400 mt-1">Tienes {initialUrls.length} URLs de ejemplo; sube fotos reales para reemplazarlas.</p>
        )}
      </div>

      {/* Previews locales (objectURL, no son las finales) */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((p, idx) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100 border">
              <img src={p.url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeFile(p.key)}
                aria-label={`Quitar ${p.name}`}
                // M3 táctil: área 44px vía pseudo-elemento (el visible sigue w-6).
                className="absolute top-1 right-1 bg-black/60 text-white text-xs w-6 h-6 rounded-full hover:bg-red-600 before:absolute before:-inset-2.5 before:content-['']"
              >
                ×
              </button>
              <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                {(p.size / 1024).toFixed(0)}KB
              </span>
            </div>
          ))}
        </div>
      )}

      {/* URLs reales devueltas por el backend (local /uploads/* o Cloudinary secure_url) */}
      {uploadedUrls.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-medium text-green-800">✓ Subidas {uploadedUrls.length} URLs listas para publicar:</p>
          <ul className="text-xs text-green-700 truncate mt-1 space-y-1">
            {uploadedUrls.map((u, i) => <li key={i} className="truncate">{u}</li>)}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          aria-disabled={!canUpload}
          aria-busy={uploading}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-medium text-sm"
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Subiendo...
            </span>
          ) : `Subir ${total} fotos → obtener URLs`}
        </button>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2.5 rounded-xl border border-neutral-200 text-sm hover:bg-neutral-50"
          >
            Limpiar
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        En producción las URLs son Cloudinary (persistentes, CDN). En dev local son /uploads (efímeros: se borran al redeploy en Render Free).
      </p>
    </div>
  )
}
