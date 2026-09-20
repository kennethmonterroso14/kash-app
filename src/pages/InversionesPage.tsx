// src/pages/InversionesPage.tsx
import { useState } from 'react'
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
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 gap-2">
        <div className="min-w-0">
          <h1 className="text-text font-display font-bold text-xl tracking-titulo">Inversiones</h1>
          {resumen.ganancia_total !== 0 && (
            <p className={`text-xs mt-0.5 font-mono ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
              {resumen.ganancia_total >= 0 ? '+' : ''}{fmt(resumen.ganancia_total)} total
            </p>
          )}
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
        <p role="alert" className="text-danger text-sm bg-danger/10 rounded-control p-3 mb-4">{error}</p>
      )}

      {resumen.capital_total > 0 && (
        <ResumenPortafolio resumen={resumen} evolucion={evolucionPortafolio} />
      )}

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {inversiones.length === 0 && !error && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-textDim text-sm">No tienes inversiones registradas</p>
          <p className="text-textDim text-xs mt-1">Agrega tu primera inversión para empezar</p>
        </div>
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
