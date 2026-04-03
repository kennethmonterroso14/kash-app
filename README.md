# Kash — Finanzas Personales

App de control de finanzas personales orientada al mercado guatemalteco. Migrada de Google Sheets + Apps Script a un stack moderno con React + TypeScript + Supabase.

**Producción**: https://kash-app-rho.vercel.app

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS v3 (dark theme) |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| Gráficas | Recharts |
| Deploy | Vercel (SPA routing via `vercel.json`) |
| PWA | vite-plugin-pwa (installable en móvil) |

---

## Tokens de diseño

```
bg:      #141417  (fondo principal)
surface: #1e1e24  (tarjetas)
accent:  #c8f564  (verde lima — positivo, CTAs)
danger:  #ff7c5c  (rojo naranja — negativo, errores)
muted:   #4a4f5e  (texto secundario)
```

---

## Reglas críticas de datos

- **Dinero siempre en centavos** (`bigint`). Nunca floats.
  - `formatQ(centavos)` → `"Q 1,500.00"`
  - `toCentavos(quetzales)` → `150000`
- **Timezone Guatemala**: `America/Guatemala` (UTC-6, sin DST). Usar `hoyGT()` para fechas.
- **`cantidad` en `transacciones`**: positivo = ingreso/ajuste+, negativo = gasto/ajuste−
- El trigger `actualizar_saldo_cuenta` en Postgres recalcula `cuentas.saldo` automáticamente en INSERT/UPDATE/DELETE de transacciones.

---

## Estructura del proyecto

```
src/
├── lib/
│   ├── supabase.ts          # Cliente Supabase (valida env vars al init)
│   ├── finanzas.ts          # Funciones puras: formatQ, toCentavos, calcEstadisticasMes,
│   │                        #   proyectarPatrimonio, calcTiempoParaMeta, calcEstadoPresupuesto
│   └── constants.ts         # CATEGORIAS_GASTO/INGRESO, CAT_COLORS, MESES, hoyGT(), mesActual()
│
├── hooks/
│   ├── useAuth.ts           # { user, loading, signOut } — onAuthStateChange
│   ├── useCuentas.ts        # { cuentas, loading, totalPatrimonio }
│   ├── useTransacciones.ts  # { txns, addTxn, deleteTxn, restoreTxn, updateTxn, addTransferencia }
│   ├── usePagosRecurrentes.ts # { pagos, addPago, updatePago, deletePago }
│   ├── useAutoApplyPagos.ts # Aplica pagos fijos vencidos al abrir la app (useRef guard)
│   └── useResumen6Meses.ts  # Una query → agrupa ingresos/gastos por mes (últimos 6)
│
├── pages/
│   ├── LoginPage.tsx        # Magic link auth (Supabase)
│   ├── SetupPage.tsx        # Onboarding: nombre → crea perfil (genérico, cualquier usuario)
│   ├── DashboardPage.tsx    # Patrimonio + stats mes + donut categorías + barras 6 meses
│   ├── TransaccionesPage.tsx # CRUD txns, filtros, CSV export, transferencias, edición
│   ├── CuentasPage.tsx      # CRUD cuentas + "± Ajustar saldo" por cuenta
│   ├── BudgetPage.tsx       # Presupuestos por mes: agregar/editar/eliminar, progress bars
│   ├── MetasPage.tsx        # Metas de ahorro con calcTiempoParaMeta
│   ├── ProyeccionesPage.tsx # Gráfica recharts proyección patrimonial (interés compuesto)
│   ├── PagosRecurrentesPage.tsx # Pagos fijos mensuales: CRUD, estado aplicado/pendiente
│   └── PerfilPage.tsx       # Avatar, nombre/email, links a Pagos/Metas/Proyecciones, sign out
│
└── components/
    └── Layout.tsx           # Header "Kash" + bottom nav (5 items) + slot de contenido
```

---

## Navegación

**Bottom nav** (5 items): Dashboard · Movimientos · Cuentas · Presupuesto · Perfil

**Desde Perfil**:
- ↻ Pagos Fijos
- ◉ Metas de ahorro
- ⟳ Proyecciones

---

## Schema de Supabase (`supabase/schema.sql`)

### Tablas principales

