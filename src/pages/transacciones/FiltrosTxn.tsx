import type { Cuenta } from '../../hooks/useCuentas'
import { IconoBuscar, IconoChevron } from '../../components/iconos'

export interface Filtros {
  busqueda: string
  tipo: string
  cuenta: string
}

interface Props {
  /** Lo que abre la fila de cápsulas: el selector de mes. */
  antes?: React.ReactNode
  filtros: Filtros
  onCambiar: (f: Filtros) => void
  cuentas: Cuenta[]
}

/**
 * Un filtro como cápsula: el `<select>` nativo sin su apariencia (el selector de
 * iOS sigue siendo el del sistema al tocarlo) y un chevron propio. Con un valor
 * elegido la cápsula se tiñe de acento, para que un filtro puesto no pase
 * desapercibido y la lista "vacía" no parezca un mes sin movimientos.
 */
function Capsula({ etiqueta, valor, onCambiar, children }: {
  etiqueta: string; valor: string; onCambiar: (v: string) => void; children: React.ReactNode
}) {
  return (
    <label className={`relative inline-flex items-center h-10 rounded-full shrink-0 ${valor ? 'bg-accent/15 text-accent' : 'vidrio-chip text-text'}`}>
      <select
        value={valor}
        onChange={e => onCambiar(e.target.value)}
        aria-label={etiqueta}
        className="appearance-none bg-transparent h-full pl-4 pr-8 text-[15px] font-medium rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </select>
      <IconoChevron direccion="abajo" size={14} className="absolute right-3 pointer-events-none opacity-70" />
    </label>
  )
}

export default function FiltrosTxn({ antes, filtros, onCambiar, cuentas }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onCambiar({ ...filtros, [k]: v })

  return (
    <div className="space-y-2.5 mb-4">
      <label className="flex items-center gap-2 h-10 px-3 rounded-full bg-vidrio-relleno text-textDim focus-within:ring-2 focus-within:ring-accent">
        <IconoBuscar size={18} className="shrink-0" />
        <input
          type="search"
          placeholder="Buscar"
          aria-label="Buscar movimientos"
          value={filtros.busqueda}
          onChange={e => set('busqueda', e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-text text-[15px] placeholder:text-textDim focus:outline-none"
        />
      </label>
      {/* Carril horizontal a sangre: a 390px el mes y los dos filtros no entran
          en una fila, y partirlos en dos renglones descuadra la cabecera. */}
      <div className="flex gap-2 items-center overflow-x-auto overscroll-x-contain -mx-4 px-4 pb-0.5 [scrollbar-width:none]">
        {antes}
        <Capsula etiqueta="Filtrar por tipo" valor={filtros.tipo} onCambiar={v => set('tipo', v)}>
          <option value="">Todos</option>
          <option value="gasto">Gastos</option>
          <option value="ingreso">Ingresos</option>
          <option value="ajuste">Ajustes</option>
        </Capsula>
        <Capsula etiqueta="Filtrar por cuenta" valor={filtros.cuenta} onCambiar={v => set('cuenta', v)}>
          <option value="">Todas las cuentas</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Capsula>
      </div>
    </div>
  )
}
