import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Última red de seguridad: sin esto, cualquier excepción durante el render
 * (por ejemplo toCentavos/formatMoneda, que lanzan a propósito ante datos inválidos)
 * desmonta todo el árbol y deja la pantalla en blanco sin explicación.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Vorta] Error no controlado:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="vidrio-panel rounded-2xl p-6 max-w-sm space-y-3">
          <p className="text-text font-semibold">Algo salió mal</p>
          <p className="text-textDim text-sm">
            La pantalla no se pudo mostrar. Tus datos no se modificaron.
          </p>
          <p className="text-textDim text-xs font-mono break-words bg-bg rounded-xl px-3 py-2">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
