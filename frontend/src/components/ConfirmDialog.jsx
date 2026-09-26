// ConfirmDialog — Modal genérico de confirmación (hilo Airbnb-like).
// Lenguaje único en la app: tarjeta rounded-2xl + backdrop blur, botón
// secundario neutral a la izquierda y acción explícita a la derecha
// (destructiva en rojo cuando `peligro`). Reutilizado en: guard de pestaña
// con cambios sin guardar (Perfil), eliminar cuenta y eliminar publicación
// (MisPublicaciones). Nunca cambia el texto del botón que lo abrió.
// Uso: {abierto && <ConfirmDialog titulo="..." descripcion="..."
//   cancelar="Cancelar" confirmar="Sí, eliminar" peligro
//   onCancelar={...} onConfirmar={...} ocupado={bool} />} (+ children opcional).
import { useEffect, useRef } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'

export default function ConfirmDialog({
  titulo,
  descripcion,
  cancelar = 'Cancelar',
  confirmar = 'Confirmar',
  peligro = false,
  ocupado = false,
  confirmarDeshabilitado = false,
  onCancelar,
  onConfirmar,
  children,
}) {
  // Escape cierra (igual que ReportarModal / sheet de filtros).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !ocupado) onCancelar?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancelar, ocupado])

  // Bloque 3: Tab cicla dentro del diálogo y al cerrar vuelve al disparador.
  const cajaRef = useRef(null)
  useFocusTrap(cajaRef, true)

  return (
    <div ref={cajaRef} className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div aria-hidden="true" onClick={() => { if (!ocupado) onCancelar?.() }} className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px]" />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animar-subir max-h-[90vh] overflow-y-auto">
        <div aria-hidden="true" className="mx-auto h-1.5 w-12 rounded-full bg-neutral-200 sm:hidden" />
        <div>
          <h2 className="text-base font-bold text-navy-900">{titulo}</h2>
          {descripcion && <p className="text-xs text-neutral-500 leading-relaxed mt-1.5">{descripcion}</p>}
        </div>
        {children}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onCancelar}
            disabled={ocupado}
            className="px-4 py-2.5 min-h-[44px] text-sm font-semibold text-neutral-600 border border-neutral-200 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800/40"
          >
            {cancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={ocupado || confirmarDeshabilitado}
            title={confirmarDeshabilitado ? 'Completa los datos requeridos' : undefined}
            className={`px-4 py-2.5 min-h-[44px] text-sm font-bold rounded-xl transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 ${peligro
              ? 'text-white bg-red-600 hover:bg-red-700 active:bg-red-700'
              : 'text-white bg-navy-800 hover:bg-navy-900 active:bg-navy-900'
              }`}
          >
            {ocupado ? 'Procesando…' : confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