| Tabla | Descripción |
|---|---|
| `profiles` | `id, nombre` — vinculado a `auth.users` |
| `cuentas` | `id, user_id, nombre, tipo, saldo, color` — saldo actualizado por trigger |
| `transacciones` | `id, user_id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo` |
| `presupuestos` | `id, user_id, categoria, monto_limite, mes (date), activo` — unique(user_id,categoria,mes) |
| `metas_ahorro` | `id, user_id, nombre, monto_objetivo, monto_actual, completada` |
| `pagos_recurrentes` | `id, user_id, nombre, monto, dia_del_mes(1-28), cuenta_id, categoria, activo, ultima_aplicacion` |

### Trigger clave
```sql
-- Se ejecuta en INSERT/UPDATE/DELETE de transacciones
-- Recalcula cuentas.saldo = SUM(cantidad) WHERE cuenta_id = NEW.cuenta_id
actualizar_saldo_cuenta()
```

### RLS
Todas las tablas tienen `auth.uid() = user_id` como política universal.

---

## Funcionalidades por página

### Dashboard
- Patrimonio total + mini-chips por cuenta
- Selector de mes (← →)
- Stats: Ingresos / Gastos / Neto
- Tasa de ahorro (barra, meta 25%)
- **Donut chart**: gastos por categoría del mes (top 5 + "Otros")
- **Bar chart**: ingresos vs gastos últimos 6 meses

### Movimientos (TransaccionesPage)
- Tabs: Gasto / Ingreso / Transferencia
- Filtros: búsqueda texto + tipo + cuenta
- Edición inline (modal pre-llenado, trigger recalcula saldo)
- Eliminar con 2-tap + toast Deshacer (6 seg)
- Transferencia entre cuentas: 2 ajustes atómicos en una sola inserción
- Export CSV (UTF-8 BOM, solo filas filtradas)

### Cuentas
- Grid de cuentas con saldo en tiempo real
- Agregar cuenta: nombre, tipo, saldo inicial (crea transacción de ajuste), color
- **± Ajustar saldo**: crea transacción de ajuste positiva o negativa para corregir saldo incorrecto

### Presupuesto
- Selector de mes
- Cards con progress bar (verde/amarillo/rojo según % usado)
- Agregar categoría: upsert con `onConflict: 'user_id,categoria,mes'`
- Editar límite / Eliminar con 2-tap

### Pagos Fijos (PagosRecurrentesPage)
- Configurar una vez: nombre, monto, día del mes (1-28), cuenta, categoría
- **Auto-aplicación**: al abrir la app, `useAutoApplyPagos` detecta pagos vencidos del mes y crea los gastos automáticamente
- Badge "✓ aplicado" / "pendiente" por pago
- CRUD completo

### Metas de ahorro
- Nombre + monto objetivo + monto actual
- Cálculo de meses estimados para alcanzar la meta
- Completar / Eliminar

### Proyecciones
- Input: ahorro mensual estimado
- Gráfica de área (recharts) con proyección a 1, 3, 5 años
- Interés compuesto 5% anual
- Hitos de patrimonio marcados

### Perfil
- Avatar con inicial del email
- Nombre (de `profiles`) o email
- Links a Pagos Fijos, Metas, Proyecciones
- Sign out con 2-step confirmation

---

## Variables de entorno

```env
VITE_SUPABASE_URL=https://bduvzluntatmhfujqvvm.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key del proyecto>
```

**Supabase dashboard** → Authentication → URL Configuration:
- Site URL: `https://kash-app-rho.vercel.app`
- Redirect URLs: `https://kash-app-rho.vercel.app/**`

---

## Patrones de desarrollo

```ts
// Props: siempre { userId: string }, nunca { user: User }
// Excepción: DashboardPage, TransaccionesPage, CuentasPage aún usan user: User (legacy Fase 1)

// Dinero: siempre centavos en estado y DB
const centavos = toCentavos(parseFloat(input))  // → bigint
const display = formatQ(centavos)                // → "Q 150.00"

// Fechas: hoyGT() para fecha de hoy en Guatemala
// mesActual() para YYYY-MM del mes en curso

// Transferencias: inserción atómica de 2 filas
await supabase.from('transacciones').insert([debit, credit])
```

---

## Historial de fases

| Fase | Contenido |
|---|---|
| 0 | Migration map, scaffolding |
| 1 | Auth, Dashboard, Transacciones, Cuentas, Presupuesto |
| 2 | Proyecciones (recharts), Metas de ahorro |
| 3 | Edición de txns, filtros + CSV, transferencias entre cuentas |
| 4 | BudgetPage completo, PWA, PerfilPage |
| 4+ | Gráficas en Dashboard (donut + barras), Pagos Fijos recurrentes |
