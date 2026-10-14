/**
 * Una base en memoria con la forma del query builder de supabase-js, lo justo
 * para probar las herramientas del MCP: select (también con `count` + `head`),
 * eq, in, gte, lte, order, limit, single, maybeSingle, insert, update y delete.
 * Filtra de verdad, así que un test que olvida el `user_id` o la cuenta ve
 * filas de más.
 *
 * Emula lo que en la base hacen los triggers y RLS:
 *   · insertar, editar o borrar en `transacciones` mueve `cuentas.saldo`;
 *   · `rlsBloqueaModificar` hace que update y delete no toquen ninguna fila,
 *     como las policies restrictivas de la sección 4b cuando el asistente no
 *     tiene permiso (RLS no da error: devuelve cero filas);
 *   · `columnasFaltantes` es una migración sin aplicar: leer o escribir esa
 *     columna falla con el error de PostgREST.
 * Las filas nuevas reciben id y los defaults de `cuentas`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Fila = Record<string, unknown>

interface Opciones {
  fallaInsert?: boolean
  rlsBloqueaModificar?: boolean
  columnasFaltantes?: Record<string, string[]>
}

export function baseFalsa(tablas: Record<string, Fila[]>, opciones: Opciones = {}) {
  const insertados: Record<string, Fila[]> = {}
  const moverSaldo = (t: Fila, signo: 1 | -1) => {
    const c = tablas.cuentas?.find(x => x.id === t.cuenta_id)
    if (c) c.saldo = (c.saldo as number) + signo * (t.cantidad as number)
  }
  const db = {
    from(tabla: string) {
      const filtros: ((f: Fila) => boolean)[] = []
      let limite = Infinity
      let modo: 'lista' | 'una' | 'unaOpcional' = 'lista'
      let conteo = false
      let operacion: 'leer' | 'insertar' | 'editar' | 'borrar' = 'leer'
      let pendiente: Fila[] = []
      let cambios: Fila = {}
      let faltante: string | undefined
      const revisar = (columnas: string[]) => {
        faltante ??= (opciones.columnasFaltantes?.[tabla] ?? []).find(c => columnas.includes(c))
      }

      const filtradas = () => (tablas[tabla] ?? []).filter(f => filtros.every(p => p(f)))
      const salida = (filas: Fila[]) => {
        if (modo === 'lista') return { data: filas, error: null }
        if (modo === 'una' && filas.length !== 1) return { data: null, error: { message: 'no rows' } }
        return { data: filas[0] ?? null, error: null }
      }

      const resolver = () => {
        if (faltante) return { data: null, error: { message: `column ${tabla}.${faltante} does not exist` } }
        if (operacion === 'insertar') {
          if (opciones.fallaInsert) return { data: null, error: { message: 'insert falló' } }
          const nuevas: Fila[] = pendiente.map(f => ({
            id: `${tabla}-${(tablas[tabla]?.length ?? 0) + 1}`,
            ...(tabla === 'cuentas' && { activa: true }),
            ...f,
          }))
          ;(tablas[tabla] ??= []).push(...nuevas)
          ;(insertados[tabla] ??= []).push(...pendiente)
          if (tabla === 'transacciones') nuevas.forEach(t => moverSaldo(t, 1))
          return salida(nuevas)
        }
        if (operacion === 'editar') {
          const filas = opciones.rlsBloqueaModificar ? [] : filtradas()
          for (const f of filas) {
            if (tabla === 'transacciones') moverSaldo(f, -1)
            Object.assign(f, cambios)
            if (tabla === 'transacciones') moverSaldo(f, 1)
          }
          return salida(filas)
        }
        if (operacion === 'borrar') {
          const filas = opciones.rlsBloqueaModificar ? [] : filtradas()
          tablas[tabla] = (tablas[tabla] ?? []).filter(f => !filas.includes(f))
          if (tabla === 'transacciones') filas.forEach(t => moverSaldo(t, -1))
          return salida(filas)
        }
        const filas = filtradas()
        if (conteo) return { data: null, count: filas.length, error: null }
        return salida(filas.slice(0, limite))
      }

      const q = {
        select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (cols) revisar(cols.split(',').map(c => c.trim()))
          if (opts?.head) conteo = true
          return q
        },
        eq: (c: string, v: unknown) => { filtros.push(f => f[c] === v); return q },
        in: (c: string, vs: unknown[]) => { filtros.push(f => vs.includes(f[c])); return q },
        gte: (c: string, v: string) => { filtros.push(f => String(f[c]) >= v); return q },
        lte: (c: string, v: string) => { filtros.push(f => String(f[c]) <= v); return q },
        order: () => q,
        limit: (n: number) => { limite = n; return q },
        single: () => { modo = 'una'; return q },
        maybeSingle: () => { modo = 'unaOpcional'; return q },
        insert: (filas: Fila | Fila[]) => {
          operacion = 'insertar'; pendiente = Array.isArray(filas) ? filas : [filas]
          revisar(pendiente.flatMap(f => Object.keys(f)))
          return q
        },
        update: (valores: Fila) => { operacion = 'editar'; cambios = valores; revisar(Object.keys(valores)); return q },
        delete: () => { operacion = 'borrar'; return q },
        then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, mal),
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, insertados }
}
