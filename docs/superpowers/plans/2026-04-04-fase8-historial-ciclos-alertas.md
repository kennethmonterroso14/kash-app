# Fase 8: Historial de ciclos TC y alertas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazabilidad completa de ciclos de tarjetas de crédito: auto-creación de ciclos al registrar cargos, historial de estados de cuenta con transacciones por ciclo, y banner de alertas global para cierres próximos y pagos vencidos.

**Architecture:** Tres componentes independientes: (1) lógica pura `calcAlertasTC` + `calcFechasCiclo` en `finanzas.ts`; (2) `registrarCargo` en `useTarjetas.ts` busca/crea automáticamente el ciclo abierto antes de insertar la transacción; (3) `TarjetaHistorialPage` muestra cards de ciclos con modal bottom sheet de transacciones; (4) `AlertasBanner` en `Layout.tsx` consulta TCs y muestra banners amarillo/rojo según urgencia.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS v3 + Supabase + Vitest (tests existentes en `src/lib/finanzas.test.ts`)

---

## File Map

### New Files
- `src/pages/TarjetaHistorialPage.tsx` — lista de ciclos + modal de transacciones
- `src/hooks/useCiclosTC.ts` — fetch ciclos de una TC + lazy fetch transacciones de un ciclo
- `src/components/AlertasBanner.tsx` — banner(s) de alerta en header global

### Modified Files
- `src/lib/finanzas.ts` — agregar: `CicloTC`, `AlertaTC`, `calcAlertasTC()`, `calcFechasCiclo()`
- `src/lib/finanzas.test.ts` — agregar tests para las 2 nuevas funciones puras
- `src/hooks/useTarjetas.ts` — actualizar `registrarCargo` para auto-crear ciclo; exponer `tarjetas` directamente
- `src/components/Layout.tsx` — agregar prop `userId: string`, renderizar `AlertasBanner`
- `src/App.tsx` — pasar `userId` a Layout; agregar ruta `/tarjetas/:id/historial`
- `src/pages/TarjetasPage.tsx` — agregar botón "Ver historial →" en cada card TC

---

## Task 1: Funciones puras — `calcAlertasTC` y `calcFechasCiclo`

**Files:**
- Modify: `src/lib/finanzas.ts`
- Modify: `src/lib/finanzas.test.ts`

- [ ] **Step 1: Agregar interfaces y funciones a `src/lib/finanzas.ts`**

Leer el archivo. Al final, después de `calcPatrimonioNeto`, agregar:

