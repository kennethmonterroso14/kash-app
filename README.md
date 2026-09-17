# Vorta — Finanzas Personales

App de control de finanzas personales orientada al mercado guatemalteco. Migrada de Google Sheets +
Apps Script a React + TypeScript + Supabase.

**Producción**: https://kash-app-rho.vercel.app

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Estilos | Tailwind CSS v3 (dark theme) |
| Backend / DB | Supabase (PostgreSQL 17 + Auth + RLS) |
| Gráficas | Recharts 3 |
| Tests | Vitest + jsdom |
| Deploy | Vercel (SPA routing via `vercel.json`) |
| PWA | vite-plugin-pwa (installable en móvil) |

No hay backend propio: el navegador habla directo con Postgres y **RLS es la única capa de
autorización**.

---

## Comandos

```bash
npm install          # .npmrc fija legacy-peer-deps (peers de React 19)
npm run dev          # servidor de desarrollo — requiere .env.local
npm run build        # tsc -b && vite build
npm test             # vitest run
npm run lint         # eslint .
```

`src/lib/supabase.ts` lanza al importarse si faltan `VITE_SUPABASE_URL` o
`VITE_SUPABASE_ANON_KEY`, así que `npm run dev` necesita `.env.local` (copiar de `.env.example`).
`build` y `test` no.

---

## Tokens de diseño

Definidos en `tailwind.config.js`. **Usar los tokens, nunca hex en `className`** (el hex sí va para
colores que vienen de datos, como las categorías).

```
bg:        #0a0c10   surface:   #12151c   surface2:  #1a1e28
accent:    #7c6af7   accentAlt: #a78bfa
success:   #4ade80   danger:    #f87171   warning:   #fbbf24
text:      #e8eaf0   textDim:   #8b90a0   muted:     #3d4255
```

---

## Reglas críticas de datos

- **Dinero siempre en centavos enteros** (`bigint` en Postgres). Nunca floats, nunca quetzales.
  - `formatQ(centavos)` → `"Q1,500.00"` — **lanza** si recibe un no-entero
  - `toCentavos(quetzales)` → `150000` — **lanza** si recibe NaN o negativo

  Las dos lanzan a propósito: son guardarraíles. El signo lo aplica quien llama
  (`cantidad: -Math.abs(monto)` para un gasto), y **el input del usuario se valida antes**, no
  después de que la excepción desmonte la pantalla.

- **Timezone Guatemala** (`America/Guatemala`, UTC-6, sin DST). `hoyGT()` para la fecha de hoy,
  `mesActual()` para `YYYY-MM`, `ahoraGT()` cuando se necesita un `Date`. Nunca `new Date()` para
  algo que se guarda o se compara.

- **`transacciones` es el ledger universal.** Todo es una fila acá:

  | `tipo` | `cantidad` | notas |
  |---|---|---|
  | `ingreso` | positivo (constraint) | |
  | `gasto` | negativo (constraint) | |
  | `ajuste` | cualquiera | saldo inicial, correcciones, y las dos patas de una transferencia |
  | `gasto_tc` | negativo | `cuenta_id` NULL; afecta la deuda de la tarjeta, no una cuenta |
  | `pago_tc` | negativo | debita la cuenta **y** baja la deuda de la tarjeta |

  Qué cuenta como gasto se decide en **un solo lugar**: `esGastoComputable()` en `finanzas.ts`
  (incluye `gasto_tc`; excluye `pago_tc`, que mueve deuda y contarlo duplicaría el gasto).

- **Postgres es dueño del estado derivado. Nunca escribirlo desde el cliente.**
  - `cuentas.saldo` ← trigger `trigger_saldo_transaccion` (aplica deltas, no recalcula un SUM)
  - `tarjetas_credito.deuda_actual` / `deuda_ciclo_anterior` ← trigger `trg_deuda_tc` (BEFORE) y el
    RPC `cerrar_ciclo_tc`
  - Para mover un saldo se inserta una fila en `transacciones` y se refresca.

- **Reparto de deuda de TC.** Cada movimiento de tarjeta guarda en su propia fila cuánto aplicó a
  cada bucket (`aplicado_ciclo_anterior` / `aplicado_actual`), porque el INSERT reparte un pago
  entre los dos con clamp y sin eso un DELETE o UPDATE no puede revertirlo.

