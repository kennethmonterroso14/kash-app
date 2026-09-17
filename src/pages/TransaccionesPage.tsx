import { useState, useRef, useMemo } from 'react'
import { useTransacciones, type Transaccion } from '../hooks/useTransacciones'
import { MESES } from '../lib/constants'
import { useSesion } from '../context/sesion'
import { useFechas } from '../hooks/useFechas'
import SelectorMes from './transacciones/SelectorMes'
import FiltrosTxn, { type Filtros } from './transacciones/FiltrosTxn'
import FilaTxn from './transacciones/FilaTxn'
import ModalNuevoMovimiento from './transacciones/ModalNuevoMovimiento'
import ModalEditarTxn from './transacciones/ModalEditarTxn'
import { construirCSV, descargarCSV } from './transacciones/exportarCSV'

// Vive acá y no junto al componente: un archivo que exporta un componente Y
// un valor rompe el fast refresh.
const FILTROS_VACIOS: Filtros = { busqueda: '', tipo: '', cuenta: '' }

const SEGUNDOS_DESHACER = 6000
const SEGUNDOS_CONFIRMAR = 3000

/**
 * Un movimiento de TC lo administra el trigger de deuda, cuya rama UPDATE solo
 * contempla `gasto_tc`: editarlos desincroniza la deuda de la tarjeta. Se
 * corrigen borrando y volviendo a registrarlos desde Tarjetas.
 */
const esEditable = (t: Transaccion) => t.tipo !== 'gasto_tc' && t.tipo !== 'pago_tc'

export default function TransaccionesPage() {
  const { userId, cuentas, coloresCategorias, resumenTCs } = useSesion()
  const fechas = useFechas()
  const [mes, setMes] = useState(fechas.mesActual())
  const { txns, loading, error, addTxn, deleteTxn, restoreTxn, updateTxn, addTransferencia } =
    useTransacciones(userId, mes)

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState<Transaccion | null>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)

  // Borrado en 2 taps más un toast de deshacer, no un window.confirm.
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null)
  const [ultimoBorrado, setUltimoBorrado] = useState<Transaccion | null>(null)
  const timerDeshacer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Errores de operaciones sobre la LISTA (un borrado rechazado). Los de los
  // formularios viven dentro de su modal.
  const [errorLista, setErrorLista] = useState('')

  const filtrados = useMemo(() => txns.filter(t => {
    if (filtros.cuenta && t.cuenta_id !== filtros.cuenta) return false
    if (filtros.tipo && t.tipo !== filtros.tipo) return false
    if (filtros.busqueda && !t.descripcion.toLowerCase().includes(filtros.busqueda.toLowerCase())) return false
    return true
  }), [txns, filtros])

  const exportar = () => descargarCSV(
    construirCSV(filtrados, {
      cuenta:  id => cuentas.find(c => c.id === id)?.nombre ?? id,
      tarjeta: id => resumenTCs.find(r => r.tc.id === id)?.tc.nombre ?? id,
    }),
    `vorta_${mes}.csv`,
  )

  const borrar = async (id: string) => {
    if (porConfirmar !== id) {
      setPorConfirmar(id)
      setTimeout(() => setPorConfirmar(p => (p === id ? null : p)), SEGUNDOS_CONFIRMAR)
      return
    }
    // Segundo tap. Se ESPERA el resultado: el trigger de deuda puede rechazar
    // el borrado de un movimiento de TC sin reparto registrado, y antes se
    // ofrecía "Deshacer" de un borrado que nunca ocurrió.
    const txn = txns.find(t => t.id === id)
    if (!txn) return
    setPorConfirmar(null)
    const { error } = await deleteTxn(id)
    if (error) {
      setErrorLista(typeof error === 'string' ? error : error.message)
      return
    }
    setUltimoBorrado(txn)
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    timerDeshacer.current = setTimeout(() => setUltimoBorrado(null), SEGUNDOS_DESHACER)
  }

  const deshacer = async () => {
    if (!ultimoBorrado) return
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    const txn = ultimoBorrado
    setUltimoBorrado(null)
    await restoreTxn(txn)
  }

  const [anio, mesNum] = mes.split('-').map(Number)
  const etiquetaMes = `${MESES[mesNum - 1]} ${anio}`

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <SelectorMes mes={mes} onCambiar={setMes} />
        <div className="flex gap-2 flex-shrink-0">
          {/* Solo el icono: con la etiqueta "CSV" la fila no cabía a 390px. */}
          <button
            onClick={exportar}
            disabled={filtrados.length === 0}
            aria-label="Exportar a CSV"
            title="Exportar a CSV"
            className="presionable text-textDim text-sm px-3 py-2 rounded-control border border-canto hover:text-text disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => setMostrarAlta(true)}
            className="presionable bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-control"
          >
            + Agregar
          </button>
        </div>
      </div>

      <FiltrosTxn filtros={filtros} onCambiar={setFiltros} cuentas={cuentas} />

      {errorLista && (
        <div role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-2 mb-4 flex justify-between items-start gap-3">
          <span>{errorLista}</span>
          <button
            type="button"
            onClick={() => setErrorLista('')}
            aria-label="Cerrar aviso"
            className="presionable text-danger/70 hover:text-danger leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Un fetch fallido NO se pinta como "sin movimientos": son afirmaciones
          distintas, y presentar la lista vacía como un hecho era la clase de
          bug que se corrigió en el resto de la app. */}
      {error && (
        <div role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-3 mb-4">
          No se pudieron cargar los movimientos de {etiquetaMes}. {error}
        </div>
      )}

      {loading && <p className="text-textDim text-center py-8">Cargando...</p>}

      {!loading && !error && filtrados.length === 0 && (
        <div className="bg-surface rounded-panel p-8 text-center">
          <p className="text-textDim">Sin movimientos en {etiquetaMes}</p>
        </div>
      )}

      <div className="space-y-2">
        {filtrados.map(t => (
          <FilaTxn
            key={t.id}
            txn={t}
            color={coloresCategorias[t.categoria]}
            editable={esEditable(t)}
            pendienteBorrar={porConfirmar}
            onEditar={() => setEditando(t)}
            onBorrar={() => borrar(t.id)}
          />
        ))}
      </div>

      {ultimoBorrado && (
        <div className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto vidrio-panel rounded-panel px-4 py-3 flex items-center justify-between">
          <span className="text-text text-sm">Movimiento eliminado</span>
          <button onClick={deshacer} className="presionable text-accent text-sm font-semibold">
            Deshacer
          </button>
        </div>
      )}

      {editando && (
        <ModalEditarTxn
          txn={editando}
          actualizar={updateTxn}
          onCerrar={() => setEditando(null)}
        />
      )}

      {mostrarAlta && (
        <ModalNuevoMovimiento
          agregar={addTxn}
          agregarTransferencia={addTransferencia}
          onCerrar={() => setMostrarAlta(false)}
        />
      )}
    </div>
  )
}
