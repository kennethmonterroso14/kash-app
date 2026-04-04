# Fase 7: Inversiones y Patrimonio Neto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar tracking manual de portafolio de inversiones (GTQ y USD) con rendimiento anualizado, gráfica de evolución, conversión de divisas, y patrimonio neto completo en el dashboard (activos = cuentas + inversiones, pasivos = deuda TC).

**Architecture:** Nuevo hook `useInversiones` maneja CRUD de inversiones + historial de valores + tipo de cambio desde `profiles`. `InversionesPage` usa state machine `'lista' | 'nueva' | 'actualizar_valor' | 'tipo_cambio'`. Todas las funciones financieras trabajan en GTQ centavos como moneda base; `usdToGTQ()` convierte antes de cualquier suma. `DashboardPage` consume `useInversiones` para actualizar el widget de patrimonio neto con el desglose completo activos/pasivos.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS v3 + Supabase + Recharts (ya en el proyecto) + Vitest (nuevo)

---

## File Map

### New Files
- `src/hooks/useInversiones.ts` — CRUD inversiones, historial de valores, tipo de cambio USD
- `src/pages/InversionesPage.tsx` — UI completa: lista, resumen portafolio, gráfica, modales
- `src/lib/finanzas.test.ts` — Tests de funciones puras de inversiones

### Modified Files
- `src/lib/finanzas.ts` — Agregar: `Inversion`, `InversionHistorial`, `ResumenPortafolio`, `calcRendimientoAnualizado`, `calcResumenPortafolio`, `usdToGTQ`, `computeEvolucionPortafolio`
- `src/lib/constants.ts` — Agregar: `TIPOS_INVERSION`
- `src/pages/DashboardPage.tsx` — Agregar `useInversiones`, widget "Patrimonio Neto" con desglose activos/pasivos
- `src/pages/PerfilPage.tsx` — Agregar link a `/inversiones`
- `src/App.tsx` — Agregar ruta `/inversiones`
- `vite.config.ts` — Agregar config de Vitest
- `package.json` — Agregar script `"test"` y `vitest` a devDependencies

---

## Task 1: Funciones financieras de inversiones + Vitest

**Files:**
- Modify: `src/lib/finanzas.ts`
- Modify: `src/lib/constants.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `src/lib/finanzas.test.ts`

- [ ] **Step 1: Instalar Vitest**

```bash
cd /path/to/kash-app
npm install -D vitest @vitest/ui jsdom
```

- [ ] **Step 2: Configurar Vitest en `vite.config.ts`**

Reemplazar el archivo completo:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Vorta — Finanzas Personales',
        short_name: 'Vorta',
        description: 'Control de finanzas personales para Guatemala',
        theme_color: '#0a0c10',
        background_color: '#0a0c10',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

- [ ] **Step 3: Agregar script de test en `package.json`**

En el objeto `"scripts"` agregar:
```json
"test": "vitest run"
```

- [ ] **Step 4: Agregar `TIPOS_INVERSION` a `src/lib/constants.ts`**

Al final del archivo agregar:

```typescript
export const TIPOS_INVERSION = [
  { value: 'fondo',     label: 'Fondo de inversión' },
  { value: 'acciones',  label: 'Acciones / ETF' },
  { value: 'cdp',       label: 'CDP / Depósito a plazo' },
  { value: 'crypto',    label: 'Criptomonedas' },
  { value: 'inmueble',  label: 'Inmueble / Bien raíz' },
  { value: 'otro',      label: 'Otro' },
] as const
```

- [ ] **Step 5: Agregar tipos e interfaces de inversiones a `src/lib/finanzas.ts`**

Al final del archivo, después de `calcPatrimonioNeto`, agregar:

```typescript
// ─── INVERSIONES ─────────────────────────────────────

export interface Inversion {
  id: string
  nombre: string
  plataforma?: string
  tipo: string
  monto_invertido: number      // centavos en la moneda indicada
  valor_actual: number         // centavos en la moneda indicada
  moneda: 'GTQ' | 'USD'
  fecha_inicio: string         // 'YYYY-MM-DD'
  fecha_ultimo_update?: string
  notas?: string
  activa: boolean
}

export interface InversionHistorial {
  id: string
  inversion_id: string
  valor: number                // centavos en la moneda de la inversión
  fecha: string                // 'YYYY-MM-DD'
}

export interface ResumenPortafolio {
  capital_total: number        // centavos GTQ
  valor_total: number          // centavos GTQ
  ganancia_total: number       // centavos GTQ (puede ser negativo)
  ganancia_pct: number         // porcentaje
  rendimiento_anualizado: number  // CAGR promedio ponderado, porcentaje
}
```

- [ ] **Step 6: Agregar funciones de cálculo a `src/lib/finanzas.ts`**

Inmediatamente después de las interfaces, agregar:

```typescript
/**
 * Convierte centavos USD a centavos GTQ.
 * tipoCambioUSD: centavos GTQ por 1 USD (ej: 775 = Q7.75/USD)
 * Ejemplo: usdToGTQ(10_000, 775) → 77_500  ($100 × Q7.75 = Q775)
 */
export function usdToGTQ(montoUSD_centavos: number, tipoCambioUSD: number): number {
  return Math.round(montoUSD_centavos * tipoCambioUSD / 100)
}

/**
 * Calcula el Compound Annual Growth Rate (CAGR) para una inversión.
 * Retorna porcentaje (ej: 8.5 = 8.5%). Mínimo 1 día para evitar división por cero.
 * Nota: opera sobre los valores nativos de la inversión (cualquier moneda).
 */