```typescript
// ─── CICLOS DE TARJETA DE CRÉDITO ────────────────────────────

export interface CicloTC {
  id: string
  tarjeta_id: string
  user_id: string
  fecha_inicio: string   // 'YYYY-MM-DD'
  fecha_cierre: string   // 'YYYY-MM-DD'
  fecha_pago: string     // 'YYYY-MM-DD'
  total_cargos: number   // centavos
  total_pagos: number    // centavos
  saldo_final: number    // centavos
  estado: 'abierto' | 'cerrado' | 'pagado'
}

export interface AlertaTC {
  tipo: 'cierre_proximo' | 'pago_vencido'
  tc: TarjetaCredito
  diasRestantes?: number   // para cierre_proximo (0-3)
  monto?: number           // para pago_vencido (centavos)
}

/**
 * Calcula las fechas de un nuevo ciclo de TC dado el día de cierre y pago.
 * Siempre retorna el ciclo vigente a partir de `hoy`.
 *
 * Reglas:
 * - Si hoy < dia_cierre: el cierre es este mes → inicio = dia_cierre+1 del mes anterior
 * - Si hoy >= dia_cierre: el cierre es el mes siguiente → inicio = dia_cierre+1 de este mes
 * - El pago siempre cae DESPUÉS del cierre:
 *   si diaPago > diaCierre: mismo mes que el cierre
 *   si diaPago <= diaCierre: mes siguiente al cierre
 */
export function calcFechasCiclo(
  diaCierre: number,
  diaPago: number,
  hoy: Date = new Date()
): { fecha_inicio: string; fecha_cierre: string; fecha_pago: string } {
  const año = hoy.getFullYear()
  const mes = hoy.getMonth() + 1   // 1-12
  const dia = hoy.getDate()

  // Mes del próximo cierre
  let cierreAño = año
  let cierreMes = mes
  if (dia >= diaCierre) {
    cierreMes += 1
    if (cierreMes > 12) { cierreMes = 1; cierreAño += 1 }
  }
  const fechaCierre = `${cierreAño}-${String(cierreMes).padStart(2, '0')}-${String(diaCierre).padStart(2, '0')}`

  // Inicio = día después del cierre anterior (usar Date para manejar overflow de días)
  let inicioAño = cierreAño
  let inicioMes = cierreMes - 1
  if (inicioMes < 1) { inicioMes = 12; inicioAño -= 1 }
  const inicioDate = new Date(inicioAño, inicioMes - 1, diaCierre + 1)
  const fechaInicio = inicioDate.toLocaleDateString('en-CA')

  // Pago: después del cierre
  let pagoAño = cierreAño
  let pagoMes = cierreMes
  if (diaPago <= diaCierre) {
    pagoMes += 1
    if (pagoMes > 12) { pagoMes = 1; pagoAño += 1 }
  }
  const fechaPago = `${pagoAño}-${String(pagoMes).padStart(2, '0')}-${String(diaPago).padStart(2, '0')}`

  return { fecha_inicio: fechaInicio, fecha_cierre: fechaCierre, fecha_pago: fechaPago }
}

/**
 * Genera alertas para tarjetas con cierre próximo (≤3 días) o pago vencido.
 * Pago vencido = deuda_ciclo_anterior > 0 Y hoy >= dia_pago de este mes.
 * Las alertas de pago vencido van primero (mayor urgencia).
 */
export function calcAlertasTC(
  tarjetas: TarjetaCredito[],
  hoy: Date = new Date()
): AlertaTC[] {
  const MS_DIA = 1000 * 60 * 60 * 24
  const alertas: AlertaTC[] = []

  for (const tc of tarjetas) {
    // Pago vencido
    if (tc.deuda_ciclo_anterior > 0) {
      const diaPagoEsteMes = new Date(hoy.getFullYear(), hoy.getMonth(), tc.dia_pago)
      if (hoy >= diaPagoEsteMes) {
        alertas.push({ tipo: 'pago_vencido', tc, monto: tc.deuda_ciclo_anterior })
      }
    }
    // Cierre próximo
    const proximoCierre = _proximaFechaDelDia(hoy, tc.dia_cierre)
    const dias = Math.ceil((proximoCierre.getTime() - hoy.getTime()) / MS_DIA)
    if (dias <= 3) {
      alertas.push({ tipo: 'cierre_proximo', tc, diasRestantes: dias })
    }
  }

  // Pago vencido primero
  return alertas.sort((a, b) => {
    if (a.tipo === 'pago_vencido' && b.tipo !== 'pago_vencido') return -1
    if (b.tipo === 'pago_vencido' && a.tipo !== 'pago_vencido') return 1
    return 0
  })
}
```

- [ ] **Step 2: Escribir tests en `src/lib/finanzas.test.ts`**

Agregar al final del archivo (mantener los 20 tests existentes):

