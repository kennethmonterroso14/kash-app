import type { ReactNode } from 'react'
import type { EstadisticasMes } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'
import { IconoAhorro, IconoGasto, IconoIngreso } from '../../components/iconos'

/** Meta mínima de ahorro, en % del ingreso del mes. */
const META_AHORRO = 25

interface Props {
  stats: EstadisticasMes
}

function Tile({ icono, tinte, etiqueta, children, clase = '', extra }: {
  icono: ReactNode; tinte: string; etiqueta: string; children: ReactNode; clase?: string
  /** Lo que va a la derecha del tile ancho. */
  extra?: ReactNode
}) {
  return (
    // Angosto, el icono va arriba y la cifra tiene todo el ancho; el tile ancho
    // (con `extra`) lo lleva al costado, como una fila.
    <div className={`vidrio-panel rounded-panel p-3.5 flex min-w-0 ${extra ? 'items-center gap-3' : 'flex-col gap-2'} ${clase}`}>
      <span aria-hidden="true" className={`grid place-items-center w-9 h-9 rounded-full shrink-0 ${tinte}`}>{icono}</span>
      <div className="min-w-0 flex-1">
        <p className="text-textDim text-[13px]">{etiqueta}</p>
        {children}
      </div>
      {extra}
    </div>
  )
}

/**
 * Los tres números del mes, en tiles como los de Salud: icono, etiqueta, cifra.
 * Ingresos y Gastos van de a dos y Ahorro ocupa la fila: en tres columnas un
 * monto de cinco cifras ya no entraba a 390px y se truncaba justo en la cifra.
 */
export default function StatsMes({ stats }: Props) {
  const fmt = useMoneda()
  const llegaALaMeta = stats.pctAhorro >= META_AHORRO

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile icono={<IconoIngreso size={18} />} tinte="bg-success/15 text-success" etiqueta="Ingresos">
        <p className="text-text tabular-nums font-semibold text-[17px] truncate">{fmt(stats.ingresos)}</p>
      </Tile>
      <Tile icono={<IconoGasto size={18} />} tinte="bg-danger/15 text-danger" etiqueta="Gastos">
        <p className="text-text tabular-nums font-semibold text-[17px] truncate">{fmt(stats.gastos)}</p>
      </Tile>
      <Tile icono={<IconoAhorro size={18} />} tinte="bg-accent/15 text-accent" etiqueta="Ahorro" clase="col-span-2"
        extra={
          // Sin ingresos el porcentaje de ahorro no significa nada.
          stats.ingresos > 0 && (
            <div className="text-right shrink-0">
              <p className={`text-[17px] font-semibold tabular-nums ${llegaALaMeta ? 'text-success' : 'text-danger'}`}>
                {stats.pctAhorro}%
              </p>
              <p className="text-textDim text-[12px]">{llegaALaMeta ? 'del ingreso' : `meta ${META_AHORRO}%`}</p>
            </div>
          )
        }
      >
        <p className={`tabular-nums font-semibold text-[17px] truncate ${stats.neto >= 0 ? 'text-text' : 'text-danger'}`}>
          {fmt(stats.neto)}
        </p>
      </Tile>
    </div>
  )
}
