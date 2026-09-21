import { useMemo, useState } from 'react'
import { useTransacciones } from '../hooks/useTransacciones'
import { usePresupuestos, type Presupuesto } from '../hooks/usePresupuestos'
import { MESES } from '../lib/constants'
import { useSesion } from '../context/sesion'
import { useFechas } from '../hooks/useFechas'
import SelectorMes from '../components/SelectorMes'
import TarjetaPresupuesto from './presupuesto/TarjetaPresupuesto'
import ModalPresupuesto from './presupuesto/ModalPresupuesto'

const MS_CONFIRMAR_BORRADO = 3000

export default function BudgetPage() {
  const { userId, categoriasGasto } = useSesion()
  const fechas = useFechas()
  const [mes, setMes] = useState(fechas.mesActual())
  const { txns, loading: cargandoTxns, error: errorTxns } = useTransacciones(userId, mes)
  // Todo el estado delicado (etiquetado por mes, el latch de la copia, el
  // banner) vive en el hook y llega acá ya filtrado por el mes visible.
  const {
    presupuestos, cargando, errorLectura, errorEscritura, limpiarErrorEscritura,
    banner, agregar, actualizarLimite, eliminar, deshacerCopia, recargar,
  } = usePresupuestos(userId, mes)

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState<Presupuesto | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null)

  const [anio, mesNum] = mes.split('-').map(Number)
  const etiquetaMes = `${MESES[mesNum - 1]} ${anio}`

  // Solo se puede presupuestar una categoría que no tenga ya un límite este mes.
  const disponibles = useMemo(() => {
    const yaTienen = new Set(presupuestos.map(p => p.categoria))
    return categoriasGasto.filter(c => !yaTienen.has(c))
  }, [presupuestos, categoriasGasto])

  const borrar = (id: string) => {
    if (porConfirmar !== id) {
      setPorConfirmar(id)
      setTimeout(() => setPorConfirmar(p => (p === id ? null : p)), MS_CONFIRMAR_BORRADO)
      return
    }
    setPorConfirmar(null)
    void eliminar(id)
  }

  if (errorLectura) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-surface rounded-tarjeta p-6 text-center space-y-3">
          <p className="text-text font-semibold">No se pudieron cargar tus presupuestos</p>
          <p className="text-textDim text-sm">{errorLectura}</p>
          {/* Reintenta la consulta, no recarga la app: con el hook en su lugar
              ya no hace falta perder el resto del estado para recuperarse. */}
          <button
            type="button"
            onClick={recargar}
            className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (cargando || cargandoTxns) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-textDim text-center">Cargando...</p>
      </div>
    )
  }

  const botonAgregar = (clases: string) => (
    <button
      onClick={() => setMostrarAlta(true)}
      disabled={disponibles.length === 0}
      className={`presionable bg-accent text-bg font-semibold disabled:opacity-30 ${clases}`}
    >
      + Categoría
    </button>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <SelectorMes mes={mes} onCambiar={setMes} />
        {/* Solo si hay presupuestos: con la lista vacía el estado vacío ya trae
            su propio botón, y se veían dos "+ Categoría". */}
        {presupuestos.length > 0 && botonAgregar('text-sm px-4 py-2 rounded-control flex-shrink-0')}
      </div>

      {banner && (
        <div className="flex justify-between items-center bg-accent text-bg rounded-control px-4 py-2.5 gap-3">
          <span className="text-sm font-medium">
            Se copiaron {banner.n} presupuestos del mes anterior
          </span>
          <button
            type="button"
            onClick={() => void deshacerCopia()}
            className="presionable text-xs font-semibold bg-bg/20 rounded-chip px-3 py-1 hover:bg-bg/30 flex-shrink-0"
          >
            ↩ Deshacer
          </button>
        </div>
      )}

      {errorEscritura && (
        <div role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-2 flex justify-between items-start gap-3">
          <span>{errorEscritura}</span>
          <button
            type="button"
            onClick={limpiarErrorEscritura}
            aria-label="Cerrar aviso"
            className="presionable text-danger/70 hover:text-danger leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Los movimientos fallidos se avisan: sin ellos las barras dirían Q0.00
          gastado, que es afirmar que no se gastó nada en lugar de que no se pudo
          saber. */}
      {errorTxns && (
        <div role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-3">
          No se pudieron cargar los movimientos de {etiquetaMes}, así que lo gastado
          puede estar incompleto. {errorTxns}
        </div>
      )}

      {presupuestos.length === 0 && (
        <div className="bg-surface rounded-tarjeta p-8 text-center space-y-4">
          <p className="text-textDim text-sm">Sin presupuestos para {etiquetaMes}</p>
          {botonAgregar('px-6 py-2.5 rounded-control')}
        </div>
      )}

      {presupuestos.map(p => (
        <TarjetaPresupuesto
          key={p.id}
          presupuesto={p}
          txns={txns}
          expandido={expandido === p.id}
          porConfirmarBorrado={porConfirmar === p.id}
          onExpandir={() => setExpandido(prev => (prev === p.id ? null : p.id))}
          onEditar={() => setEditando(p)}
          onBorrar={() => borrar(p.id)}
        />
      ))}

      {mostrarAlta && (
        <ModalPresupuesto
          categoriasDisponibles={disponibles}
          guardar={agregar}
          onCerrar={() => setMostrarAlta(false)}
        />
      )}

      {editando && (
        <ModalPresupuesto
          presupuesto={editando}
          guardar={(_cat, centavos) => actualizarLimite(editando.id, centavos)}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