```typescript
// ── calcFechasCiclo ─────────────────────────────────────────
describe('calcFechasCiclo', () => {
  it('cierre este mes cuando hoy es antes del dia_cierre', () => {
    // Hoy 10 de abril, cierre día 20 → cierre este mes (abril)
    const hoy = new Date(2026, 3, 10)   // 10 abril 2026
    const r = calcFechasCiclo(20, 5, hoy)
    expect(r.fecha_cierre).toBe('2026-04-20')
    expect(r.fecha_inicio).toBe('2026-03-21')  // dia 21 de marzo (20+1)
    expect(r.fecha_pago).toBe('2026-05-05')    // diaPago(5) <= diaCierre(20) → mes siguiente
  })

  it('cierre mes siguiente cuando hoy es >= dia_cierre', () => {
    // Hoy 20 de abril (= dia_cierre), cierre → mayo
    const hoy = new Date(2026, 3, 20)
    const r = calcFechasCiclo(20, 5, hoy)
    expect(r.fecha_cierre).toBe('2026-05-20')
    expect(r.fecha_inicio).toBe('2026-04-21')
    expect(r.fecha_pago).toBe('2026-06-05')
  })

  it('pago en el mismo mes del cierre cuando diaPago > diaCierre', () => {
    // cierre día 15, pago día 25 → pago mismo mes que cierre
    const hoy = new Date(2026, 3, 10)
    const r = calcFechasCiclo(15, 25, hoy)
    expect(r.fecha_cierre).toBe('2026-04-15')
    expect(r.fecha_pago).toBe('2026-04-25')
  })

  it('maneja cruce de año correctamente', () => {
    // Hoy 20 de diciembre, cierre día 15 → cierre enero del año siguiente
    const hoy = new Date(2026, 11, 20)
    const r = calcFechasCiclo(15, 5, hoy)
    expect(r.fecha_cierre).toBe('2027-01-15')
    expect(r.fecha_inicio).toBe('2026-12-16')
    expect(r.fecha_pago).toBe('2027-02-05')
  })
})

// ── calcAlertasTC ───────────────────────────────────────────
describe('calcAlertasTC', () => {
  // Solo campos requeridos por la interface TarjetaCredito
  const TC_BASE: TarjetaCredito = {
    id: '1', nombre: 'Visa BAC',
    limite_credito: 1_000_000,
    deuda_actual: 0, deuda_ciclo_anterior: 0,
    dia_cierre: 20, dia_pago: 5,
  }

  it('retorna lista vacía si no hay alertas', () => {
    // Hoy 10 abril, cierre 20 → 10 días, sin deuda anterior
    const hoy = new Date(2026, 3, 10)
    expect(calcAlertasTC([TC_BASE], hoy)).toHaveLength(0)
  })

  it('detecta cierre próximo cuando faltan ≤3 días', () => {
    // Hoy 17 de abril, cierre 20 → 3 días
    const hoy = new Date(2026, 3, 17)
    const alertas = calcAlertasTC([TC_BASE], hoy)
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('cierre_proximo')
    expect(alertas[0].diasRestantes).toBe(3)
  })

  it('detecta pago vencido cuando hay deuda_ciclo_anterior y pasó el dia_pago', () => {
    // Hoy 10 de mayo, dia_pago=5, deuda anterior > 0 → vencido
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 300_000 }
    const hoy = new Date(2026, 4, 10)   // 10 mayo
    const alertas = calcAlertasTC([tc], hoy)
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('pago_vencido')
    expect(alertas[0].monto).toBe(300_000)
  })

  it('NO detecta pago vencido si aún no llegó el dia_pago', () => {
    // Hoy 3 de mayo, dia_pago=5 → todavía hay tiempo
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 300_000 }
    const hoy = new Date(2026, 4, 3)
    expect(calcAlertasTC([tc], hoy)).toHaveLength(0)
  })

  it('pago_vencido va antes que cierre_proximo en el array', () => {
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 100_000, dia_cierre: 21, dia_pago: 5 }
    // Hoy 18 mayo: cierre 21 → 3 días; dia_pago 5 → pasó
    const hoy = new Date(2026, 4, 18)
    const alertas = calcAlertasTC([tc], hoy)
    expect(alertas[0].tipo).toBe('pago_vencido')
  })
})
```

- [ ] **Step 3: Agregar imports del test**

En `src/lib/finanzas.test.ts`, actualizar la línea de imports para incluir las nuevas funciones:

```typescript
import {
  usdToGTQ,
  calcRendimientoAnualizado,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
  calcFechasCiclo,
  calcAlertasTC,
  type Inversion,
  type InversionHistorial,
  type TarjetaCredito,
} from './finanzas'
```

- [ ] **Step 4: Ejecutar los tests — deben PASAR (incluye los 20 anteriores + los nuevos)**

```bash
cd /path/to/kash-app && npm test
```

Esperado: todos los tests en verde. Si alguno falla, revisar la implementación en `finanzas.ts` antes de continuar.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finanzas.ts src/lib/finanzas.test.ts
git commit -m "feat(fase8): calcFechasCiclo + calcAlertasTC — funciones puras + tests"
```

---

## Task 2: Migración DB — verificar `ciclos_tc` e índice en `transacciones`

**Files:**
- Sin archivos de código. SQL en Supabase SQL Editor.

La tabla `ciclos_tc` fue creada en la migración de Fase 6. Esta tarea verifica que existe y que `transacciones.ciclo_id` tiene índice para búsquedas rápidas.

- [ ] **Step 1: Ejecutar en Supabase → SQL Editor → New query**

```sql
-- Verificar que ciclos_tc existe (si ya existe, este bloque no hace nada)
create table if not exists ciclos_tc (
  id              uuid primary key default uuid_generate_v4(),
  tarjeta_id      uuid references tarjetas_credito(id) on delete cascade not null,
  user_id         uuid references auth.users(id)  on delete cascade not null,
  fecha_inicio    date not null,
  fecha_cierre    date not null,
  fecha_pago      date not null,
  total_cargos    bigint not null default 0,
  total_pagos     bigint not null default 0,
  saldo_final     bigint not null default 0,
  estado          text not null default 'abierto'
    check (estado in ('abierto', 'cerrado', 'pagado')),
  created_at      timestamptz not null default now(),
  constraint ciclo_fechas_validas check (fecha_cierre > fecha_inicio),
  unique(tarjeta_id, fecha_inicio)
);

