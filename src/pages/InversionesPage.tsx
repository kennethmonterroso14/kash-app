// src/pages/InversionesPage.tsx
import { useState } from 'react'
import Aviso from '../components/Aviso'
import EstadoVacio from '../components/EstadoVacio'
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
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
      {/* Sin <h1>: el riel de pestañas de la sección ya dice "Inversiones", y
          repetirlo le hace anunciar dos veces lo mismo al lector de pantalla. */}
      <div className="flex items-center justify-between mb-6 gap-2">
        <div className="min-w-0">
          {resumen.ganancia_total !== 0 ? (
            <p className={`text-sm font-mono font-semibold ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
              {resumen.ganancia_total >= 0 ? '+' : ''}{fmt(resumen.ganancia_total)}
              <span className="text-textDim font-sans text-xs font-normal"> de ganancia</span>
            </p>
          ) : <span />}
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          {tieneUSD && (
            <button
              onClick={() => abrir('tipo_cambio')}
              className={`presionable text-xs px-3 py-1.5 rounded-chip whitespace-nowrap ${
                desactualizado
                  ? 'bg-warning/10 text-warning border border-warning/30'
                  : 'bg-surface2 text-textDim hover:text-text'
              }`}
            >
              {desactualizado ? '⚠ ' : ''}Q{(tipoCambioUSD / 100).toFixed(2)}/USD
            </button>
          )}
          <button
            onClick={() => abrir('nueva')}
            className="presionable bg-accent text-bg px-4 py-2 rounded-control text-sm font-semibold"
          >
            + Nueva
          </button>
        </div>
      </div>

      {error && (
        <Aviso clase="mb-4">{error}</Aviso>
      )}

      {resumen.capital_total > 0 && (
        <ResumenPortafolio resumen={resumen} evolucion={evolucionPortafolio} />
      )}

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {inversiones.length === 0 && !error && (
        <EstadoVacio
          icono="📈"
          titulo="No tienes inversiones registradas"
          pista="Agrega tu primera inversión para empezar"
        />
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
