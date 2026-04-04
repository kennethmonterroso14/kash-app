# Fase 6 — Tarjetas de Crédito (núcleo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar tarjetas de crédito como pasivo real — CRUD de TCs, registro de cargos, pagos, cierre de ciclos, y widgets en el dashboard que reflejen la deuda y el dinero realmente disponible.

**Architecture:** La TC es un pasivo: `disponible = límite - deuda_actual`. Un trigger en Supabase (`trg_deuda_tc`) mantiene `deuda_actual` sincronizado con cada transacción `gasto_tc`/`pago_tc` insertada en la tabla `transacciones`. El frontend solo lee `tarjetas_credito.deuda_actual` — nunca lo calcula. Los cálculos de fechas (días para cierre/pago) viven en `finanzas.ts`. El nuevo hook `useTarjetas` encapsula todo el acceso a datos de TC incluyendo `registrarCargo` y `registrarPago`. Las páginas existentes se modifican mínimamente (solo se añaden widgets/tabs).

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS v3 + Supabase (trigger SQL, RLS, RPC function)

---

## File Map

| Archivo | Tipo | Qué hace |
|---|---|---|
| `tailwind.config.js` | NO tocar | — |
| `src/lib/finanzas.ts` | Modify | Extender tipo Transaccion + interfaces TC + `calcResumenTC`, `calcDisponibleReal`, `calcPatrimonioNeto`, `calcEstadisticasMes` incluye `gasto_tc` |
| `src/hooks/useTarjetas.ts` | Create | CRUD tarjetas + `registrarCargo` + `registrarPago` + `cerrarCiclo` |
| `src/hooks/useTransacciones.ts` | Modify | Extender tipo Transaccion con `tarjeta_id`, `cuenta_id` nullable, `tipo` union extendida |
| `src/pages/TarjetasPage.tsx` | Create | Lista de TCs + 3 bottom sheets (nueva TC, cargo, pago) + modal cerrar ciclo |
| `src/pages/TransaccionesPage.tsx` | Modify | Añadir tab "Gasto TC" al formulario de nueva transacción |
| `src/pages/DashboardPage.tsx` | Modify | Widget "Disponible Real" + mini-cards TC scroll horizontal |
| `src/App.tsx` | Modify | Añadir ruta `/tarjetas` |
| `src/pages/PerfilPage.tsx` | Modify | Añadir link "Tarjetas de Crédito" en shortcuts |

---

## Task 1: Migración de base de datos (paso manual)

> ⚠️ Este task es manual. Ejecutar el SQL en Supabase → SQL Editor → New query. Verificar resultado. No hay código que commitear.

**Files:** ninguno (cambio en Supabase, no en el repo)

- [ ] **Step 1: Abrir Supabase SQL Editor**

Ir a https://supabase.com → proyecto → SQL Editor → New query

- [ ] **Step 2: Ejecutar migración completa**

Pegar y ejecutar el siguiente SQL completo:

```sql
-- ══════════════════════════════════════════════════════
-- VORTA — Migración aditiva v2.0
-- NO modifica tablas existentes. Solo agrega nuevas.
-- ══════════════════════════════════════════════════════

-- ── Hacer cuenta_id nullable en transacciones ─────────
-- Los gastos TC no debitan ninguna cuenta directamente
alter table transacciones
  alter column cuenta_id drop not null;

-- ── ENUMS nuevos ─────────────────────────────────────
do $$ begin
  create type estado_ciclo_tc as enum ('abierto', 'cerrado', 'pagado');
exception when duplicate_object then null;
end $$;

-- Extender tipo_transaccion con los nuevos tipos TC
alter type tipo_transaccion add value if not exists 'gasto_tc';
alter type tipo_transaccion add value if not exists 'pago_tc';

-- ── TARJETAS DE CRÉDITO ───────────────────────────────
create table if not exists tarjetas_credito (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid references auth.users(id) on delete cascade not null,
  nombre                  text not null,
  banco                   text,
  ultimos_4               char(4),
  limite_credito          bigint not null,
  deuda_actual            bigint not null default 0,
  deuda_ciclo_anterior    bigint not null default 0,
  dia_cierre              smallint not null,
  dia_pago                smallint not null,
  moneda                  text not null default 'GTQ',
  color                   text not null default '#7c6af7',
  activa                  boolean not null default true,
  created_at              timestamptz not null default now(),

  constraint tc_limite_positivo    check (limite_credito > 0),
  constraint tc_deuda_no_negativa  check (deuda_actual >= 0),
  constraint tc_dia_cierre_valido  check (dia_cierre between 1 and 31),
  constraint tc_dia_pago_valido    check (dia_pago between 1 and 31)
);

-- ── CICLOS DE TARJETA DE CRÉDITO ─────────────────────
create table if not exists ciclos_tc (
  id              uuid primary key default uuid_generate_v4(),
  tarjeta_id      uuid references tarjetas_credito(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  fecha_inicio    date not null,
  fecha_cierre    date not null,
  fecha_pago      date not null,
  total_cargos    bigint not null default 0,
  total_pagos     bigint not null default 0,
  saldo_final     bigint not null default 0,
  estado          estado_ciclo_tc not null default 'abierto',
  created_at      timestamptz not null default now(),

  constraint ciclo_fechas_validas check (fecha_cierre > fecha_inicio),
  unique(tarjeta_id, fecha_inicio)
);

-- ── ÍNDICES ──────────────────────────────────────────
create index if not exists idx_tc_user
  on tarjetas_credito(user_id);
create index if not exists idx_ciclos_tarjeta
  on ciclos_tc(tarjeta_id, fecha_inicio desc);
create index if not exists idx_tx_tarjeta
  on transacciones(tarjeta_id, fecha desc) where tarjeta_id is not null;

-- ── Agregar columnas a transacciones (aditivo) ────────
alter table transacciones
  add column if not exists tarjeta_id uuid references tarjetas_credito(id),
  add column if not exists ciclo_id   uuid references ciclos_tc(id);

-- ── RLS NUEVAS TABLAS ─────────────────────────────────
alter table tarjetas_credito  enable row level security;
alter table ciclos_tc         enable row level security;

create policy if not exists "own" on tarjetas_credito
  for all using (auth.uid() = user_id);
create policy if not exists "own" on ciclos_tc
  for all using (auth.uid() = user_id);

-- ── TRIGGER: actualizar deuda de TC ──────────────────
create or replace function actualizar_deuda_tc()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.tipo = 'gasto_tc' and NEW.tarjeta_id is not null then
      update tarjetas_credito
        set deuda_actual = deuda_actual + abs(NEW.cantidad)
        where id = NEW.tarjeta_id;
    end if;
    if NEW.tipo = 'pago_tc' and NEW.tarjeta_id is not null then
      update tarjetas_credito
        set deuda_ciclo_anterior = greatest(0,
              deuda_ciclo_anterior - abs(NEW.cantidad)),
            deuda_actual = greatest(0,
              deuda_actual - greatest(0,
                abs(NEW.cantidad) - deuda_ciclo_anterior))
        where id = NEW.tarjeta_id;
    end if;

  elsif TG_OP = 'DELETE' then
    if OLD.tipo = 'gasto_tc' and OLD.tarjeta_id is not null then
      update tarjetas_credito
        set deuda_actual = greatest(0, deuda_actual - abs(OLD.cantidad))
        where id = OLD.tarjeta_id;
    end if;
    if OLD.tipo = 'pago_tc' and OLD.tarjeta_id is not null then
      update tarjetas_credito
        set deuda_actual = deuda_actual + abs(OLD.cantidad)
        where id = OLD.tarjeta_id;
    end if;

  elsif TG_OP = 'UPDATE' then
    if OLD.tipo = 'gasto_tc' and OLD.tarjeta_id is not null then
      update tarjetas_credito
        set deuda_actual = greatest(0, deuda_actual - abs(OLD.cantidad))
        where id = OLD.tarjeta_id;
    end if;
    if NEW.tipo = 'gasto_tc' and NEW.tarjeta_id is not null then
      update tarjetas_credito
        set deuda_actual = deuda_actual + abs(NEW.cantidad)
        where id = NEW.tarjeta_id;
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

create trigger trg_deuda_tc
  after insert or update or delete on transacciones
  for each row execute function actualizar_deuda_tc();

-- ── FUNCIÓN RPC: cerrar ciclo ─────────────────────────
create or replace function cerrar_ciclo_tc(p_tarjeta_id uuid)
returns void as $$
declare
  v_deuda bigint;
begin
  select deuda_actual into v_deuda
    from tarjetas_credito where id = p_tarjeta_id;

  update tarjetas_credito
    set deuda_ciclo_anterior = deuda_ciclo_anterior + deuda_actual,
        deuda_actual = 0
    where id = p_tarjeta_id;

  update ciclos_tc
    set estado = 'cerrado', saldo_final = v_deuda
    where tarjeta_id = p_tarjeta_id and estado = 'abierto';
end;
$$ language plpgsql security definer;
```