-- RLS
alter table ciclos_tc enable row level security;
do $$ begin
  create policy "own" on ciclos_tc for all using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Índice para búsqueda de ciclo abierto de una TC (la query más frecuente)
create index if not exists idx_ciclos_tarjeta_estado
  on ciclos_tc(tarjeta_id, estado) where estado = 'abierto';

-- Índice para buscar transacciones de un ciclo
create index if not exists idx_tx_ciclo
  on transacciones(ciclo_id) where ciclo_id is not null;
```

- [ ] **Step 2: Verificar en Supabase Table Editor**

Confirmar que existe la tabla `ciclos_tc` con las columnas: `id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, total_cargos, total_pagos, saldo_final, estado, created_at`.

- [ ] **Step 3: Commit vacío de trazabilidad**

```bash
git commit --allow-empty -m "chore(db): verificar ciclos_tc + índices para Fase 8"
```

---

## Task 3: Actualizar `registrarCargo` en `useTarjetas.ts` para auto-crear ciclos

**Files:**
- Modify: `src/hooks/useTarjetas.ts`

La función `registrarCargo` actualmente inserta la transacción sin `ciclo_id`. Esta tarea añade la lógica de búsqueda/creación del ciclo abierto antes del INSERT.

- [ ] **Step 1: Leer `src/hooks/useTarjetas.ts` para entender la estructura actual**

El hook ya tiene: `cargar`, `agregarTC`, `actualizarTC`, `archivarTC`, `cerrarCiclo`, `registrarCargo`, `registrarPago`. `registrarCargo` actualmente no asigna `ciclo_id`.

- [ ] **Step 2: Agregar import de `calcFechasCiclo`**

Al inicio de `src/hooks/useTarjetas.ts`, agregar `calcFechasCiclo` al import de finanzas:

```typescript
import { calcResumenTC, calcFechasCiclo, type TarjetaCredito } from '../lib/finanzas'
```

- [ ] **Step 3: Reemplazar la función `registrarCargo`**

Buscar la función `registrarCargo` en el hook. Reemplazarla completamente con:

```typescript
  // Registrar un cargo en la TC.
  // Auto-crea el ciclo abierto si no existe para esta TC.
  const registrarCargo = async (input: {
    tarjeta_id: string
    monto: number        // centavos, positivo
    descripcion: string
    categoria: string
    fecha: string
  }) => {
    // 1. Buscar la TC para obtener dia_cierre y dia_pago
    const tc = tarjetas.find(t => t.id === input.tarjeta_id)
    if (!tc) throw new Error('Tarjeta no encontrada')

    // 2. Buscar ciclo abierto para esta TC
    const { data: ciclosAbiertos, error: cicloErr } = await supabase
      .from('ciclos_tc')
      .select('id')
      .eq('tarjeta_id', input.tarjeta_id)
      .eq('estado', 'abierto')
      .limit(1)
    if (cicloErr) throw new Error(`Error al buscar ciclo: ${cicloErr.message}`)

    let cicloId: string

    if (ciclosAbiertos && ciclosAbiertos.length > 0) {
      // Ciclo abierto existe — reutilizarlo
      cicloId = ciclosAbiertos[0].id
    } else {
      // Crear ciclo nuevo automáticamente
      const fechas = calcFechasCiclo(tc.dia_cierre, tc.dia_pago)
      const { data: nuevoCiclo, error: createErr } = await supabase
        .from('ciclos_tc')
        .insert({
          tarjeta_id:   input.tarjeta_id,
          user_id:      userId,
          fecha_inicio: fechas.fecha_inicio,
          fecha_cierre: fechas.fecha_cierre,
          fecha_pago:   fechas.fecha_pago,
          estado:       'abierto',
        })
        .select('id')
        .single()
      if (createErr) throw new Error(`Error al crear ciclo: ${createErr.message}`)
      cicloId = nuevoCiclo.id
    }

    // 3. Insertar la transacción con ciclo_id
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        cuenta_id:   null,
        tarjeta_id:  input.tarjeta_id,
        ciclo_id:    cicloId,
        cantidad:    -Math.abs(input.monto),
        descripcion: input.descripcion,
        categoria:   input.categoria,
        tipo:        'gasto_tc',
        fecha:       input.fecha,
      })
    if (error) throw new Error(`Error al registrar cargo: ${error.message}`)
    await cargar()
  }
