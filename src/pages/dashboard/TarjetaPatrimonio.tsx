import Aviso from '../../components/Aviso'
import type { Cuenta } from '../../hooks/useCuentas'
import { useMoneda } from '../../hooks/useMoneda'
import { IconoOjo } from '../../components/iconos'

interface Props {
  total: number
  cuentas: Cuenta[]
  error: string | null
  oculto: boolean
  onAlternar: () => void
}

export default function TarjetaPatrimonio({ total, cuentas, error, oculto, onAlternar }: Props) {
  const fmt = useMoneda()

  return (
    <div className="vidrio-panel rounded-tarjeta p-5">
      <button
        type="button"
        onClick={onAlternar}
        aria-pressed={oculto}
        aria-label={oculto ? 'Mostrar saldos' : 'Ocultar saldos'}
        className="presionable w-full flex justify-between items-center mb-1"
      >
        <p className="text-textDim text-[15px] font-semibold">Patrimonio total</p>
        <div className="flex items-center gap-2">
          {oculto && (
            <span aria-hidden="true" className="text-textDim tracking-widest text-sm">••••••</span>
          )}
          <IconoOjo tachado={oculto} size={16} className="text-textDim flex-shrink-0" />
        </div>
      </button>

      {error && (
        <Aviso clase="mt-2">
          No se pudieron cargar tus cuentas: {error}
        </Aviso>
      )}

      {!oculto && (
        <>
          {/* Con la consulta fallida el total es 0, y mostrar ese 0 como un
              hecho es justo el defecto que se estaba corrigiendo. */}
          <p className="text-[40px] leading-[46px] tabular-nums font-bold text-text tracking-display">
            {error ? '—' : fmt(total)}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {cuentas.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 bg-vidrio-relleno rounded-chip px-2 py-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <span className="text-xs text-textDim">{c.nombre}</span>
                <span className="text-xs tabular-nums text-text">{fmt(c.saldo)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
