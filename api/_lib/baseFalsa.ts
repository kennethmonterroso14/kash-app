/**
 * Una base en memoria con la forma del query builder de supabase-js, lo justo
 * para probar las herramientas del MCP: select, eq, in, gte, lte, order, limit,
 * single, maybeSingle e insert. Filtra de verdad, así que un test que olvida el
 * `user_id` o la cuenta ve filas de más.
 *
 * Emula lo que en la base hace un trigger: insertar en `transacciones` mueve
 * `cuentas.saldo`. Y las filas nuevas reciben id y los defaults de `cuentas`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Fila = Record<string, unknown>

export function baseFalsa(tablas: Record<string, Fila[]>, opciones: { fallaInsert?: boolean } = {}) {
  const insertados: Record<string, Fila[]> = {}
  const db = {
    from(tabla: string) {
      const filtros: ((f: Fila) => boolean)[] = []
      let limite = Infinity
      let modo: 'lista' | 'una' | 'unaOpcional' = 'lista'
      let pendiente: Fila[] | null = null
      const resolver = () => {
        if (pendiente) {
          if (opciones.fallaInsert) return { data: null, error: { message: 'insert falló' } }
          const nuevas: Fila[] = pendiente.map(f => ({
            id: `${tabla}-${(tablas[tabla]?.length ?? 0) + 1}`,
            ...(tabla === 'cuentas' && { activa: true }),
            ...f,
          }))
          ;(tablas[tabla] ??= []).push(...nuevas)
          ;(insertados[tabla] ??= []).push(...pendiente)
          if (tabla === 'transacciones') {
            for (const t of nuevas) {
              const c = tablas.cuentas?.find(x => x.id === t.cuenta_id)
              if (c) c.saldo = (c.saldo as number) + (t.cantidad as number)
            }
          }
          return { data: modo === 'lista' ? nuevas : nuevas[0], error: null }
        }
        const filas = (tablas[tabla] ?? []).filter(f => filtros.every(p => p(f))).slice(0, limite)
        if (modo === 'lista') return { data: filas, error: null }
        if (modo === 'una' && filas.length !== 1) return { data: null, error: { message: 'no rows' } }
        return { data: filas[0] ?? null, error: null }
      }
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push(f => f[c] === v); return q },
        in: (c: string, vs: unknown[]) => { filtros.push(f => vs.includes(f[c])); return q },
        gte: (c: string, v: string) => { filtros.push(f => String(f[c]) >= v); return q },
        lte: (c: string, v: string) => { filtros.push(f => String(f[c]) <= v); return q },
        order: () => q,
        limit: (n: number) => { limite = n; return q },
        single: () => { modo = 'una'; return q },
        maybeSingle: () => { modo = 'unaOpcional'; return q },
        insert: (filas: Fila | Fila[]) => { pendiente = Array.isArray(filas) ? filas : [filas]; return q },
        then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, mal),
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, insertados }
}
