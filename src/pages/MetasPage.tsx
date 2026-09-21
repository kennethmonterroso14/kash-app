import { useState } from 'react'
import Campo from '../components/Campo'
import { toCentavos } from '../lib/finanzas'
import { useSesion } from '../context/sesion'
import { useMetas } from '../hooks/useMetas'
import TarjetaMeta from './metas/TarjetaMeta'
import ModalMeta from './metas/ModalMeta'

/** Punto de partida del estimador; el usuario lo ajusta. */
const AHORRO_MENSUAL_SUGERIDO_Q = 2000
const MS_CONFIRMAR_BORRADO = 3000

export default function MetasPage() {
  const { userId } = useSesion()
  const { metas, cargando, error, operando, agregar, completar, eliminar } = useMetas(userId)

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null)
  const [ahorroQ, setAhorroQ] = useState(String(AHORRO_MENSUAL_SUGERIDO_Q))

  // Se valida antes de convertir: toCentavos lanza con NaN o negativos, y una
  // excepción acá corre en pleno render.
  const ahorro = parseFloat(ahorroQ)
  const ahorroMensual = Number.isFinite(ahorro) && ahorro > 0 ? toCentavos(ahorro) : 0

  const borrar = (id: string) => {
    if (porConfirmar !== id) {
      setPorConfirmar(id)
      setTimeout(() => setPorConfirmar(p => (p === id ? null : p)), MS_CONFIRMAR_BORRADO)
      return
    }
    setPorConfirmar(null)
    void eliminar(id)
  }

  const botonNueva = (clases: string) => (
    <button
      onClick={() => setMostrarAlta(true)}
      className={`presionable bg-accent text-bg font-semibold ${clases}`}
    >
      + Nueva meta
    </button>
  )

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
      {/* Sin <h1>: el riel de la sección ya dice "Metas". Y el botón de arriba
          solo aparece si hay metas: con la lista vacía, el estado vacío ya trae
          el suyo y se veían dos "+ Nueva meta" en la misma pantalla. */}
      {metas.length > 0 && (
        <div className="flex items-center justify-end mb-5">
          {botonNueva('text-sm px-4 py-2 rounded-control')}
        </div>
      )}

      <div className="bg-surface rounded-tarjeta px-4 py-4 mb-5">
        <Campo
          etiqueta="Ahorro mensual estimado (Q)" tipo="number" min="1" step="100"
          value={ahorroQ} onChange={e => setAhorroQ(e.target.value)}
          clase="text-xl font-mono"
        />
      </div>

      {error && <p role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-2 mb-4">{error}</p>}

      {cargando && <p className="text-textDim text-center py-8">Cargando metas...</p>}

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {!cargando && !error && metas.length === 0 && (
        <div className="bg-surface rounded-tarjeta p-8 text-center space-y-4">
          <p className="text-textDim">No tienes metas de ahorro activas.</p>
          {botonNueva('px-6 py-3 rounded-control')}
        </div>
      )}

      <div className="space-y-3">
        {metas.map(meta => (
          <TarjetaMeta
            key={meta.id}
            meta={meta}
            ahorroMensual={ahorroMensual}
            operando={operando}
            porConfirmarBorrado={porConfirmar === meta.id}
            onCompletar={() => void completar(meta.id)}
            onBorrar={() => borrar(meta.id)}
          />
        ))}
      </div>

      {mostrarAlta && <ModalMeta guardar={agregar} onCerrar={() => setMostrarAlta(false)} />}
    </div>
  )
}