- [ ] **Step 3: Verificar tablas creadas**

En Supabase → Table Editor, confirmar que existen:
- `tarjetas_credito` con columnas: id, user_id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, moneda, color, activa, created_at
- `ciclos_tc` con columnas: id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, total_cargos, total_pagos, saldo_final, estado, created_at
- En `transacciones`: columnas `tarjeta_id` y `ciclo_id` existen

En Supabase → Database → Functions: confirmar que existe `cerrar_ciclo_tc` y `actualizar_deuda_tc`.
En Supabase → Database → Triggers: confirmar que existe `trg_deuda_tc` en tabla `transacciones`.

---

## Task 2: Extender finanzas.ts con tipos TC y funciones de cálculo

**Files:**
- Modify: `src/lib/finanzas.ts`

- [ ] **Step 1: Extender el tipo Transaccion en finanzas.ts (línea 32)**

El tipo Transaccion en finanzas.ts se usa en `calcEstadisticasMes`. Agregar `gasto_tc` al union de tipo:

```typescript
export interface Transaccion {
  id: string
  fecha: string
  cantidad: number        // centavos, negativo = gasto
  categoria: string
  tipo: 'ingreso' | 'gasto' | 'ajuste' | 'gasto_tc' | 'pago_tc'
  descripcion: string
}
```

- [ ] **Step 2: Actualizar calcEstadisticasMes para incluir gasto_tc en gastos (línea 58)**

```typescript
export function calcEstadisticasMes(
  transacciones: Transaccion[]
): EstadisticasMes {
  const ingresos = transacciones
    .filter(t => t.tipo === 'ingreso')
    .reduce((sum, t) => sum + t.cantidad, 0)

  const gastos = transacciones
    .filter(t => t.tipo === 'gasto' || t.tipo === 'gasto_tc')
    .reduce((sum, t) => sum + Math.abs(t.cantidad), 0)

  const neto = ingresos - gastos
  const pctAhorro = ingresos > 0
    ? Math.round((neto / ingresos) * 100)
    : 0

  const porCategoria: Record<string, number> = {}
  transacciones
    .filter(t => t.tipo === 'gasto' || t.tipo === 'gasto_tc')
    .forEach(t => {
      porCategoria[t.categoria] =
        (porCategoria[t.categoria] || 0) + Math.abs(t.cantidad)
    })

  return { ingresos, gastos, neto, pctAhorro, porCategoria }
}
```

- [ ] **Step 3: Agregar interfaces y funciones TC al final de finanzas.ts**

Agregar después de la última línea del archivo:

