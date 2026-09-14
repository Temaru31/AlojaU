import { Component } from 'react'

/**
 * ErrorBoundary global (Tarea 3, v4): captura fallos inesperados de
 * renderizado y muestra pantalla amigable con "Recargar página" en vez
 * de una pantalla en blanco.
 * Uso: <ErrorBoundary><App/></ErrorBoundary>. Ej: un error en Card no tumba todo.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { tieneError: false }
  }

  static getDerivedStateFromError() {
    return { tieneError: true }
  }

  componentDidCatch() {
    // Intencionalmente sin console.error: la pantalla amigable basta en prod.
  }

  render() {
    if (this.state.tieneError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
          <div className="card p-8 max-w-md w-full text-center" role="alert">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span aria-hidden="true" className="text-xl">🔧</span>
            </div>
            <h1 className="font-display text-lg font-bold text-navy-900 mb-2">
              Algo no salió como esperábamos
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              Tuvimos un problema técnico momentáneo. Ya estamos trabajando en ello.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-accent w-full justify-center"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
