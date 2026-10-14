import { useState } from 'react'
import ModalTipoCambio from './ModalTipoCambio'
import { IconoAlerta } from './iconos'
import { useMoneda } from '../hooks/useMoneda'
import { useTipoCambio } from '../hooks/useTipoCambio'

/**
 * La cápsula "Q7.75 / USD" que abre la hoja del tipo de cambio. En ámbar si
 * tiene más de 7 días sin actualizar o nunca se verificó: con ese número se
 * convierte el patrimonio, y uno viejo lo infla o lo achica sin avisar.
 */
export default function BotonTipoCambio({ clase = '' }: { clase?: string }) {
  const fmt = useMoneda()
  const { tipoCambioUSD, desactualizado } = useTipoCambio()
  const [abierta, setAbierta] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`Tipo de cambio: ${fmt(tipoCambioUSD)} por dólar${desactualizado ? ', desactualizado' : ''}`}
        className={`presionable h-11 px-4 rounded-full text-[15px] font-semibold tabular-nums inline-flex items-center gap-1.5 whitespace-nowrap ${
          desactualizado ? 'bg-warning/15 text-warning' : 'vidrio-chip text-text'
        } ${clase}`}
      >
        {desactualizado && <IconoAlerta size={16} />}
        {fmt(tipoCambioUSD)} / USD
      </button>
      {abierta && <ModalTipoCambio onCerrar={() => setAbierta(false)} />}
    </>
  )
}