```typescript
// ─── TARJETAS DE CRÉDITO ─────────────────────────────────────

export interface TarjetaCredito {
  id: string
  nombre: string
  banco?: string
  ultimos_4?: string
  limite_credito: number       // centavos
  deuda_actual: number         // centavos — ciclo abierto (no facturado aún)
  deuda_ciclo_anterior: number // centavos — ya facturado, pendiente de pago
  dia_cierre: number
  dia_pago: number
  color: string
  activa: boolean
}

export interface ResumenTC {
  disponible: number           // limite - deuda_actual
  deuda_total: number          // deuda_actual + deuda_ciclo_anterior
  pct_uso: number              // 0-100
  estado: 'ok' | 'alerta' | 'critico'
  dias_para_cierre: number
  dias_para_pago: number
  proximo_cierre: Date
  proximo_pago: Date
}

export interface DisponibleReal {
  saldo_cuentas: number
  deuda_tc_vencida: number     // solo deuda_ciclo_anterior (ya hay que pagar)
  deuda_tc_acumulando: number  // deuda_actual (ciclo abierto, aún no vence)
  disponible_real: number      // saldo_cuentas - deuda_tc_vencida
  advertencia: string | null
}

export interface PatrimonioNeto {
  activos: number              // cuentas + inversiones
  pasivos: number              // toda la deuda TC (actual + ciclo anterior)
  neto: number
  tendencia: 'positiva' | 'negativa' | 'neutral'
}

function _proximaFechaDelDia(desde: Date, dia: number): Date {
  const d = new Date(desde)
  d.setDate(dia)
  if (d <= desde) d.setMonth(d.getMonth() + 1)
  return d
}

export function calcResumenTC(tc: TarjetaCredito): ResumenTC {
  const disponible = tc.limite_credito - tc.deuda_actual
  const deuda_total = tc.deuda_actual + tc.deuda_ciclo_anterior
  const pct_uso = Math.round((tc.deuda_actual / tc.limite_credito) * 100)
  const estado = pct_uso >= 90 ? 'critico' : pct_uso >= 70 ? 'alerta' : 'ok'

  const hoy = new Date()
  const proximo_cierre = _proximaFechaDelDia(hoy, tc.dia_cierre)
  const proximo_pago   = _proximaFechaDelDia(hoy, tc.dia_pago)
  const MS_DIA = 1000 * 60 * 60 * 24

  return {
    disponible,
    deuda_total,
    pct_uso,
    estado,
    dias_para_cierre: Math.ceil((proximo_cierre.getTime() - hoy.getTime()) / MS_DIA),
    dias_para_pago:   Math.ceil((proximo_pago.getTime()   - hoy.getTime()) / MS_DIA),
    proximo_cierre,
    proximo_pago,
  }
}

export function calcDisponibleReal(
  saldoCuentas: number,
  tarjetas: TarjetaCredito[]
): DisponibleReal {
  const deuda_tc_vencida    = tarjetas.reduce((s, tc) => s + tc.deuda_ciclo_anterior, 0)
  const deuda_tc_acumulando = tarjetas.reduce((s, tc) => s + tc.deuda_actual, 0)
  const disponible_real     = saldoCuentas - deuda_tc_vencida

  const advertencia =
    disponible_real < 0
      ? `Tus deudas vencidas de TC (${formatQ(deuda_tc_vencida)}) superan tu saldo en cuentas`
      : deuda_tc_vencida > saldoCuentas * 0.5
      ? `Más del 50% de tu saldo está comprometido con pagos de TC pendientes`
      : null

  return {
    saldo_cuentas: saldoCuentas,
    deuda_tc_vencida,
    deuda_tc_acumulando,
    disponible_real,
    advertencia,
  }
}

export function calcPatrimonioNeto(
  saldoCuentas: number,
  valorInversiones: number,
  tarjetas: TarjetaCredito[]
): PatrimonioNeto {
  const activos  = saldoCuentas + valorInversiones
  const pasivos  = tarjetas.reduce(
    (s, tc) => s + tc.deuda_actual + tc.deuda_ciclo_anterior, 0
  )
  const neto     = activos - pasivos
  const tendencia = neto > 0 ? 'positiva' : neto < 0 ? 'negativa' : 'neutral'
  return { activos, pasivos, neto, tendencia }
}
```

- [ ] **Step 4: Verificar build**

```bash
cd /Users/kennethmonterroso/Documents/kash-app
PATH="/opt/homebrew/opt/node@25/bin:$PATH" npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built in ...`

- [ ] **Step 5: Commit**

```bash
git add src/lib/finanzas.ts
git commit -m "feat(tc): extender finanzas.ts con tipos TC, calcResumenTC, calcDisponibleReal, calcPatrimonioNeto"
```

---

## Task 3: Crear useTarjetas.ts

**Files:**
- Create: `src/hooks/useTarjetas.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/hooks/useTarjetas.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { calcResumenTC, type TarjetaCredito } from '../lib/finanzas'

export type { TarjetaCredito }

export function useTarjetas(userId: string) {
  const [tarjetas, setTarjetas] = useState<TarjetaCredito[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tarjetas_credito')
        .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
        .eq('user_id', userId)
        .eq('activa', true)
        .order('created_at')
      if (error) throw error
      setTarjetas(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar tarjetas')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  const agregarTC = async (input: {
    nombre: string
    banco?: string
    ultimos_4?: string
    limite_credito: number    // centavos
    dia_cierre: number
    dia_pago: number
    color?: string
  }) => {
    if (!input.nombre.trim())                       throw new Error('El nombre es requerido')
    if (input.limite_credito <= 0)                  throw new Error('El límite debe ser mayor a Q0')
    if (input.dia_cierre < 1 || input.dia_cierre > 31) throw new Error('Día de cierre inválido')
    if (input.dia_pago   < 1 || input.dia_pago   > 31) throw new Error('Día de pago inválido')

    const { data, error } = await supabase
      .from('tarjetas_credito')
      .insert({ ...input, user_id: userId })
      .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
      .single()
    if (error) throw new Error(`Error al guardar: ${error.message}`)
    setTarjetas(prev => [...prev, data])
    return data
  }

  const archivarTC = async (id: string) => {
    const { count } = await supabase
      .from('transacciones')
      .select('id', { count: 'exact', head: true })
      .eq('tarjeta_id', id)
    if ((count ?? 0) > 0) {
      await supabase.from('tarjetas_credito').update({ activa: false }).eq('id', id)
    } else {
      await supabase.from('tarjetas_credito').delete().eq('id', id)
    }
    setTarjetas(prev => prev.filter(tc => tc.id !== id))
  }

  const cerrarCiclo = async (tcId: string) => {
    const { error } = await supabase.rpc('cerrar_ciclo_tc', { p_tarjeta_id: tcId })
    if (error) throw new Error(`Error al cerrar ciclo: ${error.message}`)
    await cargar()
  }

  // Registrar un cargo en la TC (gasto_tc)
  // cuenta_id es null porque el cargo no debita ninguna cuenta bancaria aún
  const registrarCargo = async (input: {
    tarjeta_id: string
    monto: number        // centavos, positivo
    descripcion: string
    categoria: string
    fecha: string
  }) => {
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        cuenta_id:   null,
        tarjeta_id:  input.tarjeta_id,
        cantidad:    -Math.abs(input.monto),   // negativo = gasto
        descripcion: input.descripcion,
        categoria:   input.categoria,
        tipo:        'gasto_tc',
        fecha:       input.fecha,
      })
    if (error) throw new Error(`Error al registrar cargo: ${error.message}`)
    await cargar()   // refrescar deuda_actual en la card
  }

  // Registrar un pago de TC desde una cuenta bancaria (pago_tc)
  // Debita la cuenta bancaria Y reduce deuda_ciclo_anterior (vía trigger)
  const registrarPago = async (input: {
    tarjeta_id: string
    monto: number        // centavos, positivo
    cuenta_id: string
    fecha: string
  }) => {
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        cuenta_id:   input.cuenta_id,
        tarjeta_id:  input.tarjeta_id,
        cantidad:    -Math.abs(input.monto),   // negativo = sale de la cuenta
        descripcion: 'Pago tarjeta de crédito',
        categoria:   'Pago Deudas',
        tipo:        'pago_tc',
        fecha:       input.fecha,
      })
    if (error) throw new Error(`Error al registrar pago: ${error.message}`)
    await cargar()
  }

  const resumenTCs = tarjetas.map(tc => ({
    tc,
    resumen: calcResumenTC(tc),
  }))

  const totalDeuda = tarjetas.reduce(
    (s, tc) => s + tc.deuda_actual + tc.deuda_ciclo_anterior, 0
  )

  return {
    tarjetas,
    resumenTCs,
    totalDeuda,
    loading,
    error,
    agregarTC,
    archivarTC,
    cerrarCiclo,
    registrarCargo,
    registrarPago,
    recargar: cargar,
  }
}
```

