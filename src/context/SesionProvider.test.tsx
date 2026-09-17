import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { SesionProvider } from './SesionProvider'
import { useSesion } from './sesion'

/**
 * Lo que se verifica acá es el punto de la tarea 1.1: que el provider cargue
 * CADA slice una sola vez, y que el fallo de uno no tumbe a los otros.
 *
 * Se adelantó a la tarea 1.5.6 del plan a propósito: migrar doce páginas sobre
 * un provider sin probar sería construir sobre algo no verificado.
 */

// Cuenta las consultas por tabla para poder afirmar "una sola vez por slice".
const conteo: Record<string, number> = {}
// Tablas que deben fallar en un test dado.
let tablasQueFallan = new Set<string>()

const filasPorTabla: Record<string, unknown[]> = {
  profiles: [{ nombre: 'Kenneth', moneda: 'GTQ', tipo_cambio_usd: 775, tipo_cambio_actualizado_at: null }],
  cuentas: [
    { id: 'c1', nombre: 'BI Ahorros', tipo: 'ahorro', saldo: 150000, color: '#4ade80', activa: true },
    { id: 'c2', nombre: 'Efectivo', tipo: 'efectivo', saldo: 50000, color: '#fb923c', activa: true },
  ],
  categorias_usuario: [{ id: 'k1', nombre: 'Mascotas', tipo: 'gasto', color: '#f97316' }],
  tarjetas_credito: [{
    id: 't1', nombre: 'BAC Visa', banco: 'BAC', ultimos_4: '1234',
    limite_credito: 1000000, deuda_actual: 25000, deuda_ciclo_anterior: 0,
    dia_cierre: 15, dia_pago: 5, color: '#7c6af7', activa: true,
  }],
}

vi.mock('../lib/supabase', () => {
  // Builder encadenable: cada método devuelve `this` y la promesa se resuelve
  // al await-earlo o al llamar .then/.maybeSingle, como hace supabase-js.
  const hacerQuery = (tabla: string) => {
    conteo[tabla] = (conteo[tabla] ?? 0) + 1
    const resultado = tablasQueFallan.has(tabla)
      ? { data: null, error: { message: `fallo simulado en ${tabla}` } }
      : { data: filasPorTabla[tabla] ?? [], error: null }

    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'is', 'gte', 'lte', 'in', 'update', 'insert', 'delete']) {
      q[m] = () => q
    }
    q.maybeSingle = () => Promise.resolve({
      ...resultado,
      data: Array.isArray(resultado.data) ? (resultado.data[0] ?? null) : resultado.data,
    })
    q.single = q.maybeSingle
    q.then = (fn: (r: unknown) => unknown) => Promise.resolve(resultado).then(fn)
    return q
  }
  return { supabase: { from: (tabla: string) => hacerQuery(tabla) } }
})

function Sonda() {
  const s = useSesion()
  return (
    <div>
      <p data-testid="nombre">{s.perfil.nombre ?? '(sin nombre)'}</p>
      <p data-testid="moneda">{s.perfil.moneda}</p>
      <p data-testid="cuentas">{s.cuentas.length}</p>
      <p data-testid="patrimonio">{s.totalPatrimonio}</p>
      <p data-testid="tarjetas">{s.tarjetas.length}</p>
      <p data-testid="cat-propias">{s.categoriasPropias.length}</p>
      <p data-testid="cat-gasto-incluye">{String(s.categoriasGasto.includes('Mascotas'))}</p>
      <p data-testid="err-cuentas">{s.error.cuentas ?? '-'}</p>
      <p data-testid="err-tarjetas">{s.error.tarjetas ?? '-'}</p>
      <p data-testid="err-perfil">{s.error.perfil ?? '-'}</p>
    </div>
  )
}

beforeEach(() => {
  for (const k of Object.keys(conteo)) delete conteo[k]
  tablasQueFallan = new Set()
})
afterEach(() => cleanup())

describe('SesionProvider', () => {
  it('carga cada slice UNA sola vez', async () => {
    render(<SesionProvider userId="u1"><Sonda /></SesionProvider>)
    await waitFor(() => expect(screen.getByTestId('cuentas')).toHaveTextContent('2'))

    // El punto de la tarea: antes cada página montaba su propio hook y esto
    // habría sido 6 para cuentas y categorías.
    expect(conteo.profiles).toBe(1)
    expect(conteo.cuentas).toBe(1)
    expect(conteo.categorias_usuario).toBe(1)
    expect(conteo.tarjetas_credito).toBe(1)
  })

  it('expone los datos de los cuatro slices', async () => {
    render(<SesionProvider userId="u1"><Sonda /></SesionProvider>)
    await waitFor(() => expect(screen.getByTestId('nombre')).toHaveTextContent('Kenneth'))
    expect(screen.getByTestId('patrimonio')).toHaveTextContent('200000')
    expect(screen.getByTestId('tarjetas')).toHaveTextContent('1')
    expect(screen.getByTestId('cat-propias')).toHaveTextContent('1')
    // Las categorías propias se mezclan con las base
    expect(screen.getByTestId('cat-gasto-incluye')).toHaveTextContent('true')
  })

  it('el fallo de un slice no tumba a los otros', async () => {
    tablasQueFallan = new Set(['tarjetas_credito'])
    render(<SesionProvider userId="u1"><Sonda /></SesionProvider>)

    await waitFor(() => expect(screen.getByTestId('err-tarjetas')).toHaveTextContent('fallo simulado'))
    // Cuentas y perfil siguen disponibles y sin error propio
    expect(screen.getByTestId('cuentas')).toHaveTextContent('2')
    expect(screen.getByTestId('nombre')).toHaveTextContent('Kenneth')
    expect(screen.getByTestId('err-cuentas')).toHaveTextContent('-')
  })

  it('si falla el perfil NO presenta la moneda por defecto como un hecho', async () => {
    tablasQueFallan = new Set(['profiles'])
    render(<SesionProvider userId="u1"><Sonda /></SesionProvider>)

    await waitFor(() => expect(screen.getByTestId('err-perfil')).toHaveTextContent('fallo simulado'))
    // El error queda expuesto para que la página no muestre GTQ como si fuera
    // la moneda del usuario cuando en realidad no se pudo leer.
    expect(screen.getByTestId('err-perfil')).not.toHaveTextContent('-')
  })

  it('useSesion() fuera del provider lanza en lugar de devolver datos vacíos', () => {
    // Un contexto nulo silencioso haría que las páginas rendericen Q0.00 como
    // un hecho, que es el mismo defecto que se corrigió en los hooks.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Sonda />)).toThrow(/useSesion\(\) requiere/)
    errSpy.mockRestore()
  })
})
