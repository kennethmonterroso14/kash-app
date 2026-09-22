import { useState } from 'react'
import { motion } from 'motion/react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { IconoAlerta } from '../../components/iconos'
import { toCentavos } from '../../lib/finanzas'
import { useSesion } from '../../context/sesion'
import { useMoneda } from '../../hooks/useMoneda'
import { useFechas } from '../../hooks/useFechas'
import { AL_INSTANTE, posicionIndicador, RESORTE_SEGMENTO, useMenosMovimiento } from '../../lib/movimiento'
import type { useTransacciones } from '../../hooks/useTransacciones'

type Tipo = 'gasto' | 'ingreso' | 'gasto_tc' | 'transferencia'

const ETIQUETAS: Record<Tipo, string> = {
  gasto: 'Gasto', ingreso: 'Ingreso', gasto_tc: 'Cargo TC', transferencia: 'Transferencia',
}
/** El orden del riel, que es también el que usa el indicador para ubicarse. */
const TIPOS = Object.keys(ETIQUETAS) as Tipo[]

// Clases literales por tipo: `bg-${tipo}` no lo ve el JIT de Tailwind.
// El fondo y el texto van separados porque el fondo lo pinta el indicador que
// se desliza y el texto lo pinta cada pestaña.
const FONDO_TAB: Record<Tipo, string> = {
  ingreso:       'bg-accent',
  gasto:         'bg-danger',
  gasto_tc:      'bg-warning/20',
  transferencia: 'bg-accentAlt',
}
const TEXTO_TAB: Record<Tipo, string> = {
  ingreso:       'text-bg',
  gasto:         'text-text',
  gasto_tc:      'text-warning',
  transferencia: 'text-bg',
}
const CLASE_SUBMIT: Record<Tipo, string> = {
  ingreso:       'bg-accent text-bg',
  gasto:         'bg-danger text-text',
  gasto_tc:      'bg-warning/20 text-warning border border-warning/40',
  transferencia: 'bg-accentAlt text-bg',
}

interface Props {
  agregar: ReturnType<typeof useTransacciones>['addTxn']
  agregarTransferencia: ReturnType<typeof useTransacciones>['addTransferencia']
  onCerrar: () => void
}

/**
 * Alta de movimientos. Cuatro tipos, tres caminos de escritura distintos:
 * `gasto`/`ingreso` insertan una fila, `transferencia` inserta DOS en una
 * llamada, y `gasto_tc` va por `registrarCargo` del contexto porque pega en la
 * deuda de la tarjeta y no en una cuenta.
 */
