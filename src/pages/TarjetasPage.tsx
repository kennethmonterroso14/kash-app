// src/pages/TarjetasPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Aviso from '../components/Aviso'
import TituloGrande from '../components/TituloGrande'
import { IconoMas, IconoTarjetas } from '../components/iconos'
import EstadoVacio from '../components/EstadoVacio'
import { CLASE_BOTON_TITULO } from '../lib/clasesUI'
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
    <div className="max-w-lg mx-auto px-4 pb-6">
      <div className="mb-5">
        <TituloGrande
          titulo="Tarjetas"
          subtitulo={totalDeuda > 0 && (
            <span className="text-danger">
              Deuda total: <span className="tabular-nums">{fmt(totalDeuda)}</span>
            </span>
          )}
          accion={
            <button
              type="button"
              onClick={() => abrir('nueva_tc')}
              aria-label="Nueva tarjeta"
              title="Nueva tarjeta"
              className={CLASE_BOTON_TITULO}
            >
              <IconoMas size={20} />
            </button>
          }
        />
      </div>

      {errores.tarjetas && (
        <Aviso clase="mb-4">{errores.tarjetas}</Aviso>
      )}

      {/* Vacío de verdad, no un fallo de consulta: el error se muestra arriba. */}
      {!errores.tarjetas && resumenTCs.length === 0 && (
        <EstadoVacio
          icono={<IconoTarjetas size={26} />}
          titulo="No tienes tarjetas registradas"
          pista="Agrega tu primera tarjeta con el + de arriba."
        />
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
