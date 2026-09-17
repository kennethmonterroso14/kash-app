# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                      # .npmrc sets legacy-peer-deps=true — needed for React 19 peers
npm run dev                      # Vite dev server
npm run build                    # tsc -b && vite build  (type-checks the whole project)
npm test                         # vitest run
npm run lint                     # eslint .
npx vitest run src/lib/finanzas.test.ts        # single file
npx vitest run -t "calcFechasCiclo"            # single describe/it by name
npx tsc -b                       # type-check only, no bundle
```

`src/lib/supabase.ts` **throws at import time** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
are missing, so `npm run dev` needs `.env.local` (copy `.env.example`). `npm run build` and
`npm test` do not.

State of the checks on a clean tree: `build` passes, `test` passes (29 tests), **`lint` reports 8
pre-existing errors** — `react-hooks` v7 (React 19 compiler rules) flagging `setState` inside
effects in `App.tsx`, `useTransacciones.ts`, `BudgetPage.tsx` and components created during render
in `DashboardPage.tsx`. Don't treat a red `lint` as something your change broke; check whether your
files are among those before chasing it.

## Architecture

Client-only SPA: React 19 + Vite + Tailwind + Supabase. No backend of our own — the browser talks
straight to Postgres through `@supabase/supabase-js`, and RLS (`auth.uid() = user_id` on every
table) is the only authorization layer. Deployed on Vercel with SPA rewrites (`vercel.json`).

**Three layers, in order of authority:**

1. **Postgres owns derived state.** `cuentas.saldo` is maintained by the `trigger_saldo_transaccion`
   trigger (applies `+NEW.cantidad` / `-OLD.cantidad` deltas — it does *not* recompute a `SUM`).
   `tarjetas_credito.deuda_actual` and `deuda_ciclo_anterior` are maintained by `trg_deuda_tc`, and
   the `cerrar_ciclo_tc(p_tarjeta_id)` RPC rolls open-cycle debt into `deuda_ciclo_anterior`.
   **Never write these columns from the client** — insert a `transacciones` row and let the trigger
   settle the balance, then refetch.
2. **`src/lib/finanzas.ts` owns the math.** Every money calculation is a pure function here
   (`calcEstadisticasMes`, `calcEstadoPresupuesto`, `calcResumenTC`, `calcDisponibleReal`,
   `calcPatrimonioNeto`, `calcResumenPortafolio`, `calcFechasCiclo`, `calcAlertasTC`,
   `proyectarPatrimonio`, …). This is the only tested file in the repo (`finanzas.test.ts`). New
   calculations belong here with tests, not inline in a component.
3. **One hook per table in `src/hooks/`** wraps the queries and holds the state. There is no global
   store, no react-query: each hook runs its own `useEffect` fetch and each page instantiates the
   hooks it needs, so the same rows are refetched per page mount. Writes update local state
   optimistically and only refetch when a trigger changed something server-side (`useTarjetas`
   calls `cargar()` after every write for exactly this reason).

Pages are glue: local `useState` for modals/forms, hooks for data, `finanzas.ts` for numbers.

**App shell** (`App.tsx`): `useAuth` → loading splash → `LoginPage` (Supabase magic link) →
`SetupPage` if the user has zero `cuentas` rows → `Layout` + `Routes`. `Layout` is the header +
global `AlertasBanner` + 5-item bottom nav (Dashboard · Movimientos · Cuentas · Presupuesto ·
Perfil); everything else (Inversiones, Tarjetas, Pagos Fijos, Categorías, Metas, Proyecciones) is
reached from `PerfilPage`.

## Data model rules

**Money is always integer centavos**, `bigint` in Postgres, `number` in TS. `formatQ` throws on a
non-integer input and `toCentavos` throws on a negative — these are deliberate guard rails, so the
*caller* applies the sign (`cantidad: -Math.abs(monto)` for a gasto). Never introduce floats or
store quetzales.

**`transacciones` is the universal ledger.** Everything is a row here:

| `tipo` | `cantidad` | notes |
|---|---|---|
| `ingreso` | positive (DB constraint) | |
| `gasto` | negative (DB constraint) | |
| `ajuste` | either | opening balances, manual corrections, and both legs of a transfer |
| `gasto_tc` | negative | `cuenta_id` is NULL, `tarjeta_id` + `ciclo_id` set — hits card debt, not a bank account |
| `pago_tc` | negative | debits `cuenta_id` *and* reduces card debt via the trigger |

Consequences: a transfer is two rows inserted in one call (`categoria: 'Transferencia'`,
`tipo: 'ajuste'`, `-cantidad` / `+cantidad`); "adjust balance" on a cuenta is an `ajuste` row;
`calcEstadisticasMes` counts `gasto` **and** `gasto_tc` as spending, so any new spend-like `tipo`
must be added there too. `cantidad != 0` is enforced by the DB.

**Dates**: `hoyGT()` (`src/lib/constants.ts`) returns today as `YYYY-MM-DD` in `America/Guatemala`
via `toLocaleDateString('en-CA', …)`; use it instead of `new Date()` for anything stored. Month
selectors pass `mes` as `'YYYY-MM'` and hooks derive the window themselves — note
`presupuestos.mes` is a `date` column holding the first of the month (`'YYYY-MM-01'`) with a
`unique(user_id, categoria, mes)` constraint, which budget writes rely on.

**Categories** come from two places merged in `useCategorias`: the hardcoded `CATEGORIAS_GASTO` /
`CATEGORIAS_INGRESO` / `CAT_COLORS` in `constants.ts` plus per-user rows in `categorias_usuario`.
Read `categoriasGasto` / `categoriasIngreso` / `coloresCategorias` from the hook — importing the
constants directly in a page silently drops the user's own categories.

**USD**: `inversiones` rows carry `moneda: 'GTQ' | 'USD'` and are stored in centavos of their own
currency. `profiles.tipo_cambio_usd` is *centavos GTQ per 1 USD* (`775` = Q7.75). Convert with
`usdToGTQ(...)` before summing anything across currencies.

**Recurring payments**: `useAutoApplyPagos` runs once per session from `App.tsx`, guarded by a
`useRef` (StrictMode double-invokes effects). Idempotency is `ultima_aplicacion < first-of-month`,
so it is safe on reload but not transactional — a failed insert leaves nothing applied.

## Schema lives in two places

`supabase/schema.sql` **only covers the original tables**: `profiles`, `cuentas`, `transacciones`,
`presupuestos`, `metas_ahorro`. Everything added later — `pagos_recurrentes`, `categorias_usuario`,
`tarjetas_credito`, `ciclos_tc`, `inversiones`, `inversiones_historial`, the `tarjeta_id`/`ciclo_id`
columns on `transacciones`, the `gasto_tc`/`pago_tc` enum values, `trg_deuda_tc`,
`cerrar_ciclo_tc` — exists **only as SQL blocks inside `docs/superpowers/plans/*.md`**, applied by
hand in the Supabase SQL editor. There is no migration tool and no generated types.

So: to know a table's real shape, grep the plan docs (`docs/superpowers/plans/`), not just
`schema.sql`. Note `categorias_usuario` has no DDL committed anywhere — infer its columns from
`useCategorias.ts`. When you add a table, follow the established additive style: `create table if
not exists`, enum creation wrapped in `do $$ … exception when duplicate_object then null; end $$;`,
`enable row level security`, and a `for all using (auth.uid() = user_id)` policy. Guard the client
against an unapplied migration the way `useInversiones` does (non-fatal query, `does not exist`
→ "¿Ejecutaste la migración?").

`docs/superpowers/` is also where the workflow lives: a design spec in `specs/`, then a checkbox
task-by-task plan in `plans/`, committed before the code (`docs: add implementation plan …`), one
commit per task.

## Conventions

- **UI strings, identifiers, DB columns and most comments are Spanish**; keep new code consistent
  rather than mixing in English column names.
- **Tailwind semantic tokens only** — `bg`, `surface`, `surface2`, `accent`, `accentAlt`, `success`,
  `danger`, `warning`, `text`, `textDim`, `muted` from `tailwind.config.js`. No raw hex in
  `className`. Raw hex is fine for chart/category colors that come from data.
- **Destructive actions are 2-tap**, not `window.confirm`: a `pendingDelete` state holds the row id
  and the button relabels to "Confirmar". Transaction deletes additionally show an undo toast backed
  by `restoreTxn`.
- New pages take `{ userId: string }`. `DashboardPage`, `TransaccionesPage`, `CuentasPage` and
  `PerfilPage` still take a `user` object — legacy, don't copy it.
- Modals are inline JSX driven by local state; there is no modal/dialog abstraction.

## Known drift — verify before trusting

- **`README.md` is stale.** It documents the app as "Kash" with an older lime/orange palette and
  claims the saldo trigger recomputes `SUM(cantidad)`. The app is branded **Vorta** (`index.html`,
  `Layout`, PWA manifest, `package.json` name), the palette is the purple/indigo one in
  `tailwind.config.js`, and the trigger is delta-based. It also predates Tarjetas, Inversiones,
  Ciclos and Categorías. Trust the code.
- **`profiles` is keyed inconsistently.** `schema.sql` gives it its own `id` PK plus a `user_id` FK
  to `auth.users`. `SetupPage` upserts on `user_id` and `useInversiones` filters on `user_id`, but
  `PerfilPage` filters on `.eq('id', user.id)` — one of the two cannot match the live table. Check
  the actual table before adding a third `profiles` query.
- **Setup gating and setup writing disagree.** `App.tsx` decides onboarding is done by counting
  `cuentas` rows, while `SetupPage` only writes a `profiles` row, so a user who never adds a cuenta
  sees `SetupPage` again on every reload.
