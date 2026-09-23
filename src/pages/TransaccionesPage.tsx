import { useState, useRef, useMemo } from 'react'
import Aviso from '../components/Aviso'
import EstadoVacio from '../components/EstadoVacio'
import { useTransacciones, type Transaccion } from '../hooks/useTransacciones'
import { MESES } from '../lib/constants'
import { useSesion } from '../context/sesion'
import { useFechas } from '../hooks/useFechas'
import SelectorMes from '../components/SelectorMes'
import TituloGrande from '../components/TituloGrande'
import { IconoExportar } from '../components/iconos'
import { CLASE_BOTON_TITULO } from '../lib/clasesUI'
import FiltrosTxn, { type Filtros } from './transacciones/FiltrosTxn'
import FilaTxn from './transacciones/FilaTxn'
import ModalNuevoMovimiento from './transacciones/ModalNuevoMovimiento'
import ModalEditarTxn from './transacciones/ModalEditarTxn'
import { construirCSV, descargarCSV } from './transacciones/exportarCSV'

// Vive acá y no junto al componente: un archivo que exporta un componente Y
// un valor rompe el fast refresh.
const FILTROS_VACIOS: Filtros = { busqueda: '', tipo: '', cuenta: '' }

const SEGUNDOS_DESHACER = 6000

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

  // Los dos taps los maneja `BotonConfirmar`; esto es ya el segundo. Se ESPERA
  // el resultado: el trigger de deuda puede rechazar el borrado de un
  // movimiento de TC sin reparto registrado, y antes se ofrecía "Deshacer" de
  // un borrado que nunca ocurrió.
  const borrar = async (id: string) => {
    const txn = txns.find(t => t.id === id)
    if (!txn) return
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
    <div className="max-w-lg mx-auto px-4 pb-6">
      <TituloGrande
        titulo="Movimientos"
        accion={
          <button
            type="button"
            onClick={exportar}
            disabled={filtrados.length === 0}
            aria-label="Exportar a CSV"
            title="Exportar a CSV"
            className={CLASE_BOTON_TITULO}
          >
            <IconoExportar size={20} />
          </button>
        }
      />
      <div className="flex items-center justify-between mt-3 mb-5">
        <SelectorMes mes={mes} onCambiar={setMes} />
        <div className="flex gap-2 flex-shrink-0">
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
        <Aviso clase="mb-4" onCerrar={() => setErrorLista('')}>{errorLista}</Aviso>
      )}

      {/* Un fetch fallido NO se pinta como "sin movimientos": son afirmaciones
          distintas, y presentar la lista vacía como un hecho era la clase de
          bug que se corrigió en el resto de la app. */}
      {error && (
        <Aviso clase="mb-4">
          No se pudieron cargar los movimientos de {etiquetaMes}. {error}
        </Aviso>
      )}

      {loading && <p className="text-textDim text-center py-8">Cargando...</p>}

      {!loading && !error && filtrados.length === 0 && (
        <EstadoVacio titulo={`Sin movimientos en ${etiquetaMes}`} />
      )}

      <div className="space-y-2">
        {filtrados.map(t => (
          <FilaTxn
            key={t.id}
            txn={t}
            color={coloresCategorias[t.categoria]}
            editable={esEditable(t)}
            onEditar={() => setEditando(t)}
            onBorrar={() => borrar(t.id)}
          />
        ))}
      </div>

      {ultimoBorrado && (
        <div className="fixed z-40 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 max-w-lg mx-auto vidrio-panel rounded-panel px-4 py-3 flex items-center justify-between">
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
