// Legal.jsx — Textos Ley 1581/2012 + modal accesible.
//
// - TERMINOS_RESUMEN / POLITICA_RESUMEN: versiones cortas para el registro.
// - LegalModal: <dialog>-like accesible (role=dialog, Esc cierra, foco ok).
// - Las rutas públicas /terminos y /privacidad usan el mismo contenido.
import { useEffect, useRef } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'

export const POLITICA_VERSION = 'v1.0-ley1581-2026'

export const CONSENTIMIENTO_TEXTO =
  'Acepto los Términos de Servicio y la Política de Tratamiento de Datos Personales (Ley 1581 de 2012)'

export const TERMINOS_COMPLETOS = `
TÉRMINOS DE SERVICIO — ALOJAU (v1.0, 2026)

1. OBJETO. AlojaU es una plataforma gratuita que conecta estudiantes de
Popayán con arrendadores de vivienda universitaria. No procesamos pagos
ni operamos chat interno: el contacto se hace por WhatsApp verificado.

2. CUENTAS Y ROLES. El registro crea una cuenta ESTUDIANTE (búsqueda,
favoritos, reseñas, contacto). Publicar un aviso promueve la cuenta a
ARRENDADOR automáticamente. El rol ADMIN modera contenidos.

3. PUBLICACIONES. Todo aviso inicia en estado PENDIENTE y requiere
moderación antes de ser visible. Está prohibido publicar datos falsos,
fotos engañosas o inmuebles ya arrendados (pueden pausar tu cuenta).

4. CONDUCTA. Prohibido el acoso, la discriminación, el spam y cualquier
uso fraudulento. Los reportes comprobados generan sanciones.

5. DISPONIBILIDAD. Operamos en capas gratuitas (Vercel, Render, Supabase):
el primer acceso del día puede tardar hasta 50 segundos (cold start).

6. CONTACTO. Soporte: desde la sección Mi Perfil. Popayán, Cauca, Colombia.
`.trim()

export const POLITICA_COMPLETA = `
POLÍTICA DE TRATAMIENTO DE DATOS PERSONALES — LEY 1581 DE 2012 (v1.0-ley1581-2026)

RESPONSABLE: AlojaU (proyecto universitario, Popayán, Cauca, Colombia).

1. DATOS QUE RECOGEMOS. Nombre completo, correo electrónico, teléfono
WhatsApp, publicaciones e imágenes que subas, y datos de consentimiento
(fecha, IP y versión de esta política). Con Google OAuth: nombre y correo
verificado por Google.

2. FINALIDADES. Crear y asegurar tu cuenta; mostrar tus avisos y tu
contacto a interesados; moderar contenidos; prevenir fraude (rate-limit);
cumplir obligaciones legales. Nunca vendemos tus datos.

3. DERECHOS (Art. 8 Ley 1581 y Art. 15 Constitución). Conocer, actualizar,
rectificar y suprimir tus datos; revocar la autorización; presentar quejas
ante la Superintendencia de Industria y Comercio (www.sic.gov.co).

4. EJERCER TUS DERECHOS. Escríbenos desde Mi Perfil indicando tu correo
registrado. Respondemos en máximo 15 días hábiles (Ley 1581, Art. 14).

5. SEGURIDAD. Contraseñas con hash bcrypt, tokens JWT de corta duración
(2 horas), revocación global de sesiones, y cifrado en tránsito (HTTPS).

6. CONSERVACIÓN. Guardamos tus datos mientras tu cuenta exista. Al
eliminarla, anonimizamos tus avisos y borramos tus datos de contacto.

7. MENORES. El servicio es para mayores de 14 años con capacidad para
contratar alojamiento o con acudiente responsable.

8. CAMBIOS. Publicaremos nuevas versiones con su fecha; el uso continuado
tras un cambio implica aceptación.
`.trim()

export function LegalModal({ titulo, contenido, abierto, onCerrar }) {
  // Bloque 3: el trap solo vive mientras el modal está abierto (el hook
  // no hace nada con activo=false, así que el early return es seguro).
  const cajaRef = useRef(null)
  useFocusTrap(cajaRef, abierto)
  useEffect(() => {
    if (!abierto) return
    const onKey = (e) => { if (e.key === 'Escape') onCerrar?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto, onCerrar])

  if (!abierto) return null
  return (
    <div
      ref={cajaRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div aria-hidden="true" onClick={onCerrar} className="absolute inset-0 bg-navy-900/50" />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-150">
          <h2 className="text-base font-bold text-navy-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar documento legal"
            className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-600 font-sans">
            {contenido}
          </pre>
        </div>
        <div className="px-5 py-3 border-t border-neutral-150">
          <button type="button" onClick={onCerrar} className="btn-accent w-full justify-center text-sm">
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