export function calcRendimientoAnualizado(
  montoInvertido: number,  // centavos (moneda nativa)
  valorActual: number,     // centavos (moneda nativa)
  fechaInicio: string      // 'YYYY-MM-DD'
): number {
  if (montoInvertido <= 0) throw new Error('monto_invertido debe ser > 0')
  const inicio = new Date(fechaInicio + 'T12:00:00')
  const dias = Math.max(1, Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24)))
  const ratio = valorActual / montoInvertido
  if (ratio <= 0) return -100
  return (Math.pow(ratio, 365 / dias) - 1) * 100
}

/**
 * Calcula resumen del portafolio. Todos los valores de retorno están en GTQ centavos.
 * Las inversiones en USD se convierten usando tipoCambioUSD antes de sumar.
 * El rendimiento anualizado es CAGR ponderado por capital en GTQ.
 */
export function calcResumenPortafolio(
  inversiones: Inversion[],
  tipoCambioUSD: number = 775
): ResumenPortafolio {
  const activas = inversiones.filter(i => i.activa)
  if (activas.length === 0) {
    return { capital_total: 0, valor_total: 0, ganancia_total: 0, ganancia_pct: 0, rendimiento_anualizado: 0 }
  }

  const toGTQ = (inv: Inversion, val: number): number =>
    inv.moneda === 'USD' ? usdToGTQ(val, tipoCambioUSD) : val

  const capital_total = activas.reduce((s, i) => s + toGTQ(i, i.monto_invertido), 0)
  const valor_total   = activas.reduce((s, i) => s + toGTQ(i, i.valor_actual),    0)
  const ganancia_total  = valor_total - capital_total
  const ganancia_pct    = capital_total > 0 ? (ganancia_total / capital_total) * 100 : 0

  // Rendimiento anualizado ponderado (CAGR es neutral a la moneda — es un ratio)
  const rendimiento_anualizado = capital_total > 0
    ? activas.reduce((sum, inv) => {
        const pesoGTQ = toGTQ(inv, inv.monto_invertido) / capital_total
        const rend = calcRendimientoAnualizado(inv.monto_invertido, inv.valor_actual, inv.fecha_inicio)
        return sum + rend * pesoGTQ
      }, 0)
    : 0

  return { capital_total, valor_total, ganancia_total, ganancia_pct, rendimiento_anualizado }
}

/**
 * Computa la evolución total del portafolio para la gráfica.
 * Para cada fecha única en historial, suma el último valor conocido de cada inversión
 * (convirtiendo a GTQ). Inversiones sin historial previo a esa fecha usan monto_invertido.
 */
