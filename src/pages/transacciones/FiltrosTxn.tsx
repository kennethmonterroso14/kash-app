import type { Cuenta } from '../../hooks/useCuentas'

export interface Filtros {
  busqueda: string
  tipo: string
  cuenta: string
}

interface Props {
  filtros: Filtros
  onCambiar: (f: Filtros) => void
  cuentas: Cuenta[]
}

const CLASE = 'vidrio-panel border border-canto rounded-control px-3 py-2 text-text text-sm focus:outline-none focus:border-accent'

export default function FiltrosTxn({ filtros, onCambiar, cuentas }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onCambiar({ ...filtros, [k]: v })

  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <input
        type="search"
        placeholder="Buscar..."
        value={filtros.busqueda}
        onChange={e => set('busqueda', e.target.value)}
        className={`flex-1 min-w-32 ${CLASE}`}
      />
      <select value={filtros.tipo} onChange={e => set('tipo', e.target.value)} aria-label="Filtrar por tipo" className={CLASE}>
        <option value="">Todos</option>
        <option value="gasto">Gastos</option>
        <option value="ingreso">Ingresos</option>
        <option value="ajuste">Ajustes</option>
      </select>
      <select value={filtros.cuenta} onChange={e => set('cuenta', e.target.value)} aria-label="Filtrar por cuenta" className={CLASE}>
        <option value="">Todas</option>
        {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
    </div>
  )
}
