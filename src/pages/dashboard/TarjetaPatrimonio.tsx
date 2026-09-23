import Aviso from '../../components/Aviso'
import type { Cuenta } from '../../hooks/useCuentas'
import { useMoneda } from '../../hooks/useMoneda'

const Ojo = ({ tachado }: { tachado: boolean }) => (
  <svg
    aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    className="text-textDim flex-shrink-0"
  >
    {tachado ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
)

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
        <p className="text-textDim text-xs uppercase tracking-widest">Patrimonio total</p>
        <div className="flex items-center gap-2">
          {oculto && (
            <span aria-hidden="true" className="text-textDim tracking-widest text-sm">••••••</span>
          )}
          <Ojo tachado={oculto} />
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
          <p className="text-3xl tabular-nums font-bold text-text tracking-display">
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
