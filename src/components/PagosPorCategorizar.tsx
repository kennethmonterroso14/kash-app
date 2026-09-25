import { useState } from 'react'
import Aviso from './Aviso'
import Hoja from './Hoja'
import SelectorCategoria from './SelectorCategoria'
import { IconoChevron, IconoTarjetas } from './iconos'
import { useSesion } from '../context/sesion'
import { useMoneda } from '../hooks/useMoneda'
import { usePorCategorizar } from '../hooks/usePorCategorizar'
import { fechaCorta } from '../lib/constants'

interface Props { userId: string }

/**
 * Aviso global: "2 pagos de Apple Pay por categorizar". Los pagos ya están
 * registrados (saldo y deuda al día) con la categoría que se aprendió del
 * comercio; acá la persona la confirma o la cambia, uno por uno, de un toque.
 *
 * Vive en el Layout, junto a las alertas de tarjetas, porque la persona abre la
 * app en cualquier pantalla después de pagar.
 */
export default function PagosPorCategorizar({ userId }: Props) {
  const { categoriasGasto, coloresCategorias, generacionTxns, invalidarTxns } = useSesion()
  const fmt = useMoneda()
  const { pendientes, categorizar } = usePorCategorizar(userId, generacionTxns)
  const [abierta, setAbierta] = useState(false)
  // La categoría elegida para el pago que se está viendo; null = la sugerida.
  const [elegida, setElegida] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  if (pendientes.length === 0 && !abierta) return null

  const actual = pendientes[0]
  const n = pendientes.length
  const categoria = elegida ?? actual?.categoria ?? 'Otros'
  // La sugerida puede no estar en la lista (una categoría propia que se borró):
  // se agrega para que se vea marcada en lugar de no marcar nada.
  const opciones = actual && !categoriasGasto.includes(actual.categoria)
    ? [actual.categoria, ...categoriasGasto]
    : categoriasGasto

  const guardar = async () => {
    if (!actual) return
    setGuardando(true)
    setError('')
    const fallo = await categorizar(actual.id, categoria)
    setGuardando(false)
    if (fallo) { setError(fallo); return }
    setElegida(null)
    invalidarTxns()
    if (n === 1) setAbierta(false)
  }

  return (
    <>
      {n > 0 && (
        <section aria-label="Pagos por categorizar" className="max-w-lg mx-auto px-4 pt-3">
          <button
            type="button"
            onClick={() => { setAbierta(true); setElegida(null); setError('') }}
            className="presionable vidrio-panel rounded-tarjeta w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span aria-hidden="true" className="grid place-items-center w-9 h-9 rounded-[10px] bg-accent/15 text-accent shrink-0">
              <IconoTarjetas size={19} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-text text-[15px] font-semibold">
                {n === 1 ? '1 pago de Apple Pay' : `${n} pagos de Apple Pay`} por categorizar
              </span>
              <span className="block text-textDim text-[13px] truncate">Toca para elegir la categoría</span>
            </span>
            <IconoChevron direccion="der" size={16} className="text-textDim shrink-0" />
          </button>
        </section>
      )}

      {abierta && actual && (
        <Hoja titulo={n === 1 ? 'Elige la categoría' : `Elige la categoría · quedan ${n}`} onCerrar={() => setAbierta(false)}>
          <div className="text-center">
            <p className="text-text text-[34px] leading-[40px] font-bold tabular-nums tracking-display">
              {fmt(Math.abs(actual.cantidad))}
            </p>
            <p className="text-text text-[17px] font-semibold mt-1 truncate">{actual.descripcion}</p>
            <p className="text-textDim text-[13px]">
              {[actual.tarjeta, actual.tipo === 'gasto_tc' ? 'tarjeta de crédito' : null, fechaCorta(actual.fecha)]
                .filter(Boolean).join(' · ')}
            </p>
          </div>

          <SelectorCategoria
            categorias={opciones}
            colores={coloresCategorias}
            valor={categoria}
            onCambiar={setElegida}
          />

          {error && <Aviso>{error}</Aviso>}

          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            className="presionable w-full h-12 rounded-full bg-accent text-bg font-semibold disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : n > 1 ? `Guardar · ${categoria}` : `Listo · ${categoria}`}
          </button>
        </Hoja>
      )}
    </>
  )
}
