import { Link } from 'react-router-dom'
import AvatarCategoria from '../../components/AvatarCategoria'
import type { Transaccion } from '../../hooks/useTransacciones'
import { useMoneda } from '../../hooks/useMoneda'
import { fechaCorta } from '../../lib/constants'

interface Props {
  txns: Transaccion[]
  coloresCategorias: Record<string, string>
  /** Cuántas filas. Resumen es un vistazo; la lista entera está en Movimientos. */
  n?: number
}

/**
 * Los últimos movimientos del mes mostrado, en una lista agrupada de vidrio
 * (una tarjeta, filas separadas por un filete), con "Ver todos" a Movimientos.
 */
export default function UltimosMovimientos({ txns, coloresCategorias, n = 5 }: Props) {
  const fmt = useMoneda()
  // Por fecha y, dentro del día, por alta: un alta optimista entra al principio
  // del arreglo sin reordenar, así que no se confía en el orden que trae.
  const ultimos = [...txns]
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, n)

  if (ultimos.length === 0) return null

  return (
    <section aria-labelledby="ultimos-titulo">
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 id="ultimos-titulo" className="text-text text-xl font-bold tracking-titulo">Últimos movimientos</h2>
        <Link to="/txns" className="text-accent text-[15px]">Ver todos</Link>
      </div>
      <ul className="vidrio-panel rounded-tarjeta px-4">
        {ultimos.map(t => (
          <li key={t.id} className="flex items-center gap-3 h-[60px] border-t border-perimetro first:border-t-0">
            <AvatarCategoria categoria={t.categoria} color={coloresCategorias[t.categoria]} />
            <div className="flex-1 min-w-0">
              <p className="text-text text-[16px] truncate">{t.descripcion}</p>
              <p className="text-textDim text-[13px] truncate">{t.categoria} · {fechaCorta(t.fecha)}</p>
            </div>
            <span className={`tabular-nums text-[16px] font-semibold shrink-0 ${t.cantidad > 0 ? 'text-success' : 'text-text'}`}>
              {t.cantidad > 0 ? '+' : ''}{fmt(t.cantidad)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