---

## Estructura

```
src/
├── lib/
│   ├── supabase.ts     Cliente (valida env vars al init)
│   ├── finanzas.ts     Funciones PURAS de dinero — la única fuente de la matemática
│   ├── finanzas.test.ts  48 tests (el único archivo con cobertura)
│   └── constants.ts    Categorías base, colores, hoyGT/mesActual/ahoraGT
├── hooks/              Un hook por tabla; cada uno con su propio fetch y estado
├── pages/              Glue: useState local para modales, hooks para datos
└── components/         Layout, AlertasBanner, ErrorBoundary
```

**Tres capas, en orden de autoridad:** Postgres (estado derivado) → `finanzas.ts` (la matemática,
pura y testeada) → hooks (queries y estado). Las páginas son pegamento.

No hay store global ni react-query: cada hook corre su propio `useEffect` y cada página instancia
los que necesita, así que las mismas filas se vuelven a pedir por página.

---

## Navegación

**Bottom nav**: Dashboard · Movimientos · Cuentas · Presupuesto · Perfil

**Desde Perfil**: Inversiones · Tarjetas de Crédito · Pagos Fijos · Categorías · Metas ·
Proyecciones

---

## Base de datos

`supabase/schema.sql` es la **fuente única y autoritativa**: 11 tablas, enums, índices, policies,
triggers y RPCs. Corre de cero en un proyecto vacío y es idempotente sobre uno ya desplegado.

`supabase/migrations/` tiene el SQL correctivo para bases ya desplegadas, con cada statement
comentado con el defecto que arregla.

No hay herramienta de migraciones: el SQL se corre a mano en Supabase → SQL Editor. **Ojo: si hay
texto seleccionado en el editor, corre solo la selección** — es la forma más fácil de dejar una
migración a medias.

### Tablas

| Tabla | Descripción |
|---|---|
| `profiles` | `id` PK propia + `user_id` único → `auth.users`. **La relación con el usuario es `user_id`** |
| `cuentas` | Saldo mantenido por trigger |
| `transacciones` | El ledger universal (ver arriba) |
| `presupuestos` | `unique(user_id, categoria, mes)`; `mes` es el día 1 |
| `metas_ahorro` | Metas de ahorro |
| `tarjetas_credito` | Deuda en dos buckets, mantenidos por trigger + RPC |
| `ciclos_tc` | Estados de cuenta. Invariante: **un solo ciclo `abierto` por tarjeta** |
| `pagos_recurrentes` | Pagos fijos mensuales (`dia_del_mes` 1-28) |
| `categorias_usuario` | Categorías propias; `unique(user_id, nombre)` |
| `inversiones` | Capital y valor actual, en GTQ o USD |
| `inversiones_historial` | Un punto de valor por fecha; alimenta la gráfica |

Todas con RLS `auth.uid() = user_id`.

### Variables de entorno

```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

**Supabase → Authentication → URL Configuration**: Site URL y Redirect URLs apuntando al dominio de
producción (`/**`).

---

## Convenciones

- **UI, identificadores y columnas en español.** Los comentarios siguen el archivo.
- **Acciones destructivas de 2 taps**, no `window.confirm`: un `pendingDelete` guarda el id y el
  botón cambia a "Confirmar". El borrado de transacciones además ofrece deshacer.
- **Un error de consulta nunca se renderiza como estado vacío.** "Sin datos" y "no se pudo cargar"
  son distintos: los hooks exponen `error` y las páginas lo muestran en lugar de presentar Q0.00
  como un hecho.
- Páginas nuevas reciben `{ userId: string }`. `DashboardPage`, `TransaccionesPage`, `CuentasPage`
  y `PerfilPage` todavía reciben el objeto `user` completo — legado, no copiarlo.
- Modales: JSX inline con estado local. No hay abstracción de diálogo.
- Cálculos nuevos van en `finanzas.ts` como funciones puras **con test**, no inline en un componente.

---

## Estado conocido

Lo que falta está en [`docs/RESTRUCTURE.md`](docs/RESTRUCTURE.md): funciones faltantes,
inconsistencias estructurales y deuda técnica, con el detalle de por qué cada cosa quedó afuera.