export function computeEvolucionPortafolio(
  inversiones: Inversion[],
  historial: InversionHistorial[],
  tipoCambioUSD: number = 775
): Array<{ fecha: string; valor_total: number }> {
  const fechas = [...new Set(historial.map(h => h.fecha))].sort()
  if (fechas.length === 0) return []

  const toGTQ = (inv: Inversion, val: number): number =>
    inv.moneda === 'USD' ? usdToGTQ(val, tipoCambioUSD) : val

  return fechas.map(fecha => {
    const valor_total = inversiones.filter(i => i.activa).reduce((sum, inv) => {
      const entradas = historial
        .filter(h => h.inversion_id === inv.id && h.fecha <= fecha)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
      const val = entradas[0]?.valor ?? inv.monto_invertido
      return sum + toGTQ(inv, val)
    }, 0)
    return { fecha, valor_total }
  })
}
```

- [ ] **Step 7: Escribir tests en `src/lib/finanzas.test.ts`**

Crear el archivo:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  usdToGTQ,
  calcRendimientoAnualizado,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
  type Inversion,
  type InversionHistorial,
} from './finanzas'

// Fijar "hoy" en 2026-04-04 para que los tests sean deterministas
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-04T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const HOY = '2026-04-04'
const HACE_UN_ANIO = '2025-04-04'

// ── usdToGTQ ────────────────────────────────────────────
describe('usdToGTQ', () => {
  it('convierte $100 a Q775 con tipo de cambio Q7.75', () => {
    expect(usdToGTQ(10_000, 775)).toBe(77_500)
  })

  it('convierte $1.00 a Q7.75', () => {
    expect(usdToGTQ(100, 775)).toBe(775)
  })

  it('redondea correctamente para fracciones de centavo', () => {
    // $0.01 × Q7.75 = Q0.0775 → redondeado a 8 centavos
    expect(usdToGTQ(1, 775)).toBe(8)
  })

  it('retorna 0 para monto 0', () => {
    expect(usdToGTQ(0, 775)).toBe(0)
  })
})

// ── calcRendimientoAnualizado ───────────────────────────
describe('calcRendimientoAnualizado', () => {
  it('retorna ~0% cuando valor = monto en el día de inicio', () => {
    const result = calcRendimientoAnualizado(10_000, 10_000, HOY)
    expect(result).toBeCloseTo(0, 0)
  })

  it('calcula ~8.5% anualizado (Q100 → Q108.50 en exactamente 1 año)', () => {
    const result = calcRendimientoAnualizado(10_000, 10_850, HACE_UN_ANIO)
    expect(result).toBeCloseTo(8.5, 0)
  })

  it('retorna valor negativo para pérdida', () => {
    const result = calcRendimientoAnualizado(10_000, 9_000, HACE_UN_ANIO)
    expect(result).toBeLessThan(0)
  })

  it('lanza error si monto_invertido es 0', () => {
    expect(() => calcRendimientoAnualizado(0, 10_000, HOY)).toThrow('monto_invertido debe ser > 0')
  })

  it('retorna -100 si valor_actual es 0 (pérdida total)', () => {
    expect(calcRendimientoAnualizado(10_000, 0, HACE_UN_ANIO)).toBe(-100)
  })
})

// ── calcResumenPortafolio ────────────────────────────────
describe('calcResumenPortafolio', () => {
  const GTQ_INV: Inversion = {
    id: '1', nombre: 'Fondo A', tipo: 'fondo',
    monto_invertido: 100_000, valor_actual: 110_000,
    moneda: 'GTQ', fecha_inicio: HACE_UN_ANIO, activa: true,
  }
  const USD_INV: Inversion = {
    id: '2', nombre: 'ETF B', tipo: 'acciones',
    monto_invertido: 10_000, valor_actual: 11_000,  // $100 → $110
    moneda: 'USD', fecha_inicio: HACE_UN_ANIO, activa: true,
  }

  it('retorna ceros para lista vacía', () => {
    const r = calcResumenPortafolio([])
    expect(r.capital_total).toBe(0)
    expect(r.valor_total).toBe(0)
    expect(r.rendimiento_anualizado).toBe(0)
  })

  it('suma capital y valor correctamente en GTQ puro', () => {
    const r = calcResumenPortafolio([GTQ_INV])
    expect(r.capital_total).toBe(100_000)
    expect(r.valor_total).toBe(110_000)
    expect(r.ganancia_total).toBe(10_000)
  })

  it('convierte USD a GTQ antes de sumar (tipo Q7.75)', () => {
    // GTQ: capital=100_000, valor=110_000
    // USD: capital=$100=Q775, valor=$110=Q852.50≈852
    const r = calcResumenPortafolio([GTQ_INV, USD_INV], 775)
    expect(r.capital_total).toBe(100_000 + usdToGTQ(10_000, 775))
    expect(r.valor_total).toBe(110_000 + usdToGTQ(11_000, 775))
  })

  it('calcula ganancia_pct correctamente', () => {
    const r = calcResumenPortafolio([GTQ_INV])
    expect(r.ganancia_pct).toBeCloseTo(10.0, 1)
  })

  it('ignora inversiones inactivas', () => {
    const inactiva: Inversion = { ...GTQ_INV, id: '3', activa: false, valor_actual: 999_999 }
    const r = calcResumenPortafolio([GTQ_INV, inactiva])
    expect(r.valor_total).toBe(110_000)
  })
})

// ── computeEvolucionPortafolio ──────────────────────────
describe('computeEvolucionPortafolio', () => {
  const inv: Inversion = {
    id: '1', nombre: 'A', tipo: 'fondo',
    monto_invertido: 100_000, valor_actual: 115_000,
    moneda: 'GTQ', fecha_inicio: '2026-01-01', activa: true,
  }
  const hist: InversionHistorial[] = [
    { id: 'h1', inversion_id: '1', valor: 105_000, fecha: '2026-02-01' },
    { id: 'h2', inversion_id: '1', valor: 110_000, fecha: '2026-03-01' },
    { id: 'h3', inversion_id: '1', valor: 115_000, fecha: '2026-04-01' },
  ]

  it('retorna array vacío si no hay historial', () => {
    expect(computeEvolucionPortafolio([inv], [])).toHaveLength(0)
  })

  it('retorna un punto por fecha única', () => {
    expect(computeEvolucionPortafolio([inv], hist)).toHaveLength(3)
  })

  it('usa el valor del historial en cada fecha', () => {
    const result = computeEvolucionPortafolio([inv], hist)
    expect(result[0]).toEqual({ fecha: '2026-02-01', valor_total: 105_000 })
    expect(result[2]).toEqual({ fecha: '2026-04-01', valor_total: 115_000 })
  })

  it('usa monto_invertido para inversión sin historial previo a la fecha', () => {
    const inv2: Inversion = { ...inv, id: '2', monto_invertido: 50_000, valor_actual: 55_000 }
    // inv2 no tiene historial, así que usa monto_invertido en todas las fechas
    const result = computeEvolucionPortafolio([inv, inv2], hist)
    expect(result[0].valor_total).toBe(105_000 + 50_000)
  })
})
```

- [ ] **Step 8: Ejecutar tests — deben PASAR**

```bash
npm test
```

Esperado: 4 suites, 16 tests en verde. Si alguno falla, revisar la implementación en `finanzas.ts` antes de continuar.

- [ ] **Step 9: Commit**

```bash
git add src/lib/finanzas.ts src/lib/constants.ts src/lib/finanzas.test.ts vite.config.ts package.json package-lock.json
git commit -m "feat(inversiones): funciones financieras + Vitest — Task 1 Fase 7"
```

---

## Task 2: Migración DB — tabla `inversiones_historial` + columnas en `profiles`

**Files:**
- No hay archivos de código. Esta tarea es SQL ejecutado en Supabase SQL Editor.

> ⚠️ La tabla `inversiones` ya existe desde la migración de Fase 6. Esta tarea SOLO agrega lo que falta.

- [ ] **Step 1: Ejecutar en Supabase → SQL Editor → New query**

```sql
-- ══════════════════════════════════════════════════════
-- VORTA — Migración aditiva v2.1 (Fase 7)
-- Ejecutar en Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════════

-- ── Columnas de tipo de cambio en profiles (si no existen) ─
alter table profiles
  add column if not exists tipo_cambio_usd bigint not null default 775,
  add column if not exists tipo_cambio_actualizado_at timestamptz;
-- tipo_cambio_usd: centavos GTQ por 1 USD. 775 = Q7.75/USD

-- ── Historial de valores de inversiones ─────────────────
create table if not exists inversiones_historial (
  id            uuid primary key default uuid_generate_v4(),
  inversion_id  uuid references inversiones(id) on delete cascade not null,
  user_id       uuid references auth.users(id)  on delete cascade not null,
  valor         bigint not null,          -- centavos en la moneda de la inversión
  fecha         date not null,
  created_at    timestamptz not null default now(),

  constraint inv_hist_valor_no_negativo check (valor >= 0)
);

-- ── Índices ──────────────────────────────────────────────
create index if not exists idx_inv_hist_inversion
  on inversiones_historial(inversion_id, fecha desc);
create index if not exists idx_inv_hist_user
  on inversiones_historial(user_id);

-- ── RLS ──────────────────────────────────────────────────
alter table inversiones_historial enable row level security;

do $$ begin
  create policy "own" on inversiones_historial
    for all using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
```