```

- [ ] **Step 4: Asegurarse que `tarjetas` está en el scope de `registrarCargo`**

`registrarCargo` usa `tarjetas` (el estado del hook). Verificar que `tarjetas` es accesible (es `useState` al nivel del hook — sí lo es).

- [ ] **Step 5: Build sin errores**

```bash
npm run build
```

Esperado: cero errores TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTarjetas.ts
git commit -m "feat(fase8): registrarCargo auto-crea ciclo abierto si no existe"
```

---

## Task 4: Hook `useCiclosTC`

**Files:**
- Create: `src/hooks/useCiclosTC.ts`

Hook que carga los ciclos de una TC específica y permite fetch lazy de las transacciones de un ciclo.

- [ ] **Step 1: Crear `src/hooks/useCiclosTC.ts`**

```typescript
// src/hooks/useCiclosTC.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { CicloTC } from '../lib/finanzas'

export type { CicloTC }

export interface TransaccionCiclo {
  id: string
  fecha: string
  cantidad: number       // centavos, negativo = gasto
  descripcion: string
  categoria: string
  tipo: string
}

export function useCiclosTC(userId: string, tarjetaId: string) {
  const [ciclos, setCiclos]   = useState<CicloTC[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!tarjetaId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('ciclos_tc')
        .select('id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, total_cargos, total_pagos, saldo_final, estado')
        .eq('tarjeta_id', tarjetaId)
        .eq('user_id', userId)
        .order('fecha_inicio', { ascending: false })
      if (error) throw new Error(error.message)
      setCiclos(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar ciclos')
    } finally {
      setLoading(false)
    }
  }, [userId, tarjetaId])

  useEffect(() => { cargar() }, [cargar])

  // Fetch lazy: transacciones de un ciclo específico (llamado al abrir el modal)
  const fetchTransaccionesCiclo = async (cicloId: string): Promise<TransaccionCiclo[]> => {
    const { data, error } = await supabase
      .from('transacciones')
      .select('id, fecha, cantidad, descripcion, categoria, tipo')
      .eq('ciclo_id', cicloId)
      .eq('user_id', userId)
      .order('fecha', { ascending: false })
    if (error) throw new Error(`Error al cargar transacciones: ${error.message}`)
    return data ?? []
  }

  return { ciclos, loading, error, fetchTransaccionesCiclo, recargar: cargar }
}
```

- [ ] **Step 2: Build sin errores**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCiclosTC.ts
git commit -m "feat(fase8): hook useCiclosTC con fetch lazy de transacciones por ciclo"
```

---

## Task 5: `TarjetaHistorialPage.tsx`

**Files:**
- Create: `src/pages/TarjetaHistorialPage.tsx`

Página `/tarjetas/:id/historial`. Lista de ciclos como cards con métricas. Botón "Ver transacciones →" abre modal bottom sheet con las transacciones del ciclo.

- [ ] **Step 1: Crear `src/pages/TarjetaHistorialPage.tsx`**

```typescript
// src/pages/TarjetaHistorialPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCiclosTC, type CicloTC, type TransaccionCiclo } from '../hooks/useCiclosTC'
import { useTarjetas } from '../hooks/useTarjetas'
import { formatQ } from '../lib/finanzas'
import { MESES } from '../lib/constants'

interface Props { userId: string }

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  abierto:  { label: 'Abierto',  cls: 'bg-accent/15 text-accent' },
  cerrado:  { label: 'Cerrado',  cls: 'bg-warning/15 text-warning' },
  pagado:   { label: 'Pagado',   cls: 'bg-success/15 text-success' },
}

function formatPeriodo(inicio: string, cierre: string): string {
  const [, im, id] = inicio.split('-').map(Number)
  const [, cm, cd] = cierre.split('-').map(Number)
  return `${id} ${MESES[im - 1].slice(0, 3)} – ${cd} ${MESES[cm - 1].slice(0, 3)}`
}