- [ ] **Step 2: Verificar build**

```bash
cd /Users/kennethmonterroso/Documents/kash-app
PATH="/opt/homebrew/opt/node@25/bin:$PATH" npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTarjetas.ts
git commit -m "feat(tc): nuevo hook useTarjetas — CRUD tarjetas, registrarCargo, registrarPago, cerrarCiclo"
```

---

## Task 4: Crear TarjetasPage.tsx

**Files:**
- Create: `src/pages/TarjetasPage.tsx`

- [ ] **Step 1: Crear el archivo completo**

```tsx
// src/pages/TarjetasPage.tsx
import { useState, useEffect } from 'react'
import { useTarjetas } from '../hooks/useTarjetas'
import { useCuentas } from '../hooks/useCuentas'
import { formatQ, toCentavos, type TarjetaCredito } from '../lib/finanzas'
import { CATEGORIAS_GASTO, hoyGT } from '../lib/constants'

interface Props { userId: string }

type Pantalla = 'lista' | 'nueva_tc' | 'cargo' | 'pago' | 'cerrar'

const COLORES_TC = [
  '#7c6af7', '#4ade80', '#f87171', '#fbbf24',
  '#60a5fa', '#f472b6', '#34d399', '#fb923c',
]

export default function TarjetasPage({ userId }: Props) {
  const {
    resumenTCs, totalDeuda, loading, error,
    agregarTC, archivarTC, cerrarCiclo,
    registrarCargo, registrarPago,
  } = useTarjetas(userId)
  const { cuentas } = useCuentas(userId)

  // ── Navegación entre pantallas ─────────────────────────────────
  const [pantalla, setPantalla] = useState<Pantalla>('lista')
  const [tcSelId, setTcSelId]   = useState<string | null>(null)
  const tcSel = resumenTCs.find(r => r.tc.id === tcSelId) ?? null

  // ── Form "Nueva TC" ────────────────────────────────────────────
  const [tcNombre, setTcNombre] = useState('')
  const [tcBanco,  setTcBanco]  = useState('')
  const [tcUlt4,   setTcUlt4]   = useState('')
  const [tcLimite, setTcLimite] = useState('')
  const [tcCierre, setTcCierre] = useState('')
  const [tcPago,   setTcPago]   = useState('')
  const [tcColor,  setTcColor]  = useState(COLORES_TC[0])
  const [savingTC, setSavingTC] = useState(false)
  const [errTC,    setErrTC]    = useState<string | null>(null)

  // ── Form "Nuevo cargo" ─────────────────────────────────────────
  const [cargoMonto, setCargoMonto] = useState('')
  const [cargoCat,   setCargoCat]   = useState(CATEGORIAS_GASTO[0])
  const [cargoDesc,  setCargoDesc]  = useState('')
  const [cargoFecha, setCargoFecha] = useState(hoyGT())
  const [savingCargo, setSavingCargo] = useState(false)
  const [errCargo,    setErrCargo]    = useState<string | null>(null)

  // ── Form "Pagar TC" ────────────────────────────────────────────
  const [pagoMonto,   setPagoMonto]   = useState('')
  const [pagoCuenta,  setPagoCuenta]  = useState('')
  const [pagoFecha,   setPagoFecha]   = useState(hoyGT())
  const [savingPago,  setSavingPago]  = useState(false)
  const [errPago,     setErrPago]     = useState<string | null>(null)

  // ── Cerrar ciclo ───────────────────────────────────────────────
  const [savingCerrar, setSavingCerrar] = useState(false)
  const [errCerrar,    setErrCerrar]    = useState<string | null>(null)

  // Default primera cuenta para pago
  useEffect(() => {
    if (!pagoCuenta && cuentas.length > 0) setPagoCuenta(cuentas[0].id)
  }, [cuentas, pagoCuenta])

  // ── Helpers de reset ───────────────────────────────────────────
  const abrirNuevaTC = () => {
    setTcNombre(''); setTcBanco(''); setTcUlt4('')
    setTcLimite(''); setTcCierre(''); setTcPago('')
    setTcColor(COLORES_TC[0]); setErrTC(null)
    setPantalla('nueva_tc')
  }

  const abrirCargo = (tcId: string) => {
    setCargoMonto(''); setCargoCat(CATEGORIAS_GASTO[0])
    setCargoDesc(''); setCargoFecha(hoyGT()); setErrCargo(null)
    setTcSelId(tcId); setPantalla('cargo')
  }

  const abrirPago = (tcId: string) => {
    const tc = resumenTCs.find(r => r.tc.id === tcId)?.tc
    setPagoMonto(tc ? String((tc.deuda_ciclo_anterior / 100).toFixed(2)) : '')
    setPagoFecha(hoyGT()); setErrPago(null)
    setTcSelId(tcId); setPantalla('pago')
  }

  // ── Handlers ───────────────────────────────────────────────────
  const handleNuevaTC = async () => {
    setErrTC(null)
    const lim = parseFloat(tcLimite)
    const cie = parseInt(tcCierre)
    const pag = parseInt(tcPago)
    if (!tcNombre.trim())          return setErrTC('El nombre es requerido')
    if (isNaN(lim) || lim <= 0)   return setErrTC('El límite debe ser mayor a Q0')
    if (isNaN(cie) || cie < 1 || cie > 31) return setErrTC('Día de cierre inválido (1-31)')
    if (isNaN(pag) || pag < 1 || pag > 31) return setErrTC('Día de pago inválido (1-31)')
    if (pag < cie + 5)             return setErrTC('El día de pago debe ser al menos 5 días después del cierre')
    try {
      setSavingTC(true)
      await agregarTC({
        nombre:         tcNombre.trim(),
        banco:          tcBanco.trim() || undefined,
        ultimos_4:      tcUlt4.replace(/\D/g, '').slice(0, 4) || undefined,
        limite_credito: toCentavos(lim),
        dia_cierre:     cie,
        dia_pago:       pag,
        color:          tcColor,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrTC(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSavingTC(false)
    }
  }

  const handleCargo = async () => {
    if (!tcSelId || !tcSel) return
    setErrCargo(null)
    const monto = parseFloat(cargoMonto)
    if (isNaN(monto) || monto <= 0) return setErrCargo('El monto debe ser mayor a Q0')
    if (!cargoDesc.trim())          return setErrCargo('La descripción es requerida')
    const montoCent  = toCentavos(monto)
    const disponible = tcSel.tc.limite_credito - tcSel.tc.deuda_actual
    if (montoCent > disponible) return setErrCargo(`Excede el disponible (${formatQ(disponible)})`)
    try {
      setSavingCargo(true)
      await registrarCargo({
        tarjeta_id:  tcSelId,
        monto:       montoCent,
        descripcion: cargoDesc.trim(),
        categoria:   cargoCat,
        fecha:       cargoFecha,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrCargo(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setSavingCargo(false)
    }
  }

  const handlePago = async () => {
    if (!tcSelId) return
    setErrPago(null)
    const monto = parseFloat(pagoMonto)
    if (isNaN(monto) || monto <= 0) return setErrPago('El monto debe ser mayor a Q0')
    if (!pagoCuenta)                return setErrPago('Selecciona una cuenta')
    try {
      setSavingPago(true)
      await registrarPago({
        tarjeta_id: tcSelId,
        monto:      toCentavos(monto),
        cuenta_id:  pagoCuenta,
        fecha:      pagoFecha,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrPago(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setSavingPago(false)
    }
  }

  const handleCerrarCiclo = async () => {
    if (!tcSelId) return
    setErrCerrar(null)
    try {
      setSavingCerrar(true)
      await cerrarCiclo(tcSelId)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrCerrar(e instanceof Error ? e.message : 'Error al cerrar ciclo')
    } finally {
      setSavingCerrar(false)
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────
  const disponibleTrasCargo = (tc: TarjetaCredito) => {
    const monto = parseFloat(cargoMonto)
    if (isNaN(monto) || monto <= 0) return null
    return tc.limite_credito - tc.deuda_actual - toCentavos(monto)
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-display font-bold text-xl">Tarjetas de Crédito</h1>
          {totalDeuda > 0 && (
            <p className="text-danger text-xs mt-0.5">
              Deuda total: <span className="font-mono">{formatQ(totalDeuda)}</span>
            </p>
          )}
        </div>
        <button
          onClick={abrirNuevaTC}
          className="bg-accent text-bg px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + Nueva TC
        </button>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {/* Empty state */}
      {resumenTCs.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-muted text-sm">No tienes tarjetas registradas</p>
          <p className="text-textDim text-xs mt-1">Agrega tu primera TC para empezar</p>
        </div>
      )}

      {/* Lista de TCs */}
      <div className="flex flex-col gap-4">
        {resumenTCs.map(({ tc, resumen }) => (
          <div key={tc.id} className="bg-surface rounded-2xl p-4 space-y-3">
            {/* TC header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                <div>
                  <p className="text-white font-semibold text-sm">{tc.nombre}</p>
                  {(tc.banco || tc.ultimos_4) && (
                    <p className="text-muted text-xs">
                      {tc.banco}{tc.ultimos_4 ? ` ••••${tc.ultimos_4}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                resumen.estado === 'critico' ? 'bg-danger/10 text-danger' :
                resumen.estado === 'alerta'  ? 'bg-warning/10 text-warning' :
                                               'bg-success/10 text-success'
              }`}>
                {resumen.pct_uso}% usado
              </span>
            </div>

            {/* Disponible */}
            <div>
              <p className="text-muted text-xs mb-0.5">Disponible</p>
              <p className="text-white font-mono font-bold text-2xl">{formatQ(resumen.disponible)}</p>
            </div>

            {/* Barra de uso */}
            <div className="h-1.5 bg-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  resumen.estado === 'critico' ? 'bg-danger' :
                  resumen.estado === 'alerta'  ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
              />
            </div>

            {/* Detalle deuda */}
            <div className="flex justify-between text-xs">
              <span className="text-muted">
                Ciclo actual: <span className="text-white font-mono">{formatQ(tc.deuda_actual)}</span>
              </span>
              <span className="text-muted">
                Límite: <span className="text-white font-mono">{formatQ(tc.limite_credito)}</span>
              </span>
            </div>

            {/* Banner deuda vencida */}
            {tc.deuda_ciclo_anterior > 0 && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3">
                <p className="text-danger text-xs font-semibold">
                  ⚠ Pagar {formatQ(tc.deuda_ciclo_anterior)} antes del día {tc.dia_pago}
                </p>
                <p className="text-danger/70 text-xs mt-0.5">
                  {resumen.dias_para_pago} días restantes para el pago
                </p>
              </div>
            )}

            {/* Fechas */}
            <div className="flex gap-4 text-xs text-muted">
              <span>Cierre en <span className="text-white">{resumen.dias_para_cierre}d</span></span>
              <span>Pago en <span className="text-white">{resumen.dias_para_pago}d</span></span>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => abrirCargo(tc.id)}
                className="flex-1 py-2 rounded-xl bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
              >
                + Cargo
              </button>
              <button
                onClick={() => abrirPago(tc.id)}
                className="flex-1 py-2 rounded-xl bg-surface2 text-white text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                Pagar TC
              </button>
              <button
                onClick={() => { setTcSelId(tc.id); setErrCerrar(null); setPantalla('cerrar') }}
                disabled={tc.deuda_actual === 0}
                className="flex-1 py-2 rounded-xl bg-surface2 text-muted text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cerrar ciclo
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════ MODALES ═══════════════ */}

      {/* Modal: Nueva TC */}
      {pantalla === 'nueva_tc' && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Nueva tarjeta</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nombre (ej: Visa BAC Personal)"
                value={tcNombre} onChange={e => setTcNombre(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Banco (opcional)"
                value={tcBanco} onChange={e => setTcBanco(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Últimos 4 dígitos (opcional)"
                value={tcUlt4} onChange={e => setTcUlt4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" maxLength={4}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Límite de crédito (Q)"
                value={tcLimite} onChange={e => setTcLimite(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Día de cierre"
                  value={tcCierre} onChange={e => setTcCierre(e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <input
                  placeholder="Día de pago"
                  value={tcPago} onChange={e => setTcPago(e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <p className="text-muted text-xs mb-2">Color de la tarjeta</p>
                <div className="flex gap-2 flex-wrap">
                  {COLORES_TC.map(c => (
                    <button
                      key={c}
                      onClick={() => setTcColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${tcColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              {errTC && <p className="text-danger text-sm">{errTC}</p>}
              <button
                onClick={handleNuevaTC}
                disabled={savingTC}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
              >
                {savingTC ? 'Guardando...' : 'Agregar tarjeta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo cargo TC */}
      {pantalla === 'cargo' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Cargo — {tcSel.tc.nombre}</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>

            {/* Preview disponible tras el cargo */}
            {cargoMonto && !isNaN(parseFloat(cargoMonto)) && (
              <div className="bg-bg rounded-xl p-3 mb-4">
                <p className="text-muted text-xs mb-0.5">Disponible tras este cargo</p>
                {(() => {
                  const tras = disponibleTrasCargo(tcSel.tc)
                  if (tras === null) return null
                  return (
                    <>
                      <p className={`font-mono font-bold text-lg ${tras >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatQ(Math.max(0, tras))}
                      </p>
                      {tras < 0 && (
                        <p className="text-danger text-xs mt-1">⚠ Excede el disponible</p>
                      )}
                      {tras >= 0 && (tcSel.tc.deuda_actual + toCentavos(parseFloat(cargoMonto))) / tcSel.tc.limite_credito >= 0.9 && (
                        <p className="text-warning text-xs mt-1">⚠ Superarás el 90% de uso de la TC</p>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <input
                placeholder="Monto (Q)"
                value={cargoMonto} onChange={e => setCargoMonto(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Descripción"
                value={cargoDesc} onChange={e => setCargoDesc(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div>
                <p className="text-muted text-xs mb-2">Categoría</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIAS_GASTO.map(c => (
                    <button
                      key={c}
                      onClick={() => setCargoCat(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        cargoCat === c ? 'bg-accent text-bg font-semibold' : 'bg-bg text-muted hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="date"
                value={cargoFecha} onChange={e => setCargoFecha(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              />
              {errCargo && <p className="text-danger text-sm">{errCargo}</p>}
              <button
                onClick={handleCargo}
                disabled={savingCargo}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingCargo ? 'Registrando...' : 'Registrar cargo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pagar TC */}
      {pantalla === 'pago' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Pagar — {tcSel.tc.nombre}</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>

            {/* Resumen de deuda */}
            <div className="bg-bg rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Deuda vencida (pagar ya)</span>
                <span className={`font-mono ${tcSel.tc.deuda_ciclo_anterior > 0 ? 'text-danger' : 'text-muted'}`}>
                  {formatQ(tcSel.tc.deuda_ciclo_anterior)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Deuda ciclo actual</span>
                <span className="text-white font-mono">{formatQ(tcSel.tc.deuda_actual)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <input
                placeholder="Monto a pagar (Q)"
                value={pagoMonto} onChange={e => setPagoMonto(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <select
                value={pagoCuenta} onChange={e => setPagoCuenta(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              >
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {formatQ(c.saldo)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={pagoFecha} onChange={e => setPagoFecha(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              />
              {errPago && <p className="text-danger text-sm">{errPago}</p>}
              <button
                onClick={handlePago}
                disabled={savingPago}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingPago ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar cerrar ciclo */}
      {pantalla === 'cerrar' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-white font-semibold mb-2">¿Cerrar ciclo?</h2>
            <p className="text-muted text-sm mb-1">
              Tarjeta: <span className="text-white">{tcSel.tc.nombre}</span>
            </p>
            <p className="text-muted text-sm mb-4">
              Cargos del ciclo:{' '}
              <span className="text-white font-mono">{formatQ(tcSel.tc.deuda_actual)}</span>
              <br />
              <span className="text-textDim text-xs">
                Al cerrar, esta deuda pasará a "pendiente de pago" y el ciclo actual se reinicia en Q0.
              </span>
            </p>
            {errCerrar && <p className="text-danger text-sm mb-3">{errCerrar}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setPantalla('lista')}
                className="flex-1 py-3 rounded-xl bg-bg text-muted text-sm font-semibold hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarCiclo}
                disabled={savingCerrar}
                className="flex-1 py-3 rounded-xl bg-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingCerrar ? 'Cerrando...' : 'Cerrar ciclo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

```bash
cd /Users/kennethmonterroso/Documents/kash-app
PATH="/opt/homebrew/opt/node@25/bin:$PATH" npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built in ...` — si hay errores TypeScript en TarjetasPage.tsx, revisar que los imports de `formatQ`, `toCentavos`, `CATEGORIAS_GASTO`, `hoyGT` sean correctos.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TarjetasPage.tsx
git commit -m "feat(tc): TarjetasPage — lista de TCs, nuevo cargo, pago, cerrar ciclo"
```

---

## Task 5: Extender useTransacciones.ts + agregar tab "Gasto TC" en TransaccionesPage.tsx

**Files:**
- Modify: `src/hooks/useTransacciones.ts`
- Modify: `src/pages/TransaccionesPage.tsx`

- [ ] **Step 1: Actualizar la interfaz Transaccion en useTransacciones.ts**

Reemplazar la definición del interface Transaccion (líneas 5-14) con:

```typescript
export interface Transaccion {
  id: string
  cuenta_id: string | null
  fecha: string
  cantidad: number   // centavos
  descripcion: string
  categoria: string
  tipo: 'ingreso' | 'gasto' | 'ajuste' | 'gasto_tc' | 'pago_tc'
  notas?: string
  tarjeta_id?: string | null
}
```

- [ ] **Step 2: Actualizar el select en fetchTxns para incluir tarjeta_id**

En `useTransacciones.ts`, en la llamada `.select(...)` dentro de `fetchTxns`:

```typescript
const { data } = await supabase
  .from('transacciones')
  .select('id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas, tarjeta_id')
  .eq('user_id', userId)
  .gte('fecha', desde)
  .lte('fecha', hasta)
  .order('fecha', { ascending: false })
  .order('created_at', { ascending: false })
```

También actualizar el `.select(...)` en `restoreTxn` y `updateTxn` para incluir `tarjeta_id`:

```typescript
// En restoreTxn:
.select('id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas, tarjeta_id')

// En updateTxn:
.select('id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas, tarjeta_id')
```

- [ ] **Step 3: Actualizar addTxn para aceptar tipo extendido**

```typescript
const addTxn = async (txn: {
  cuenta_id: string
  cantidad: number
  descripcion: string
  categoria: string
  tipo: 'ingreso' | 'gasto' | 'ajuste'
  fecha?: string
  notas?: string
}) => {
```

> Nota: `addTxn` mantiene `cuenta_id: string` (no null) porque es para transacciones normales. Las TC usan `registrarCargo`/`registrarPago` de `useTarjetas`.

- [ ] **Step 4: Agregar tab "Gasto TC" en TransaccionesPage.tsx**

En `src/pages/TransaccionesPage.tsx`, hacer estos cambios:

**4a. Agregar import de useTarjetas (después de los imports existentes):**

```typescript
import { useTarjetas } from '../hooks/useTarjetas'
```

**4b. Extender el tipo TipoForm (línea 12):**

```typescript
type TipoForm = 'gasto' | 'ingreso' | 'transferencia' | 'gasto_tc'
```

**4c. Agregar hook y estado para TC (después de la línea `const [saving, setSaving] = useState(false)`):**

```typescript
const { resumenTCs, registrarCargo } = useTarjetas(user.id)
const [tcId, setTcId] = useState('')

// Default primera TC cuando carguen
useEffect(() => {
  if (!tcId && resumenTCs.length > 0) setTcId(resumenTCs[0].tc.id)
}, [resumenTCs, tcId])
```

**4d. En el form de nueva transacción, agregar el tab "Gasto TC" en el selector de tipo.**

Buscar el bloque donde están los botones de tipo (el que tiene 'gasto', 'ingreso', 'transferencia'). Agregar el nuevo botón. El bloque existente se ve así:

```tsx
{(['gasto', 'ingreso', 'transferencia'] as TipoForm[]).map(t => (
  <button key={t} onClick={() => setTipo(t)} className={`...`}>
    ...
  </button>
))}
```

Reemplazar con:

```tsx
{(['gasto', 'ingreso', 'gasto_tc', 'transferencia'] as TipoForm[]).map(t => (
  <button
    key={t}
    onClick={() => setTipo(t)}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      tipo === t
        ? t === 'ingreso'  ? 'bg-accent text-bg'
        : t === 'gasto'    ? 'bg-danger text-white'
        : t === 'gasto_tc' ? 'bg-warning/20 text-warning'
        :                    'text-white'
        : 'text-muted'
    }`}
  >
    {t === 'gasto' ? 'Gasto' : t === 'ingreso' ? 'Ingreso' : t === 'gasto_tc' ? 'Cargo TC' : 'Transferencia'}
  </button>
))}
```

**4e. Agregar selector de TC cuando tipo === 'gasto_tc' (donde aparece el selector de cuenta).**

En el area del formulario donde se muestra el selector de cuenta/cuentas, agregar un bloque condicional. Buscar algo como:

```tsx
{tipo !== 'transferencia' && (
  <select value={cuentaId} ...>
```

Reemplazar con:

```tsx
{tipo === 'gasto_tc' ? (
  <div className="flex flex-col gap-2">
    <select
      value={tcId}
      onChange={e => setTcId(e.target.value)}
      className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
    >
      {resumenTCs.length === 0
        ? <option value="">Sin tarjetas registradas</option>
        : resumenTCs.map(({ tc, resumen }) => (
          <option key={tc.id} value={tc.id}>
            {tc.nombre} — disponible {formatQ(resumen.disponible)}
          </option>
        ))
      }
    </select>
    {tcId && (() => {
      const sel = resumenTCs.find(r => r.tc.id === tcId)
      const monto = parseFloat(cantidad)
      if (!sel || isNaN(monto) || monto <= 0) return null
      const tras = sel.tc.limite_credito - sel.tc.deuda_actual - toCentavos(monto)
      return (
        <p className={`text-xs font-mono ${tras >= 0 ? 'text-success' : 'text-danger'}`}>
          Disponible tras cargo: {formatQ(Math.max(0, tras))}
          {tras < 0 ? ' ⚠ excede disponible' : ''}
        </p>
      )
    })()}
  </div>
) : tipo !== 'transferencia' ? (
  <select
    value={cuentaId}
    onChange={e => setCuentaId(e.target.value)}
    className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
  >
    {cuentas.map(c => (
      <option key={c.id} value={c.id}>{c.nombre} — {formatQ(c.saldo)}</option>
    ))}
  </select>
) : null}
```

**4f. Agregar branch de gasto_tc en handleSubmit.**

En la función `handleSubmit` (o `handleAdd`), agregar el case para 'gasto_tc'. Buscar el bloque `if (tipo === 'transferencia') { ... }` y agregar antes del `else`:

```typescript
if (tipo === 'gasto_tc') {
  if (!tcId || resumenTCs.length === 0) { setSaving(false); return }
  const monto = parseFloat(cantidad)
  if (isNaN(monto) || monto <= 0) { setSaving(false); return }
  try {
    await registrarCargo({
      tarjeta_id:  tcId,
      monto:       toCentavos(monto),
      descripcion: descripcion || categoria,
      categoria,
      fecha,
    })
    setShowForm(false)
    setCantidad(''); setDescripcion(''); setCategoria(CATEGORIAS_GASTO[0])
  } catch (e: unknown) {
    console.error('Error registrando cargo TC:', e)
  } finally {
    setSaving(false)
  }
  return
}
```

- [ ] **Step 5: Verificar build**

```bash
cd /Users/kennethmonterroso/Documents/kash-app
PATH="/opt/homebrew/opt/node@25/bin:$PATH" npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built in ...` — si hay error de tipo en el `useEffect` para `tcId`, verificar que la dependencia `resumenTCs` sea correcta.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTransacciones.ts src/pages/TransaccionesPage.tsx
git commit -m "feat(tc): extender Transaccion type + tab Cargo TC en TransaccionesPage"
```

---

## Task 6: Actualizar DashboardPage.tsx — widget Disponible Real + mini-cards TC

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Agregar imports en DashboardPage.tsx**

Añadir al bloque de imports existente:

```typescript
import { useTarjetas } from '../hooks/useTarjetas'
import { calcDisponibleReal } from '../lib/finanzas'
```

- [ ] **Step 2: Agregar hook useTarjetas dentro del componente**

Después de la línea `const { data: resumen6 } = useResumen6Meses(user.id)`:

```typescript
const { resumenTCs, tarjetas } = useTarjetas(user.id)
```

- [ ] **Step 3: Calcular disponibleReal con useMemo**

Después del `useMemo` de `stats`:

```typescript
const disponibleReal = useMemo(
  () => calcDisponibleReal(totalPatrimonio, tarjetas),
  [totalPatrimonio, tarjetas]
)
```

- [ ] **Step 4: Agregar widget "Disponible Real" en el JSX**

Insertar después del bloque del widget de patrimonio total (después del cierre del primer `</div>`) y antes del selector de mes:

```tsx
{/* Disponible Real — solo si hay TCs registradas */}
{tarjetas.length > 0 && (
  <div className="bg-surface rounded-2xl p-4">
    <p className="text-muted text-xs uppercase tracking-widest mb-3">Disponible Real</p>
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <span className="text-muted">Saldo en cuentas</span>
        <span className="font-mono text-white">{formatQ(disponibleReal.saldo_cuentas)}</span>
      </div>
      {disponibleReal.deuda_tc_vencida > 0 && (
        <div className="flex justify-between">
          <span className="text-muted">Deuda TC vencida</span>
          <span className="font-mono text-danger">−{formatQ(disponibleReal.deuda_tc_vencida)}</span>
        </div>
      )}
      <div className="border-t border-muted/20 pt-1.5 flex justify-between">
        <span className="text-white font-semibold text-sm">Disponible real</span>
        <span className={`font-mono font-bold ${disponibleReal.disponible_real >= 0 ? 'text-success' : 'text-danger'}`}>
          {formatQ(disponibleReal.disponible_real)}
        </span>
      </div>
    </div>
    {disponibleReal.advertencia && (
      <p className="text-warning text-xs mt-3 bg-warning/10 rounded-lg p-2">
        {disponibleReal.advertencia}
      </p>
    )}
  </div>
)}

{/* Mini-cards TC — scroll horizontal */}
{resumenTCs.length > 0 && (
  <div>
    <p className="text-muted text-xs uppercase tracking-widest mb-2">Tarjetas de crédito</p>
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
      {resumenTCs.map(({ tc, resumen }) => (
        <div key={tc.id} className="bg-surface rounded-xl p-3 flex-shrink-0 w-44 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
            <p className="text-white text-xs font-semibold truncate">{tc.nombre}</p>
          </div>
          <div>
            <p className="text-muted text-xs">Disponible</p>
            <p className="font-mono text-sm text-white font-semibold">{formatQ(resumen.disponible)}</p>
          </div>
          <div className="h-1 bg-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                resumen.estado === 'critico' ? 'bg-danger' :
                resumen.estado === 'alerta'  ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
            />
          </div>
          {tc.deuda_ciclo_anterior > 0 && (
            <p className="text-danger text-xs">⚠ Pago pendiente</p>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Verificar build**

```bash
cd /Users/kennethmonterroso/Documents/kash-app
PATH="/opt/homebrew/opt/node@25/bin:$PATH" npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built in ...`

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(tc): dashboard — widget Disponible Real + mini-cards TC scroll horizontal"
```

---

## Task 7: Routing + navegación

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/PerfilPage.tsx`

- [ ] **Step 1: Agregar import y ruta en App.tsx**

Agregar el import (después de los imports de pages existentes):

```typescript
import TarjetasPage from './pages/TarjetasPage'
```

Agregar la ruta (dentro del bloque `<Routes>`, después de la ruta de `/pagos`):

```tsx
<Route path="/tarjetas" element={<TarjetasPage userId={user.id} />} />
```

- [ ] **Step 2: Agregar link en PerfilPage.tsx**

En `src/pages/PerfilPage.tsx`, en el array de navigation shortcuts (que tiene Pagos Fijos, Metas, Proyecciones), agregar Tarjetas como primer item:

```typescript
{ to: '/tarjetas',     icon: '💳', label: 'Tarjetas de Crédito' },
{ to: '/pagos',        icon: '↻', label: 'Pagos Fijos' },
{ to: '/metas',        icon: '◉', label: 'Metas de ahorro' },
{ to: '/proyecciones', icon: '⟳', label: 'Proyecciones' },
```

- [ ] **Step 3: Verificar build final**

```bash
cd /Users/kennethmonterroso/Documents/kash-app
PATH="/opt/homebrew/opt/node@25/bin:$PATH" npm run build 2>&1 | grep -E "error TS|✓ built"
```

Expected: `✓ built in ...`

- [ ] **Step 4: Verificar que no hay "Kash" en los archivos nuevos**

```bash
grep -r "Kash" /Users/kennethmonterroso/Documents/kash-app/src/pages/TarjetasPage.tsx /Users/kennethmonterroso/Documents/kash-app/src/hooks/useTarjetas.ts 2>/dev/null
```

Expected: sin output.

- [ ] **Step 5: Commit y push**

```bash
git add src/App.tsx src/pages/PerfilPage.tsx
git commit -m "feat(tc): routing /tarjetas + link desde Perfil"
git push
```

---

## Verificación Funcional (manual, post-deploy)

Después de que Vercel despliegue:

- [ ] Ir a Perfil → "Tarjetas de Crédito" → se abre `/tarjetas`
- [ ] Crear TC: Visa BAC, límite Q5,000, cierre día 20, pago día 5 → aparece card con disponible Q5,000.00
- [ ] Registrar cargo Q500 en la TC → `deuda_actual` en Supabase pasa de 0 a 50000 centavos. Card muestra disponible Q4,500.00
- [ ] Dashboard → sección "Disponible Real" aparece y muestra saldo en cuentas - deuda vencida
- [ ] Cerrar ciclo → `deuda_actual` pasa a 0, `deuda_ciclo_anterior` aumenta en Q500. Banner rojo "⚠ Pagar Q500" aparece en la card.
- [ ] Pagar TC Q500 desde cuenta → `deuda_ciclo_anterior` baja a 0. La cuenta bancaria se debita Q500.
- [ ] En Movimientos, tab "Cargo TC" registra un gasto de la TC. Se muestra el disponible de la TC en tiempo real.
- [ ] Dashboard stats del mes incluye gastos TC en el total de "Gastos"
