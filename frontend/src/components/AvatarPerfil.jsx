// AvatarPerfil — M3 UX de avatar sin exponer URL.
// - Desktop: hover con overlay + lápiz Edit.
// - Móvil: al presionar abre Action Sheet con Ver / Cambiar / Quitar.
// - Cambiar invoca POST /api/auth/avatar (multipart, 5MB, cualquier rol).
// - Quitar invoca DELETE /api/auth/avatar (foto=null -> iniciales).
// Uso: <AvatarPerfil perfil={perfil} token={token} onCambio={(url) => ...} />
import { useRef, useState } from 'react'
import { api } from '../services/api'
import { inicialesDe } from '../contexts/AuthContext'
import useFocusTrap from '../hooks/useFocusTrap'

// `tamano="lg"` (w-20) para la tarjeta de identidad del sidebar; el
// default conserva el tamaño compacto usado en el resto de la app.
export default function AvatarPerfil({ perfil, token, onCambio, tamano }) {
  const grande = tamano === 'lg'
  const caja = grande ? 'w-20 h-20' : 'w-14 h-14'
  const texto = grande ? 'text-2xl' : 'text-lg'
  const [sheet, setSheet] = useState(false)
  const [ver, setVer] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  // Bloque 3: trap solo en el sheet abierto (el visor tiene un único botón).
  const sheetRef = useRef(null)
  useFocusTrap(sheetRef, sheet)
  const foto = perfil?.foto_perfil_url || null

  const authHead = token ? { headers: { Authorization: `Bearer ${token}` } } : {}

  const cambiar = async (file) => {
    if (!file || subiendo) return
    setError('')
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/api/auth/avatar', fd, {
        ...authHead,
        headers: { ...(authHead.headers || {}), 'Content-Type': 'multipart/form-data' },
      })
      onCambio?.(r.data?.foto_perfil_url || null)
      setSheet(false)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo subir la foto (máx 5MB, JPG/PNG/WebP/GIF).')
    } finally {
      setSubiendo(false)
      try { if (fileRef.current) fileRef.current.value = '' } catch { /* noop */ }
    }
  }

  const quitar = async () => {
    setError('')
    setSubiendo(true)
    try {
      const r = await api.delete('/api/auth/avatar', authHead)
      onCambio?.(r.data?.foto_perfil_url ?? null)
      setSheet(false)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo quitar la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <>
      {/* Avatar con hover overlay (desktop) */}
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label={foto ? 'Abrir opciones de foto de perfil' : 'Añadir foto de perfil'}
        aria-haspopup="dialog"
        className={`group relative ${caja} shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400`}
      >
        {foto ? (
          <img
            src={foto}
            alt={`Foto de ${perfil?.nombre_completo || 'usuario'}`}
            className={`${caja} rounded-full object-cover border border-neutral-200`}
            referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <span aria-hidden="true" className={`${caja} rounded-full bg-navy-800 text-white ${texto} font-bold flex items-center justify-center`}>
            {inicialesDe(perfil)}
          </span>
        )}
        {/* Overlay desktop: hover muestra lápiz */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-navy-950/60 text-white hidden group-hover:flex group-focus-visible:flex items-center justify-center transition"
          title="Editar foto"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        aria-label="Elegir foto de perfil"
        onChange={(e) => cambiar(e.target.files?.[0])}
      />

      {error && <p className="text-[11px] text-red-600" role="alert">{error}</p>}

      {/* Action Sheet móvil + modal desktop (mismo diálogo) */}
      {sheet && (
        <div ref={sheetRef} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Opciones de foto de perfil">
          <div aria-hidden="true" onClick={() => setSheet(false)} className="absolute inset-0 bg-navy-950/60" />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:max-w-sm sm:h-fit rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl p-4 space-y-2">
            <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
            <p className="text-sm font-bold text-navy-900 px-1">Foto de perfil</p>
            {foto && (
              <button
                type="button"
                onClick={() => { setSheet(false); setVer(true) }}
                className="w-full text-left px-3 py-3 min-h-[44px] text-sm rounded-lg hover:bg-neutral-50 flex items-center gap-2"
              >
                <span aria-hidden="true">👁️</span> Ver foto en tamaño completo
              </button>
            )}
            <button
              type="button"
              disabled={subiendo}
              onClick={() => fileRef.current?.click()}
              className="w-full text-left px-3 py-3 min-h-[44px] text-sm rounded-lg hover:bg-neutral-50 flex items-center gap-2 disabled:opacity-50"
            >
              <span aria-hidden="true">✏️</span> {subiendo ? 'Subiendo…' : 'Cambiar foto'}
            </button>
            {foto && (
              <button
                type="button"
                disabled={subiendo}
                onClick={quitar}
                className="w-full text-left px-3 py-3 min-h-[44px] text-sm rounded-lg hover:bg-red-50 text-red-700 flex items-center gap-2 disabled:opacity-50"
              >
                <span aria-hidden="true">🗑️</span> Quitar foto
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="w-full px-3 py-3 min-h-[44px] text-sm font-semibold rounded-lg border border-neutral-200 hover:bg-neutral-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Visor tamaño completo */}
      {ver && foto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Foto en tamaño completo">
          <div aria-hidden="true" onClick={() => setVer(false)} className="absolute inset-0 bg-navy-950/80" />
          <div className="relative max-w-lg w-full">
            <img src={foto} alt="Foto de perfil en tamaño completo" className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" referrerPolicy="no-referrer" />
            <button
              type="button"
              onClick={() => setVer(false)}
              aria-label="Cerrar foto"
              className="absolute -top-2 -right-2 w-11 h-11 rounded-full bg-white text-navy-900 font-bold shadow flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}