export default function TarjetaHistorialPage({ userId }: Props) {
  const { id: tarjetaId = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tarjetas } = useTarjetas(userId)
  const { ciclos, loading, error, fetchTransaccionesCiclo } = useCiclosTC(userId, tarjetaId)

  const tc = tarjetas.find(t => t.id === tarjetaId)

  // Modal de transacciones
  const [cicloSelId, setCicloSelId]         = useState<string | null>(null)
  const [txns, setTxns]                     = useState<TransaccionCiclo[]>([])
  const [loadingTxns, setLoadingTxns]       = useState(false)
  const [errTxns, setErrTxns]               = useState<string | null>(null)

  const abrirModal = async (ciclo: CicloTC) => {
    setCicloSelId(ciclo.id)
    setTxns([])
    setErrTxns(null)
    setLoadingTxns(true)
    try {
      const data = await fetchTransaccionesCiclo(ciclo.id)
      setTxns(data)
    } catch (e: unknown) {
      setErrTxns(e instanceof Error ? e.message : 'Error al cargar transacciones')
    } finally {
      setLoadingTxns(false)
    }
  }

  const cerrarModal = () => { setCicloSelId(null); setTxns([]) }

  const cicloSel = ciclos.find(c => c.id === cicloSelId) ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/tarjetas')}
          className="text-accent text-xl hover:opacity-80 transition-opacity"
        >
          ←
        </button>
        <div>
          <h1 className="text-white font-display font-bold text-xl">
            {tc?.nombre ?? 'Historial'}
          </h1>
          <p className="text-muted text-xs">Estados de cuenta</p>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {ciclos.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-muted text-sm">Sin ciclos registrados</p>
          <p className="text-textDim text-xs mt-1">Los ciclos aparecen al registrar cargos</p>
        </div>
      )}

      {/* Lista de ciclos */}
      <div className="flex flex-col gap-3">
        {ciclos.map(ciclo => {
          const badge = ESTADO_BADGE[ciclo.estado] ?? ESTADO_BADGE['cerrado']
          return (
            <div key={ciclo.id} className="bg-surface rounded-2xl p-4">
              {/* Encabezado del ciclo */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-white text-sm font-semibold">
                    {formatPeriodo(ciclo.fecha_inicio, ciclo.fecha_cierre)}
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    Pago: {ciclo.fecha_pago}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              {/* Métricas del ciclo */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-bg rounded-xl p-2.5 text-center">
                  <p className="text-muted text-xs mb-0.5">Cargos</p>
                  <p className="text-danger font-mono font-semibold text-xs">
                    {formatQ(ciclo.total_cargos)}
                  </p>
                </div>
                <div className="bg-bg rounded-xl p-2.5 text-center">
                  <p className="text-muted text-xs mb-0.5">Pagos</p>
                  <p className="text-success font-mono font-semibold text-xs">
                    {formatQ(ciclo.total_pagos)}
                  </p>
                </div>
                <div className="bg-bg rounded-xl p-2.5 text-center">
                  <p className="text-muted text-xs mb-0.5">Saldo</p>
                  <p className={`font-mono font-semibold text-xs ${ciclo.saldo_final > 0 ? 'text-warning' : 'text-white'}`}>
                    {formatQ(ciclo.saldo_final)}
                  </p>
                </div>
              </div>

              {/* Botón ver transacciones */}
              <button
                onClick={() => abrirModal(ciclo)}
                className="w-full py-2 rounded-xl bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
              >
                Ver transacciones →
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal bottom sheet — transacciones del ciclo */}
      {cicloSelId && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50" onClick={cerrarModal}>
          <div
            className="bg-surface w-full rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-white font-semibold text-sm">Transacciones del ciclo</h2>
                {cicloSel && (
                  <p className="text-muted text-xs mt-0.5">
                    {formatPeriodo(cicloSel.fecha_inicio, cicloSel.fecha_cierre)}
                  </p>
                )}
              </div>
              <button onClick={cerrarModal} className="text-muted hover:text-white text-lg">✕</button>
            </div>

            {loadingTxns && (
              <p className="text-muted text-sm text-center py-8">Cargando...</p>
            )}

            {errTxns && (
              <p className="text-danger text-sm bg-danger/10 rounded-xl p-3">{errTxns}</p>
            )}

            {!loadingTxns && txns.length === 0 && !errTxns && (
              <p className="text-muted text-sm text-center py-8">Sin transacciones en este ciclo</p>
            )}

            <div className="flex flex-col gap-2">
              {txns.map(tx => (
                <div key={tx.id} className="flex justify-between items-center py-2.5 border-b border-muted/10 last:border-0">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-white text-sm truncate">{tx.descripcion}</p>
                    <p className="text-muted text-xs">{tx.categoria} · {tx.fecha}</p>
                  </div>
                  <p className={`font-mono text-sm font-semibold flex-shrink-0 ${tx.cantidad < 0 ? 'text-danger' : 'text-success'}`}>
                    {tx.cantidad < 0 ? '−' : '+'}{formatQ(Math.abs(tx.cantidad))}
                  </p>
                </div>
              ))}
            </div>

            {/* Total del modal */}
            {txns.length > 0 && (
              <div className="border-t border-muted/20 pt-3 mt-2 flex justify-between">
                <span className="text-muted text-sm">{txns.length} transacciones</span>
                <span className="font-mono text-sm text-white font-semibold">
                  {formatQ(txns.reduce((s, t) => s + Math.abs(t.cantidad), 0))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build sin errores**

```bash
npm run build
```

Esperado: cero errores TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TarjetaHistorialPage.tsx src/hooks/useCiclosTC.ts
git commit -m "feat(fase8): TarjetaHistorialPage — ciclos con cards + modal transacciones"
```

---

## Task 6: `AlertasBanner` + actualizar `Layout.tsx`

**Files:**
- Create: `src/components/AlertasBanner.tsx`
- Modify: `src/components/Layout.tsx`

El banner aparece debajo del header en todas las páginas. Amarillo para cierre próximo, rojo para pago vencido. Cada banner tiene ✕ para ocultarlo en la sesión actual.

- [ ] **Step 1: Crear `src/components/AlertasBanner.tsx`**

```typescript
// src/components/AlertasBanner.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calcAlertasTC, formatQ, type AlertaTC, type TarjetaCredito } from '../lib/finanzas'

interface Props { userId: string }

export default function AlertasBanner({ userId }: Props) {
  const [alertas, setAlertas]       = useState<AlertaTC[]>([])
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    supabase
      .from('tarjetas_credito')
      .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
      .eq('user_id', userId)
      .eq('activa', true)
      .then(({ data }) => {
        if (!data) return
        const tcs = data as TarjetaCredito[]
        setAlertas(calcAlertasTC(tcs))
      })
  }, [userId])

  const descartar = (key: string) =>
    setDescartadas(prev => new Set([...prev, key]))

  const visibles = alertas.filter(a => {
    const key = `${a.tipo}-${a.tc.id}`
    return !descartadas.has(key)
  })

  if (visibles.length === 0) return null

  return (
    <div>
      {visibles.map(alerta => {
        const key = `${alerta.tipo}-${alerta.tc.id}`
        if (alerta.tipo === 'pago_vencido') {
          return (
            <div key={key} className="bg-danger flex justify-between items-center px-4 py-2">
              <span className="text-white text-xs font-semibold">
                ⚠ Pago vencido en {alerta.tc.nombre}: {formatQ(alerta.monto!)}
              </span>
              <button
                onClick={() => descartar(key)}
                className="text-white/80 hover:text-white ml-3 text-base leading-none"
              >
                ✕
              </button>
            </div>
          )
        }
        // cierre_proximo
        return (
          <div key={key} className="bg-warning flex justify-between items-center px-4 py-2">
            <span className="text-bg text-xs font-semibold">
              ⏰ {alerta.tc.nombre} cierra en {alerta.diasRestantes} {alerta.diasRestantes === 1 ? 'día' : 'días'}
            </span>
            <button
              onClick={() => descartar(key)}
              className="text-bg/70 hover:text-bg ml-3 text-base leading-none"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Actualizar `src/components/Layout.tsx`**

Reemplazar el archivo completo:

```typescript
// src/components/Layout.tsx
import { NavLink } from 'react-router-dom'
import AlertasBanner from './AlertasBanner'

interface Props {
  children: React.ReactNode
  onSignOut: () => void
  userId: string
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard',   icon: '◈' },
  { to: '/txns',      label: 'Movimientos', icon: '≡' },
  { to: '/cuentas',   label: 'Cuentas',     icon: '◎' },
  { to: '/budget',    label: 'Presupuesto', icon: '◧' },
  { to: '/perfil',    label: 'Perfil',      icon: '◐' },
]

export default function Layout({ children, onSignOut, userId }: Props) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-muted/20 px-4 py-3 flex justify-between items-center">
        <span className="text-accent font-display font-bold text-xl">Vorta</span>
        <button
          onClick={onSignOut}
          className="text-muted text-sm hover:text-white transition-colors"
        >
          Salir
        </button>
      </header>

      {/* Alertas TC — debajo del header, encima del contenido */}
      <AlertasBanner userId={userId} />

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-muted/20 flex">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 3: Build — verificar que TypeScript no se queja del nuevo prop `userId`**

```bash
npm run build
```

Esperado: un error de tipo en `App.tsx` porque `Layout` ahora requiere `userId`. Se corrige en el Task 7.

- [ ] **Step 4: Commit parcial del componente**

```bash
git add src/components/AlertasBanner.tsx src/components/Layout.tsx
git commit -m "feat(fase8): AlertasBanner + Layout acepta userId para alertas globales"
```

---

## Task 7: Routing — `App.tsx` + botón historial en `TarjetasPage.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/TarjetasPage.tsx`

- [ ] **Step 1: Actualizar `src/App.tsx`**

Leer el archivo actual. Hacer dos cambios:

**Cambio 1** — Agregar import de `TarjetaHistorialPage` después de la línea de `TarjetasPage`:
```typescript
import TarjetaHistorialPage from './pages/TarjetaHistorialPage'
```

**Cambio 2** — Pasar `userId` a `Layout` y agregar la nueva ruta.

Reemplazar:
```typescript
  return (
    <Layout onSignOut={signOut}>
```
Con:
```typescript
  return (
    <Layout onSignOut={signOut} userId={user.id}>
```

Agregar después de la ruta de tarjetas:
```typescript
        <Route path="/tarjetas" element={<TarjetasPage userId={user.id} />} />
        <Route path="/tarjetas/:id/historial" element={<TarjetaHistorialPage userId={user.id} />} />
```

- [ ] **Step 2: Agregar botón "Ver historial" en `TarjetasPage.tsx`**

Leer `src/pages/TarjetasPage.tsx`. Agregar el import de `useNavigate` al inicio:

```typescript
import { useNavigate } from 'react-router-dom'
```

Dentro del componente, después de la línea de `useCuentas`:
```typescript
  const navigate = useNavigate()
```

En cada card de TC, buscar el bloque de botones (donde están "Nuevo cargo", "Pagar TC", "Cerrar ciclo"). Agregar el botón de historial al final del grupo:

```tsx
              <button
                onClick={() => navigate(`/tarjetas/${tc.id}/historial`)}
                className="text-xs text-muted hover:text-white transition-colors py-1"
              >
                Ver historial →
              </button>
```

- [ ] **Step 3: Build y tests finales**

```bash
npm run build && npm test
```

Esperado:
- Build: ✓ cero errores TypeScript
- Tests: todos en verde (los 20 originales + los nuevos de Fase 8)

- [ ] **Step 4: Commit final y push**

```bash
git add src/App.tsx src/pages/TarjetasPage.tsx
git commit -m "feat(fase8): routing /tarjetas/:id/historial + botón Ver historial en TarjetasPage"
git push origin main
```

---

## Entregables verificables

Antes de marcar Fase 8 como completa, verificar manualmente en la app:

- [ ] Registrar un cargo en una TC → en Supabase verificar que `ciclos_tc` tiene una fila con `estado='abierto'` y la transacción tiene `ciclo_id` asignado
- [ ] Registrar un segundo cargo en la misma TC → no crea un ciclo nuevo (reutiliza el existente)
- [ ] Navegar a `/tarjetas/:id/historial` → lista ciclos en cards con métricas
- [ ] Tap en "Ver transacciones →" → modal bottom sheet muestra las transacciones del ciclo
- [ ] Simular cierre próximo: TC con `dia_cierre` dentro de los próximos 3 días → banner amarillo en header
- [ ] Simular pago vencido: TC con `deuda_ciclo_anterior > 0` y `dia_pago` ya pasó → banner rojo en header
- [ ] Tap ✕ en un banner → se oculta (solo en esta sesión)
- [ ] Build sin errores: `npm run build`
