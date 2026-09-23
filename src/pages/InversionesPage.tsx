// src/pages/InversionesPage.tsx
import { useState } from 'react'
import Aviso from '../components/Aviso'
import EstadoVacio from '../components/EstadoVacio'
import { IconoAlerta, IconoMas, IconoTendencia } from '../components/iconos'
import { useInversiones, type Inversion } from '../hooks/useInversiones'
import { useSesion } from '../context/sesion'
import { useMoneda } from '../hooks/useMoneda'
import ResumenPortafolio from './inversiones/ResumenPortafolio'
import InversionTile from './inversiones/InversionTile'
import ModalInversion from './inversiones/ModalInversion'
import ModalActualizarValor from './inversiones/ModalActualizarValor'
import ModalTipoCambio from './inversiones/ModalTipoCambio'
import { estaDesactualizado } from './inversiones/tipoCambio'

type Pantalla = 'lista' | 'nueva' | 'editar' | 'actualizar_valor' | 'tipo_cambio'

export default function InversionesPage() {
  const { userId } = useSesion()
  const fmt = useMoneda()
  const {
    inversiones, resumen, evolucionPortafolio,
    tipoCambioUSD, tipoCambioFecha, tieneUSD,
    loading, error,
    agregarInversion, actualizarValor, archivarInversion, actualizarTipoCambio,
    actualizarInversion, fetchTipoCambioDesdeAPI,
  } = useInversiones(userId)

  const [pantalla, setPantalla] = useState<Pantalla>('lista')
  const [selId, setSelId] = useState<string | null>(null)
  const sel: Inversion | null = inversiones.find(i => i.id === selId) ?? null

  const abrir = (p: Pantalla, id?: string) => {
    if (id) setSelId(id)
    setPantalla(p)
  }
  const volver = () => setPantalla('lista')

  // El reloj se lee UNA vez, en el inicializador del estado, y no en cada
  // render: leerlo en el cuerpo del componente lo vuelve impuro (lo marca
  // react-hooks/purity). Para un aviso de "hace 7+ días" alcanza con la marca
  // del montaje.
  const [montadoEn] = useState(() => Date.now())
  const desactualizado = estaDesactualizado(tipoCambioFecha, montadoEn)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-textDim text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4">
      {error && <Aviso>{error}</Aviso>}

      {resumen.capital_total > 0 && (
        <ResumenPortafolio resumen={resumen} evolucion={evolucionPortafolio} />
      )}

      {/* Las acciones en cápsulas, debajo de la cabecera y no en una fila
          suelta arriba: agregar una inversión y el tipo de cambio que usa la
          conversión. Con el tipo de cambio viejo la cápsula se pone en aviso. */}
      <div className="flex gap-2">
        <button
          onClick={() => abrir('nueva')}
          className="presionable flex-1 h-11 rounded-full bg-accent/15 text-accent text-[15px] font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <IconoMas size={18} /> Nueva inversión
        </button>
        {tieneUSD && (
          <button
            onClick={() => abrir('tipo_cambio')}
            aria-label={`Tipo de cambio: ${fmt(tipoCambioUSD)} por dólar${desactualizado ? ', desactualizado' : ''}`}
            className={`presionable h-11 px-4 rounded-full text-[15px] font-semibold tabular-nums inline-flex items-center gap-1.5 whitespace-nowrap ${
              desactualizado ? 'bg-warning/15 text-warning' : 'vidrio-chip text-text'
            }`}
          >
            {desactualizado && <IconoAlerta size={16} />}
            {fmt(tipoCambioUSD)} / USD
          </button>
        )}
      </div>

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {inversiones.length === 0 && !error && (
        <EstadoVacio
          icono={<IconoTendencia size={26} />}
          titulo="No tienes inversiones registradas"
          pista="Agrega tu primera inversión para empezar."
        />
      )}

      {inversiones.length > 0 && (
        <h2 className="text-text text-xl font-bold tracking-titulo px-1 pt-2">Tus inversiones</h2>
      )}
      <div className="flex flex-col gap-3">
        {inversiones.map(inv => (
          <InversionTile
            key={inv.id}
            inv={inv}
            tipoCambioUSD={tipoCambioUSD}
            onEditar={() => abrir('editar', inv.id)}
            onActualizar={() => abrir('actualizar_valor', inv.id)}
          />
        ))}
      </div>

      {pantalla === 'nueva' && (
        <ModalInversion agregar={agregarInversion} actualizar={actualizarInversion} onCerrar={volver} />
      )}
      {pantalla === 'editar' && sel && (
        <ModalInversion inv={sel} agregar={agregarInversion} actualizar={actualizarInversion} onCerrar={volver} />
      )}
      {pantalla === 'actualizar_valor' && sel && (
        <ModalActualizarValor
          inv={sel}
          actualizarValor={actualizarValor}
          archivar={archivarInversion}
          onCerrar={volver}
        />
      )}
      {pantalla === 'tipo_cambio' && (
        <ModalTipoCambio
          tipoCambioUSD={tipoCambioUSD}
          tipoCambioFecha={tipoCambioFecha}
          desactualizado={desactualizado}
          guardar={actualizarTipoCambio}
          consultarAPI={fetchTipoCambioDesdeAPI}
          onCerrar={volver}
        />
      )}
    </div>
  )
}