- [ ] **Step 2: Verificar en Supabase Table Editor**

Confirmar que existen:
- Tabla `inversiones_historial` con columnas: `id, inversion_id, user_id, valor, fecha, created_at`
- `profiles` tiene columnas `tipo_cambio_usd` (bigint, default 775) y `tipo_cambio_actualizado_at` (timestamptz)

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore(db): migración v2.1 — inversiones_historial + tipo_cambio en profiles"
```

---

## Task 3: Hook `useInversiones`

**Files:**
- Create: `src/hooks/useInversiones.ts`

- [ ] **Step 1: Crear `src/hooks/useInversiones.ts`**

```typescript
// src/hooks/useInversiones.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  type Inversion,
  type InversionHistorial,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
} from '../lib/finanzas'
import { hoyGT } from '../lib/constants'

export type { Inversion, InversionHistorial }

export function useInversiones(userId: string) {
  const [inversiones, setInversiones]         = useState<Inversion[]>([])
  const [historial, setHistorial]             = useState<InversionHistorial[]>([])
  const [tipoCambioUSD, setTipoCambioUSD]     = useState<number>(775)
  const [tipoCambioFecha, setTipoCambioFecha] = useState<string | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      const [invRes, histRes, perfilRes] = await Promise.all([
        supabase
          .from('inversiones')
          .select('id, nombre, plataforma, tipo, monto_invertido, valor_actual, moneda, fecha_inicio, fecha_ultimo_update, notas, activa')
          .eq('user_id', userId)
          .eq('activa', true)
          .order('created_at'),
        supabase
          .from('inversiones_historial')
          .select('id, inversion_id, valor, fecha')
          .eq('user_id', userId)
          .order('fecha'),
        supabase
          .from('profiles')
          .select('tipo_cambio_usd, tipo_cambio_actualizado_at')
          .eq('id', userId)
          .single(),
      ])
      if (invRes.error)   throw invRes.error
      if (histRes.error)  throw histRes.error
      setInversiones(invRes.data ?? [])
      setHistorial(histRes.data ?? [])
      if (perfilRes.data) {
        setTipoCambioUSD(perfilRes.data.tipo_cambio_usd ?? 775)
        setTipoCambioFecha(perfilRes.data.tipo_cambio_actualizado_at ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar inversiones')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  const agregarInversion = async (input: {
    nombre: string
    plataforma?: string
    tipo: string
    monto_invertido: number   // centavos en la moneda indicada
    moneda: 'GTQ' | 'USD'
    fecha_inicio: string      // 'YYYY-MM-DD'
    notas?: string
  }) => {
    if (!input.nombre.trim())       throw new Error('El nombre es requerido')
    if (input.monto_invertido <= 0) throw new Error('El capital debe ser mayor a 0')

    const { data, error } = await supabase
      .from('inversiones')
      .insert({
        ...input,
        user_id:             userId,
        valor_actual:        input.monto_invertido,   // valor inicial = capital
        fecha_ultimo_update: input.fecha_inicio,
      })
      .select('id, nombre, plataforma, tipo, monto_invertido, valor_actual, moneda, fecha_inicio, fecha_ultimo_update, notas, activa')
      .single()
    if (error) throw new Error(`Error al guardar: ${error.message}`)

    // Registrar primer punto en historial
    await supabase.from('inversiones_historial').insert({
      inversion_id: data.id,
      user_id:      userId,
      valor:        data.valor_actual,
      fecha:        data.fecha_inicio,
    })

    await cargar()   // refresca inversiones + historial
  }

  const actualizarValor = async (id: string, nuevoValor: number, fecha: string) => {
    if (nuevoValor < 0) throw new Error('El valor no puede ser negativo')

    const { error: updErr } = await supabase
      .from('inversiones')
      .update({ valor_actual: nuevoValor, fecha_ultimo_update: fecha })
      .eq('id', id)
    if (updErr) throw new Error(`Error al actualizar: ${updErr.message}`)

    const { error: histErr } = await supabase
      .from('inversiones_historial')
      .insert({ inversion_id: id, user_id: userId, valor: nuevoValor, fecha })
    if (histErr) throw new Error(`Error en historial: ${histErr.message}`)

    // Optimistic update de inversiones locales
    setInversiones(prev =>
      prev.map(i => i.id === id ? { ...i, valor_actual: nuevoValor, fecha_ultimo_update: fecha } : i)
    )
    setHistorial(prev => [
      ...prev,
      { id: crypto.randomUUID(), inversion_id: id, valor: nuevoValor, fecha },
    ])
  }

  const archivarInversion = async (id: string) => {
    const { error } = await supabase
      .from('inversiones')
      .update({ activa: false })
      .eq('id', id)
    if (error) throw new Error(`Error al archivar: ${error.message}`)
    setInversiones(prev => prev.filter(i => i.id !== id))
  }

  const actualizarTipoCambio = async (nuevoCambio: number) => {
    // nuevoCambio: centavos GTQ por 1 USD (ej: 775 = Q7.75)
    if (nuevoCambio <= 0) throw new Error('El tipo de cambio debe ser mayor a 0')
    const ahora = new Date().toISOString()
    const { error } = await supabase
      .from('profiles')
      .update({ tipo_cambio_usd: nuevoCambio, tipo_cambio_actualizado_at: ahora })
      .eq('id', userId)
    if (error) throw new Error(`Error al actualizar tipo de cambio: ${error.message}`)
    setTipoCambioUSD(nuevoCambio)
    setTipoCambioFecha(ahora)
  }

  const resumen = useMemo(
    () => calcResumenPortafolio(inversiones, tipoCambioUSD),
    [inversiones, tipoCambioUSD]
  )

  const evolucionPortafolio = useMemo(
    () => computeEvolucionPortafolio(inversiones, historial, tipoCambioUSD),
    [inversiones, historial, tipoCambioUSD]
  )

  const tieneUSD = inversiones.some(i => i.moneda === 'USD')

  return {
    inversiones,
    historial,
    resumen,
    evolucionPortafolio,
    tipoCambioUSD,
    tipoCambioFecha,
    tieneUSD,
    loading,
    error,
    agregarInversion,
    actualizarValor,
    archivarInversion,
    actualizarTipoCambio,
    recargar: cargar,
  }
}
```

- [ ] **Step 2: Verificar que el build compila sin errores**

```bash
npm run build
```

Esperado: sin errores TypeScript. Si hay errores de tipos, revisarlos ahora.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useInversiones.ts
git commit -m "feat(inversiones): hook useInversiones — CRUD + historial + tipo de cambio"
```

