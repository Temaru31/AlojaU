// Icono — Set vectorial ultra-ligero estilo Lucide (24x24, stroke 2, round).
// FASE 0: el proyecto NO trae lucide-react; para 8 íconos se evita una
// dependencia extra (bundle + superficie CI) con trazos inline concisos.
// Los trazos `lucide/*` replican el diseño Lucide; `propio/*` son dibujos
// propios con la misma gramática visual. Nada de emojis en UI nueva.
// Uso: <Icono nombre="mascotas" className="w-5 h-5" />
const TRAZOS = {
  // lucide/paw-print (huella: almohadilla + 3 dedos).
  mascotas: (
    <>
      <circle cx="11" cy="5" r="1.8" />
      <circle cx="17.2" cy="9" r="1.8" />
      <circle cx="18.6" cy="15.4" r="1.8" />
      <path d="M10.5 10.2a4.6 4.6 0 0 1 4.4 4.7v2.6a3.4 3.4 0 0 1-6.6 1Q7 16.6 5 15.9a3.4 3.4 0 0 1 1.1-6.4c1.4-.4 3 .1 4.4.7Z" />
    </>
  ),
  // lucide/volume-x (zona silenciosa).
  silencio: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <line x1="22" x2="16" y1="9" y2="15" />
      <line x1="16" x2="22" y1="9" y2="15" />
    </>
  ),
  // propio/no-fumar (cigarrillo + círculo de prohibición).
  humo: (
    <>
      <path d="M3 15h11v3H3z" />
      <path d="M14 15h4v3h-4z" />
      <path d="M18 16.5c1.5 0 1.5-1 3-1" />
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" x2="18.4" y1="5.6" y2="18.4" />
    </>
  ),
  // lucide/users (comunidad / misma facultad).
  facultad: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  // lucide/utensils (cocina equipada).
  cocina: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  // lucide/droplets (zona de lavado).
  lavado: (
    <>
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 6.26c1.34 0 2.43-1.06 2.43-2.4 0-.72-.35-1.4-1.04-1.98S12.6 0.75 12.43.2c-.17.88-.68 1.74-1.36 2.3s-1.05 1.2-1.05 1.76c0 1.34 1.1 2.4 2.54 2.4z" />
    </>
  ),
  // lucide/clock (sin horario de cierre, 24/7).
  horario: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 13.5" />
    </>
  ),
  // lucide/bike (parqueadero moto/bici).
  movilidad: (
    <>
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </>
  ),
  // lucide/shield-check (confianza / verificado).
  escudo: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  // lucide/sparkles (destacado / nivel).
  brillo: (
    <>
      <path d="M12 3v3m0 12v3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2M3 12h3m12 0h3M5.6 18.4l2.2-2.2m8.4-8.4 2.2-2.2" />
    </>
  ),
  // lucide/share-2 (compartir en galería móvil).
  compartir: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </>
  ),
  // lucide/pencil (editar aviso del dueño).
  lapiz: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  // lucide/check.
  check: <path d="M20 6 9 17l-5-5" />,
  // lucide/chevron-down.
  chevron: <path d="m6 9 6 6 6-6" />,
  // lucide/user (tabs perfil).
  usuario: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  // lucide/lock (tab seguridad).
  candado: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  // lucide/star (tab confianza).
  estrella: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  // lucide/house (tab avisos).
  casa: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
}

// Fallback visible (círculo punteado) ante nombre inválido: hace el typo
// obvio en QA en vez de pintar un ícono engañoso en silencio.
const FALLBACK = <circle cx="12" cy="12" r="8" strokeDasharray="3 2" />

export default function Icono({ nombre = 'brillo', className = 'w-5 h-5', strokeWidth = 2 }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {TRAZOS[nombre] || FALLBACK}
    </svg>
  )
}
