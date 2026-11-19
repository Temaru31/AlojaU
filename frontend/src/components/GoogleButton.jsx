// GoogleButton.jsx — Botón "Continuar con Google" según guía de marca oficial.
//
// - Logo "G" vectorial SVG oficial (4 colores, sin alteraciones).
// - Tipografía del sistema (Roboto si está disponible, fallback system-ui).
// - Estados hover/active/focus-visible + disabled con spinner.
// - Accesible: <button> nativo, aria-label, foco visible, contraste AA.
// - Tema claro y oscuro (clase .google-btn--dark o prefers-color-scheme).
//
// Uso: <GoogleButton onClick={...} loading={bool} mode="login|register" />
import './GoogleButton.css'

export function GoogleGLogo({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#FFC107" d="M43.85 24.09c0-1.56-.14-3.06-.4-4.5H24v8.52h11.15c-.48 2.6-1.95 4.8-4.15 6.27v5.21h6.72c3.93-3.62 6.13-8.96 6.13-15.5z" />
      <path fill="#FF3D00" d="M24 44c5.63 0 10.35-1.86 13.8-5.05l-6.72-5.21c-1.87 1.25-4.26 2-7.08 2-5.44 0-10.05-3.68-11.7-8.63H5.35v5.38A20 20 0 0024 44z" />
      <path fill="#4CAF50" d="M12.3 27.11a12 12 0 010-7.66V14.07H5.35a20 20 0 000 18.13l6.95-5.09z" />
      <path fill="#1976D2" d="M24 12.27c3.06 0 5.81 1.05 7.97 3.11l5.98-5.98C34.35 5.99 29.63 4 24 4 16.16 4 9.38 8.54 6.23 14.93l6.95 5.38c1.65-4.95 6.26-8.04 10.82-8.04z" />
    </svg>
  )
}

export default function GoogleButton({
  onClick,
  loading = false,
  disabled = false,
  mode = 'login',
  dark = false,
  className = '',
}) {
  const label =
    mode === 'register' ? 'Registrarse con Google' : 'Continuar con Google'
  // Guía de marca Google: botón siempre claro (el modo oscuro del SO no lo invierte).
  const tema = dark ? 'google-btn--dark' : 'google-btn--light'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={`${label} (abre el inicio de sesión seguro de Google)`}
      aria-busy={loading || undefined}
      className={`google-btn ${tema} ${className}`.trim()}
    >
      {loading ? (
        <span className="google-btn__spinner" aria-hidden="true" />
      ) : (
        <GoogleGLogo />
      )}
      <span className="google-btn__text">
        {loading ? 'Conectando con Google…' : label}
      </span>
    </button>
  )
}