---

## Task 4: `InversionesPage.tsx` — Lista + Resumen + Modales

**Files:**
- Create: `src/pages/InversionesPage.tsx`

- [ ] **Step 1: Crear `src/pages/InversionesPage.tsx`**

```typescript
// src/pages/InversionesPage.tsx
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer,
} from 'recharts'
import { useInversiones, type Inversion } from '../hooks/useInversiones'
import {
  formatQ, toCentavos, usdToGTQ, calcRendimientoAnualizado,
} from '../lib/finanzas'
import { TIPOS_INVERSION, hoyGT } from '../lib/constants'

interface Props { userId: string }

type Pantalla = 'lista' | 'nueva' | 'actualizar_valor' | 'tipo_cambio'

const INFLACION_GT = 4   // porcentaje anual de referencia

export default function InversionesPage({ userId }: Props) {
  const {
    inversiones, resumen, evolucionPortafolio,
    tipoCambioUSD, tipoCambioFecha, tieneUSD,
    loading, error,
    agregarInversion, actualizarValor, archivarInversion, actualizarTipoCambio,
  } = useInversiones(userId)

  // ── Navegación ──────────────────────────────────────────
  const [pantalla, setPantalla] = useState<Pantalla>('lista')
  const [selId, setSelId]       = useState<string | null>(null)
  const selInv = inversiones.find(i => i.id === selId) ?? null

  // ── Form: nueva inversión ────────────────────────────────
  const [nombre, setNombre]         = useState('')
  const [plataforma, setPlataforma] = useState('')
  const [tipo, setTipo]             = useState(TIPOS_INVERSION[0].value)
  const [capital, setCapital]       = useState('')
  const [moneda, setMoneda]         = useState<'GTQ' | 'USD'>('GTQ')
  const [fechaInicio, setFechaInicio] = useState(hoyGT())
  const [notas, setNotas]           = useState('')

  // ── Form: actualizar valor ───────────────────────────────
  const [nuevoValor, setNuevoValor]   = useState('')
  const [fechaUpdate, setFechaUpdate] = useState(hoyGT())

  // ── Form: tipo de cambio ─────────────────────────────────
  const [nuevoCambio, setNuevoCambio] = useState('')

  // ── Estado general ───────────────────────────────────────
  const [saving, setSaving]   = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  // Tipo de cambio desactualizado si tiene 7+ días
  const tipoCambioDesactualizado = (() => {
    if (!tipoCambioFecha) return false
    const dias = Math.floor((Date.now() - new Date(tipoCambioFecha).getTime()) / (1000 * 60 * 60 * 24))
    return dias >= 7
  })()

  // ── Helpers ─────────────────────────────────────────────
  const valorEnGTQ   = (inv: Inversion) => inv.moneda === 'USD' ? usdToGTQ(inv.valor_actual,    tipoCambioUSD) : inv.valor_actual
  const capitalEnGTQ = (inv: Inversion) => inv.moneda === 'USD' ? usdToGTQ(inv.monto_invertido, tipoCambioUSD) : inv.monto_invertido

  const abrirActualizar = (id: string) => {
    const inv = inversiones.find(i => i.id === id)
    if (!inv) return
    setNuevoValor(String((inv.valor_actual / 100).toFixed(2)))
    setFechaUpdate(hoyGT())
    setErrForm(null)
    setSelId(id)
    setPantalla('actualizar_valor')
  }

  const abrirNueva = () => {
    setNombre(''); setPlataforma(''); setTipo(TIPOS_INVERSION[0].value)
    setCapital(''); setMoneda('GTQ'); setFechaInicio(hoyGT()); setNotas('')
    setErrForm(null)
    setPantalla('nueva')
  }

  // ── Handlers ────────────────────────────────────────────
  const handleNueva = async () => {
    setErrForm(null)
    const cap = parseFloat(capital)
    if (!nombre.trim())         return setErrForm('El nombre es requerido')
    if (isNaN(cap) || cap <= 0) return setErrForm('El capital debe ser mayor a 0')
    try {
      setSaving(true)
      await agregarInversion({
        nombre:         nombre.trim(),
        plataforma:     plataforma.trim() || undefined,
        tipo,
        monto_invertido: toCentavos(cap),
        moneda,
        fecha_inicio:   fechaInicio,
        notas:          notas.trim() || undefined,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleActualizar = async () => {
    if (!selId) return
    setErrForm(null)
    const val = parseFloat(nuevoValor)
    if (isNaN(val) || val < 0) return setErrForm('El valor debe ser 0 o mayor')
    try {
      setSaving(true)
      await actualizarValor(selId, toCentavos(val), fechaUpdate)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  const handleArchivar = async () => {
    if (!selId || !selInv) return
    if (!confirm(`¿Archivar "${selInv.nombre}"? No se eliminará el historial.`)) return
    try {
      setSaving(true)
      await archivarInversion(selId)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al archivar')
    } finally {
      setSaving(false)
    }
  }

  const handleTipoCambio = async () => {
    setErrForm(null)
    const cambio = parseFloat(nuevoCambio)
    if (isNaN(cambio) || cambio <= 0) return setErrForm('Ingresa un tipo de cambio válido (ej: 7.75)')
    try {
      setSaving(true)
      await actualizarTipoCambio(toCentavos(cambio))   // Q7.75 → 775 centavos
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-display font-bold text-xl">Inversiones</h1>
          {resumen.ganancia_total !== 0 && (
            <p className={`text-xs mt-0.5 font-mono ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
              {resumen.ganancia_total >= 0 ? '+' : ''}{formatQ(resumen.ganancia_total)} total
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {tieneUSD && (
            <button
              onClick={() => {
                setNuevoCambio(String((tipoCambioUSD / 100).toFixed(2)))
                setErrForm(null)
                setPantalla('tipo_cambio')
              }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                tipoCambioDesactualizado
                  ? 'bg-warning/10 text-warning border border-warning/30'
                  : 'bg-surface2 text-muted hover:text-white'
              }`}
            >
              {tipoCambioDesactualizado ? '⚠ ' : ''}Q{(tipoCambioUSD / 100).toFixed(2)}/USD
            </button>
          )}
          <button
            onClick={abrirNueva}
            className="bg-accent text-bg px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + Nueva
          </button>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {/* ── Resumen portafolio ──────────────────────────── */}
      {resumen.capital_total > 0 && (
        <div className="bg-surface rounded-2xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted text-xs mb-0.5">Capital invertido</p>
              <p className="text-white font-mono">{formatQ(resumen.capital_total)}</p>
            </div>
            <div>
              <p className="text-muted text-xs mb-0.5">Valor actual</p>
              <p className="text-white font-mono font-bold">{formatQ(resumen.valor_total)}</p>
            </div>
            <div>
              <p className="text-muted text-xs mb-0.5">Ganancia total</p>
              <p className={`font-mono font-semibold ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
                {resumen.ganancia_total >= 0 ? '+' : ''}{formatQ(resumen.ganancia_total)}
                <span className="text-xs ml-1">
                  ({resumen.ganancia_pct >= 0 ? '+' : ''}{resumen.ganancia_pct.toFixed(1)}%)
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted text-xs mb-0.5">Rendimiento anual</p>
              <p className={`font-mono font-semibold ${resumen.rendimiento_anualizado >= INFLACION_GT ? 'text-success' : 'text-warning'}`}>
                {resumen.rendimiento_anualizado >= 0 ? '+' : ''}
                {resumen.rendimiento_anualizado.toFixed(1)}% / año
              </p>
            </div>
          </div>

          {/* Gráfica evolución — solo si hay 2+ puntos */}
          {evolucionPortafolio.length > 1 && (
            <div className="-mx-1">
              <p className="text-muted text-xs mb-1.5 px-1">Evolución del portafolio</p>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={evolucionPortafolio}>
                  <XAxis dataKey="fecha" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <RechartTooltip
                    formatter={(v: number) => [formatQ(v), 'Valor']}
                    labelFormatter={(l: string) => l}
                    contentStyle={{
                      background: '#12151c', border: 'none',
                      borderRadius: 8, fontSize: 12,
                    }}
                    labelStyle={{ color: '#8b90a0' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor_total"
                    stroke="#7c6af7"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#7c6af7' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────── */}
      {inversiones.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-muted text-sm">No tienes inversiones registradas</p>
          <p className="text-textDim text-xs mt-1">Agrega tu primera inversión para empezar</p>
        </div>
      )}

      {/* ── Lista de inversiones ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        {inversiones.map(inv => {
          const rend       = calcRendimientoAnualizado(inv.monto_invertido, inv.valor_actual, inv.fecha_inicio)
          const gananciaNativa = inv.valor_actual - inv.monto_invertido
          const gananciaGTQ   = valorEnGTQ(inv) - capitalEnGTQ(inv)
          const superaInflacion = rend > INFLACION_GT

          return (
            <div key={inv.id} className="bg-surface rounded-2xl p-4 space-y-2.5">
              {/* Cabecera */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-semibold text-sm">{inv.nombre}</p>
                  {inv.plataforma && <p className="text-muted text-xs">{inv.plataforma}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted bg-surface2 px-2 py-0.5 rounded-full">{inv.tipo}</span>
                  {inv.moneda === 'USD' && (
                    <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded-full">USD</span>
                  )}
                </div>
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted">Capital</p>
                  <p className="text-white font-mono">
                    {inv.moneda === 'USD'
                      ? `$${(inv.monto_invertido / 100).toFixed(2)}`
                      : formatQ(inv.monto_invertido)}
                  </p>
                  {inv.moneda === 'USD' && (
                    <p className="text-textDim">≈ {formatQ(capitalEnGTQ(inv))}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted">Valor actual</p>
                  <p className="text-white font-mono font-bold">
                    {inv.moneda === 'USD'
                      ? `$${(inv.valor_actual / 100).toFixed(2)}`
                      : formatQ(inv.valor_actual)}
                  </p>
                  {inv.moneda === 'USD' && (
                    <p className="text-textDim">≈ {formatQ(valorEnGTQ(inv))}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted">Ganancia</p>
                  <p className={`font-mono font-semibold ${gananciaNativa >= 0 ? 'text-success' : 'text-danger'}`}>
                    {gananciaNativa >= 0 ? '+' : ''}
                    {inv.moneda === 'USD'
                      ? `$${(gananciaNativa / 100).toFixed(2)}`
                      : formatQ(gananciaNativa)}
                  </p>
                  {inv.moneda === 'USD' && (
                    <p className={`text-xs ${gananciaGTQ >= 0 ? 'text-success/70' : 'text-danger/70'}`}>
                      ≈ {gananciaGTQ >= 0 ? '+' : ''}{formatQ(gananciaGTQ)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted">Anualizado</p>
                  <p className={`font-mono font-semibold ${rend >= INFLACION_GT ? 'text-success' : 'text-warning'}`}>
                    {rend >= 0 ? '+' : ''}{rend.toFixed(1)}% / año
                  </p>
                </div>
              </div>

              {/* Indicador inflación + botón */}
              <div className="flex items-center justify-between pt-0.5">
                <p className={`text-xs ${superaInflacion ? 'text-success' : 'text-warning'}`}>
                  {superaInflacion ? '✅ Supera inflación GT (~4%)' : '⚠️ Por debajo de inflación'}
                </p>
                <button
                  onClick={() => abrirActualizar(inv.id)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >
                  Actualizar valor
                </button>
              </div>

              {inv.fecha_ultimo_update && (
                <p className="text-textDim text-xs">Actualizado: {inv.fecha_ultimo_update}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* ═══════════════ MODALES ═══════════════ */}

      {/* Modal: Nueva inversión */}
      {pantalla === 'nueva' && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Nueva inversión</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nombre (ej: Fondo HAPI)"
                value={nombre} onChange={e => setNombre(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Plataforma (opcional, ej: HAPI, SAT, Binance)"
                value={plataforma} onChange={e => setPlataforma(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <select
                value={tipo} onChange={e => setTipo(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              >
                {TIPOS_INVERSION.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  placeholder={`Capital inicial (${moneda === 'USD' ? 'USD $' : 'GTQ Q'})`}
                  value={capital} onChange={e => setCapital(e.target.value)}
                  inputMode="decimal"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <div className="flex bg-bg border border-muted/30 rounded-xl overflow-hidden">
                  {(['GTQ', 'USD'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMoneda(m)}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        moneda === m ? 'bg-accent text-bg font-semibold' : 'text-muted hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Fecha de inicio</p>
                <input
                  type="date"
                  value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <textarea
                placeholder="Notas (opcional)"
                value={notas} onChange={e => setNotas(e.target.value)}
                rows={2}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent resize-none"
              />
              {errForm && <p className="text-danger text-sm">{errForm}</p>}
              <button
                onClick={handleNueva}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity mt-1"
              >
                {saving ? 'Guardando...' : 'Agregar inversión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Actualizar valor */}
      {pantalla === 'actualizar_valor' && selInv && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Actualizar — {selInv.nombre}</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="bg-bg rounded-xl p-3 mb-4">
              <p className="text-muted text-xs">Valor anterior</p>
              <p className="text-white font-mono">
                {selInv.moneda === 'USD'
                  ? `$${(selInv.valor_actual / 100).toFixed(2)}`
                  : formatQ(selInv.valor_actual)}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder={`Nuevo valor (${selInv.moneda === 'USD' ? '$' : 'Q'})`}
                value={nuevoValor} onChange={e => setNuevoValor(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div>
                <p className="text-muted text-xs mb-1">Fecha del update</p>
                <input
                  type="date"
                  value={fechaUpdate} onChange={e => setFechaUpdate(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
                />
              </div>
              {errForm && <p className="text-danger text-sm">{errForm}</p>}
              <button
                onClick={handleActualizar}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Guardando...' : 'Guardar nuevo valor'}
              </button>
              <button
                onClick={handleArchivar}
                disabled={saving}
                className="w-full py-2 rounded-xl text-danger/70 text-xs hover:text-danger transition-colors"
              >
                Archivar inversión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tipo de cambio USD */}
      {pantalla === 'tipo_cambio' && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Tipo de cambio USD</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="bg-bg rounded-xl p-3 mb-4">
              <p className="text-muted text-xs">Tipo de cambio actual</p>
              <p className="text-white font-mono">Q{(tipoCambioUSD / 100).toFixed(2)} por USD</p>
              {tipoCambioFecha && (
                <p className={`text-xs mt-0.5 ${tipoCambioDesactualizado ? 'text-warning' : 'text-textDim'}`}>
                  {tipoCambioDesactualizado
                    ? '⚠️ Sin actualizar hace más de 7 días'
                    : `Actualizado: ${new Date(tipoCambioFecha).toLocaleDateString('es-GT')}`}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nuevo tipo de cambio (ej: 7.75)"
                value={nuevoCambio} onChange={e => setNuevoCambio(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              {errForm && <p className="text-danger text-sm">{errForm}</p>}
              <button
                onClick={handleTipoCambio}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Guardando...' : 'Actualizar tipo de cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
```

- [ ] **Step 2: Verificar build sin errores**

```bash
npm run build
```

Esperado: cero errores TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/pages/InversionesPage.tsx
git commit -m "feat(inversiones): InversionesPage — lista, resumen, gráfica, modales"
```

---

## Task 5: Actualizar `DashboardPage` — Patrimonio Neto completo

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

El Dashboard actualmente muestra `totalPatrimonio` (solo cuentas). Fase 7 agrega un widget "Patrimonio Neto" con desglose activos/pasivos que incluye inversiones. El número principal (`Patrimonio total`) se mantiene como "saldo en cuentas" para no confundir — el patrimonio neto es un widget adicional separado.

- [ ] **Step 1: Agregar imports en `src/pages/DashboardPage.tsx`**

Agregar al bloque de imports existente:

```typescript
import { useInversiones } from '../hooks/useInversiones'
import { calcPatrimonioNeto } from '../lib/finanzas'
```

- [ ] **Step 2: Agregar hook `useInversiones` dentro del componente**

Después de la línea `const { resumenTCs, tarjetas } = useTarjetas(user.id)`, agregar:

```typescript
const { resumen: resumenInv, tipoCambioUSD } = useInversiones(user.id)
```

- [ ] **Step 3: Calcular patrimonio neto con `useMemo`**

Después de `const disponibleReal = useMemo(...)`, agregar:

```typescript
const patrimonioNeto = useMemo(
  () => calcPatrimonioNeto(totalPatrimonio, resumenInv.valor_total, tarjetas),
  [totalPatrimonio, resumenInv.valor_total, tarjetas]
)
```

- [ ] **Step 4: Agregar widget "Patrimonio Neto" en el JSX**

Después del bloque `{/* Mini-cards TC */}` y antes del bloque de stats del mes, agregar:

```tsx
{/* Patrimonio Neto — solo si hay inversiones o TCs */}
{(resumenInv.capital_total > 0 || tarjetas.length > 0) && (
  <div className="bg-surface rounded-2xl p-4">
    <p className="text-muted text-xs uppercase tracking-widest mb-3">Patrimonio Neto</p>
    <div className="space-y-1.5 text-sm">
      {/* Activos */}
      <div className="flex justify-between">
        <span className="text-muted">Cuentas</span>
        <span className="font-mono text-white">{formatQ(totalPatrimonio)}</span>
      </div>
      {resumenInv.valor_total > 0 && (
        <div className="flex justify-between">
          <span className="text-muted">Inversiones</span>
          <span className="font-mono text-success">+{formatQ(resumenInv.valor_total)}</span>
        </div>
      )}
      <div className="flex justify-between text-xs text-muted pt-0.5">
        <span>Total activos</span>
        <span className="font-mono text-white">{formatQ(patrimonioNeto.activos)}</span>
      </div>
      {/* Pasivos */}
      {patrimonioNeto.pasivos > 0 && (
        <div className="flex justify-between pt-1">
          <span className="text-muted">Deuda TC</span>
          <span className="font-mono text-danger">−{formatQ(patrimonioNeto.pasivos)}</span>
        </div>
      )}
      {/* Neto */}
      <div className="border-t border-muted/20 pt-1.5 flex justify-between">
        <span className="text-white font-semibold">Patrimonio neto</span>
        <span className={`font-mono font-bold ${patrimonioNeto.neto >= 0 ? 'text-success' : 'text-danger'}`}>
          {formatQ(patrimonioNeto.neto)}
        </span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verificar build sin errores**

```bash
npm run build
```

Esperado: cero errores TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(inversiones): Dashboard — widget Patrimonio Neto con activos+inversiones−deudaTC"
```

---

## Task 6: Routing + PerfilPage + build final

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/PerfilPage.tsx`

- [ ] **Step 1: Agregar import de `InversionesPage` en `src/App.tsx`**

Después de `import TarjetasPage from './pages/TarjetasPage'`, agregar:

```typescript
import InversionesPage from './pages/InversionesPage'
```

- [ ] **Step 2: Agregar ruta `/inversiones` en `src/App.tsx`**

Después de la ruta de tarjetas:
```tsx
<Route path="/tarjetas" element={<TarjetasPage userId={user.id} />} />
```

Agregar:
```tsx
<Route path="/inversiones" element={<InversionesPage userId={user.id} />} />
```

- [ ] **Step 3: Agregar link en `src/pages/PerfilPage.tsx`**

En el array de shortcuts (en la sección de navegación), agregar inversiones como primer elemento:

```typescript
{ to: '/inversiones',  icon: '📈', label: 'Inversiones' },
{ to: '/tarjetas',     icon: '💳', label: 'Tarjetas de Crédito' },
{ to: '/pagos',        icon: '↻',  label: 'Pagos Fijos' },
{ to: '/metas',        icon: '◉',  label: 'Metas de ahorro' },
{ to: '/proyecciones', icon: '⟳',  label: 'Proyecciones' },
```

- [ ] **Step 4: Build final y tests**

```bash
npm run build && npm test
```

Esperado:
- Build: ✓ sin errores TypeScript
- Tests: 4 suites, 16 tests en verde
- Solo el warning de chunk > 500KB (no es un error)

- [ ] **Step 5: Commit final**

```bash
git add src/App.tsx src/pages/PerfilPage.tsx
git commit -m "feat(inversiones): routing /inversiones + link desde Perfil — Fase 7 completa"
```

- [ ] **Step 6: Push a producción**

```bash
git push origin main
```

---

## Entregables verificables

Antes de marcar Fase 7 como completa, verificar manualmente en la app:

- [ ] Crear una inversión GTQ: `deuda_actual` en `inversiones` = capital inicial, historial tiene 1 punto
- [ ] Actualizar valor: `valor_actual` cambia, `inversiones_historial` tiene nuevo registro, gráfica muestra 2+ puntos
- [ ] Inversión USD: muestra valor en $ Y su equivalente en Q usando tipo de cambio
- [ ] Tipo de cambio: se actualiza en `profiles.tipo_cambio_usd`, conversiones en UI reflejan nuevo valor
- [ ] Dashboard: widget "Patrimonio Neto" muestra correctamente activos (cuentas + inversiones) − pasivos (deuda TC)
- [ ] Rendimiento anualizado: para 1 año de $100 → $108.50 muestra ~8.5%
- [ ] Indicador inflación: inversión con rendimiento > 4% muestra ✅, si < 4% muestra ⚠️
