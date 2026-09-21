// src/pages/TarjetasPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Aviso from '../components/Aviso'
import { useSesion } from '../context/sesion'
import { useMoneda } from '../hooks/useMoneda'
import TarjetaTile from './tarjetas/TarjetaTile'
import ModalTC from './tarjetas/ModalTC'
import ModalCargo from './tarjetas/ModalCargo'
import ModalPago from './tarjetas/ModalPago'
import ModalCerrarCiclo from './tarjetas/ModalCerrarCiclo'

type Pantalla = 'lista' | 'nueva_tc' | 'editar_tc' | 'cargo' | 'pago' | 'cerrar'

/**
 * La página quedó siendo lo que es: la lista y qué modal está abierto. Cada
 * sección vive en `./tarjetas/`, y el estado de cada formulario vive dentro de
 * su modal — antes eran 21 `useState` acá arriba más cuatro helpers que los
 * reseteaban a mano antes de abrir cada pantalla.
 */
export default function TarjetasPage() {
  // Todo sale del contexto: antes esta página volvía a montar useTarjetas
  // aunque el provider ya lo tiene, así que la consulta se hacía dos veces.
  const { resumenTCs, totalDeuda, cargando, error: errores } = useSesion()
  const fmt = useMoneda()
  const navigate = useNavigate()

  const [pantalla, setPantalla] = useState<Pantalla>('lista')
  const [tcSelId, setTcSelId]   = useState<string | null>(null)
  const tcSel = resumenTCs.find(r => r.tc.id === tcSelId) ?? null

  const abrir = (p: Pantalla, tcId?: string) => {
    if (tcId) setTcSelId(tcId)
    setPantalla(p)
  }
  const volver = () => setPantalla('lista')

  if (cargando.tarjetas) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-textDim text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-text font-display font-bold text-xl tracking-titulo">Tarjetas de Crédito</h1>
          {totalDeuda > 0 && (
            <p className="text-danger text-xs mt-0.5">
              Deuda total: <span className="font-mono">{fmt(totalDeuda)}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => abrir('nueva_tc')}
          className="presionable bg-accent text-bg px-4 py-2 rounded-control text-sm font-semibold"
        >
          + Nueva TC
        </button>
      </div>

      {errores.tarjetas && (
        <Aviso clase="mb-4">{errores.tarjetas}</Aviso>
      )}

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {!errores.tarjetas && resumenTCs.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-textDim text-sm">No tienes tarjetas registradas</p>
          <p className="text-textDim text-xs mt-1">Agrega tu primera TC para empezar</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {resumenTCs.map(({ tc, resumen }) => (
          <TarjetaTile
            key={tc.id}
            tc={tc}
            resumen={resumen}
            onEditar={() => abrir('editar_tc', tc.id)}
            onCargo={() => abrir('cargo', tc.id)}
            onPago={() => abrir('pago', tc.id)}
            onCerrarCiclo={() => abrir('cerrar', tc.id)}
            onHistorial={() => navigate(`/tarjetas/${tc.id}/historial`)}
          />
        ))}
      </div>

      {pantalla === 'nueva_tc' && <ModalTC onCerrar={volver} />}
      {pantalla === 'editar_tc' && tcSel && <ModalTC tc={tcSel.tc} onCerrar={volver} />}
      {pantalla === 'cargo'     && tcSel && <ModalCargo tc={tcSel.tc} onCerrar={volver} />}
      {pantalla === 'pago'      && tcSel && <ModalPago tc={tcSel.tc} onCerrar={volver} />}
      {pantalla === 'cerrar'    && tcSel && <ModalCerrarCiclo tc={tcSel.tc} onCerrar={volver} />}
    </div>
  )
}
