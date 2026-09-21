import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Aviso from '../components/Aviso'
import EstadoVacio from '../components/EstadoVacio'
import { usePagosRecurrentes, type PagoRecurrente } from '../hooks/usePagosRecurrentes'
import { useSesion } from '../context/sesion'
import { useFechas } from '../hooks/useFechas'
import FilaPago, { type EstadoPago } from './pagos/FilaPago'
import ModalPagoFijo, { type CamposPago } from './pagos/ModalPagoFijo'


export default function PagosRecurrentesPage() {
  const navigate = useNavigate()
  const { userId, cuentas } = useSesion()
  const fechas = useFechas()
  const { pagos, loading, error, addPago, updatePago, deletePago } = usePagosRecurrentes(userId)

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState<PagoRecurrente | null>(null)

  const nombreCuenta = useMemo(() => {
    const map: Record<string, string> = {}
    cuentas.forEach(c => { map[c.id] = c.nombre })
    return map
  }, [cuentas])

  // El día y el mes salen de la zona del usuario, no del calendario del
  // navegador: de ahí depende si un pago se muestra como vencido.
  const hoy = fechas.hoy()
  const diaHoy = parseInt(hoy.split('-')[2], 10)
  const mesHoy = hoy.substring(0, 7)

  const estadoDe = (p: PagoRecurrente): EstadoPago => {
    // La idempotencia del auto-aplicador es POR MES, así que el estado se lee
    // igual: comparar la fecha completa marcaría como pendiente algo ya
    // aplicado este mes en otro día.
    if (p.ultima_aplicacion?.startsWith(mesHoy)) return 'aplicado'
    return p.dia_del_mes <= diaHoy ? 'pendiente' : 'proximo'
  }

  const guardarAlta = async (campos: CamposPago) => {
    const { error: err } = await addPago(campos)
    return err ? String(err) : null
  }

  const guardarEdicion = async (campos: CamposPago) => {
    if (!editando) return 'El pago ya no existe'
    const { error: err } = await updatePago(editando.id, campos)
    return err ? err.message : null
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-textDim text-center">Cargando...</p>
      </div>
    )
  }

  const botonAgregar = (texto: string, clases: string) => (
    <button
      onClick={() => setMostrarAlta(true)}
      className={`presionable bg-accent text-bg font-semibold ${clases}`}
    >
      {texto}
    </button>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* Se llega desde Ajustes y no hay riel ni nav que la marque, así que
              la pantalla tiene que decir cómo salir. */}
          <button
            onClick={() => navigate('/ajustes')}
            aria-label="Volver a Ajustes"
            className="presionable text-accent text-xl px-1 flex-shrink-0"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="text-text font-semibold text-lg tracking-titulo">Pagos Fijos</h1>
            <p className="text-textDim text-xs mt-0.5 tracking-micro">Se aplican automáticamente cada mes</p>
          </div>
        </div>
        {botonAgregar('+ Agregar', 'text-sm px-4 py-2 rounded-control flex-shrink-0')}
      </div>

      {error && (
        <Aviso>{error}</Aviso>
      )}

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {!error && pagos.length === 0 && (
        <EstadoVacio
          titulo="Sin pagos fijos aún"
          pista="Configura tus pagos recurrentes (renta, gym, suscripciones…) y se aplicarán solos cada mes."
        >
          {botonAgregar('+ Agregar pago fijo', 'px-6 py-2.5 rounded-control')}
        </EstadoVacio>
      )}

      {pagos.map(p => (
        <FilaPago
          key={p.id}
          pago={p}
          estado={estadoDe(p)}
          nombreCuenta={nombreCuenta[p.cuenta_id] ?? '—'}
          onEditar={() => setEditando(p)}
          onBorrar={() => void deletePago(p.id)}
        />
      ))}

      {mostrarAlta && <ModalPagoFijo guardar={guardarAlta} onCerrar={() => setMostrarAlta(false)} />}
      {editando && (
        <ModalPagoFijo pago={editando} guardar={guardarEdicion} onCerrar={() => setEditando(null)} />
      )}
    </div>
  )
}