export default function ModalNuevoMovimiento({ agregar, agregarTransferencia, onCerrar }: Props) {
  const { cuentas, categoriasGasto, categoriasIngreso, resumenTCs, registrarCargo } = useSesion()
  // Un <label> sin `htmlFor` no lo anuncia el lector de pantalla y tocarlo no
  // enfoca el campo. useId() da prefijos únicos por instancia del modal.
  const fmt = useMoneda()
  const fechas = useFechas()
  const reducido = useMenosMovimiento()

  const [tipo, setTipo] = useState<Tipo>('gasto')
  const [cantidad, setCantidad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  // Del contexto y no de las constantes: importar CATEGORIAS_GASTO directo se
  // come las categorías propias del usuario.
  const [categoria, setCategoria] = useState(categoriasGasto[0])
  const [fecha, setFecha] = useState(fechas.hoy())
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? '')
  const [tcId, setTcId] = useState(resumenTCs[0]?.tc.id ?? '')
  const [transferDe, setTransferDe] = useState('')
  const [transferA, setTransferA] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const categorias = tipo === 'ingreso' ? categoriasIngreso : categoriasGasto

  const cambiarTipo = (t: Tipo) => {
    setTipo(t)
    setCategoria(t === 'ingreso' ? categoriasIngreso[0] : categoriasGasto[0])
    if (t === 'transferencia') { setTransferDe(''); setTransferA('') }
  }

  // Aviso del disponible que quedaría en la TC. Sobre el monto ya validado:
  // pasarle un parseFloat crudo a toCentavos lo haría lanzar en pleno render.
  const montoNum = parseFloat(cantidad)
  const tcSel = resumenTCs.find(r => r.tc.id === tcId)
  const trasCargo = tipo === 'gasto_tc' && tcSel && !isNaN(montoNum) && montoNum > 0
    ? tcSel.tc.limite_credito - tcSel.tc.deuda_actual - toCentavos(montoNum)
    : null

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const val = parseFloat(cantidad)
    if (isNaN(val) || val <= 0) return setErr('Ingresa un monto mayor a Q0')

    setGuardando(true)
    try {
      if (tipo === 'transferencia') {
        if (!transferDe || !transferA)   return setErr('Selecciona ambas cuentas')
        if (transferDe === transferA)    return setErr('Las cuentas deben ser distintas')
        const { error } = await agregarTransferencia({
          deCuentaId: transferDe,
          aCuentaId: transferA,
          cantidad: toCentavos(val),
          descripcion: descripcion || 'Transferencia',
          fecha,
        })
        if (error) return setErr(typeof error === 'string' ? error : error.message)
      } else if (tipo === 'gasto_tc') {
        if (!tcId) return setErr('Selecciona una tarjeta')
        await registrarCargo({
          tarjeta_id:  tcId,
          monto:       toCentavos(val),
          descripcion: descripcion.trim() || categoria,
          categoria,
          fecha,
        })
      } else {
        if (!descripcion.trim()) return setErr('Agrega una descripción')
        if (!cuentaId)           return setErr('Selecciona una cuenta')
        // El signo lo aplica el llamador: la constraint de la base exige
        // negativo para un gasto y positivo para un ingreso.
        const centavos = toCentavos(val)
        const { error } = await agregar({
          cuenta_id: cuentaId,
          cantidad: tipo === 'gasto' ? -centavos : centavos,
          descripcion, categoria, tipo, fecha,
        })
        if (error) return setErr(typeof error === 'string' ? error : error.message)
      }
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const campoFecha = (
    <Campo etiqueta="Fecha" tipo="date" value={fecha} onChange={e => setFecha(e.target.value)} />
  )

  return (
    <Hoja titulo="Nuevo movimiento" onCerrar={onCerrar}>
      <div className="relative flex gap-1 bg-bg rounded-control p-1">
        {/* El indicador se desliza entre pestañas (§7): dice de dónde vino la
            selección. La posición sale de la aritmética y no del `layoutId` de
            Motion, que habría costado +37 KB gzip por medir lo que acá ya se
            sabe: las cuatro pestañas son `flex-1`, todas del mismo ancho. */}
        <motion.span
          aria-hidden="true"
          className={`absolute top-1 bottom-1 left-1 rounded-chip ${FONDO_TAB[tipo]}`}
          style={{ width: posicionIndicador(TIPOS.indexOf(tipo), TIPOS.length).width }}
          animate={{ transform: posicionIndicador(TIPOS.indexOf(tipo), TIPOS.length).transform }}
          transition={reducido ? AL_INSTANTE : RESORTE_SEGMENTO}
        />
        {TIPOS.map(t => (
          <button
            key={t}
            onClick={() => cambiarTipo(t)}
            // 11px y px-1: con text-xs, "Transferencia" se salía del riel de
            // pestañas a 390px.
            className={`presionable relative flex-1 min-w-0 px-1 py-2 rounded-chip text-[11px] font-medium ${
              tipo === t ? TEXTO_TAB[t] : 'text-textDim'
            }`}
          >
            <span className="relative">{ETIQUETAS[t]}</span>
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Monto (Q)" tipo="number" step="0.01" min="0.01" required placeholder="0.00"
          value={cantidad} onChange={e => setCantidad(e.target.value)}
          clase="text-xl tabular-nums"
        />

        {tipo === 'transferencia' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="De cuenta" tipo="select" required value={transferDe} onChange={e => setTransferDe(e.target.value)}>
                <option value="">Seleccionar</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Campo>
              <Campo etiqueta="A cuenta" tipo="select" required value={transferA} onChange={e => setTransferA(e.target.value)}>
                <option value="">Seleccionar</option>
                {cuentas.filter(c => c.id !== transferDe).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Campo>
            </div>
            <Campo
              etiqueta="Descripción (opcional)" placeholder="ej. Ahorro mensual"
              value={descripcion} onChange={e => setDescripcion(e.target.value)}
            />
            {campoFecha}
          </>
        ) : (
          <>
            <Campo
              etiqueta="Descripción" required placeholder="¿En qué?"
              value={descripcion} onChange={e => setDescripcion(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Categoría" tipo="select" value={categoria} onChange={e => setCategoria(e.target.value)}>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </Campo>
              {tipo === 'gasto_tc' ? (
                <Campo etiqueta="Tarjeta" tipo="select" value={tcId} onChange={e => setTcId(e.target.value)}>
                  {resumenTCs.length === 0
                    ? <option value="">Sin tarjetas</option>
                    : resumenTCs.map(({ tc, resumen }) => (
                      <option key={tc.id} value={tc.id}>{tc.nombre} — {fmt(resumen.disponible)}</option>
                    ))}
                </Campo>
              ) : (
                <Campo etiqueta="Cuenta" tipo="select" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Campo>
              )}
            </div>
            {trasCargo !== null && (
              <p className={`text-xs tabular-nums flex items-center gap-1 flex-wrap ${trasCargo >= 0 ? 'text-success' : 'text-danger'}`}>
                <span>Disponible tras cargo: {fmt(Math.max(0, trasCargo))}</span>
                {trasCargo < 0 && (
                  <span className="flex items-center gap-1">
                    <IconoAlerta size={12} className="shrink-0" /> excede disponible
                  </span>
                )}
              </p>
            )}
            {campoFecha}
          </>
        )}

        {err && <Aviso>{err}</Aviso>}

        <button
          type="submit"
          disabled={guardando || (tipo === 'transferencia' && transferDe === transferA)}
          className={`presionable w-full font-semibold py-3 rounded-control disabled:opacity-50 ${CLASE_SUBMIT[tipo]}`}
        >
          {guardando ? 'Guardando...'
            : tipo === 'transferencia' ? 'Transferir'
            : tipo === 'gasto_tc' ? 'Registrar cargo'
            : 'Guardar'}
        </button>
      </form>
    </Hoja>
  )
}
