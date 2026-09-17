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

State of the checks on a clean tree: `build`, `test` (84 tests) and `lint` (0 problems) all pass.
Keep it that way — a red check now means your change broke it.

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
   `proyectarPatrimonio`, …), and it is the most heavily tested file (`finanzas.test.ts`). New
   calculations belong here with tests, not inline in a component. The other suites are
   `constants.test.ts` (dates per timezone), `SesionProvider.test.tsx` and the hook tests under
   `src/hooks/`; `src/test/sesionFalsa.ts` + `ConSesion.tsx` build a read-only fake session for
   testing hooks that only consume the context.
3. **One hook per table in `src/hooks/`** wraps the queries and holds the state. There is no global
   store, no react-query: each hook runs its own `useEffect` fetch and each page instantiates the
   hooks it needs, so the same rows are refetched per page mount. Writes update local state
   optimistically and only refetch when a trigger changed something server-side (`useTarjetas`
   calls `cargar()` after every write for exactly this reason).

Pages are glue: local `useState` for modals/forms, hooks for data, `finanzas.ts` for numbers.

**App shell** (`App.tsx`): `useAuth` → loading splash → `LoginPage` (Supabase email + password —
`signInWithPassword` / `signUp`, *not* a magic link) →
`SetupPage` if the user has no `profiles` row → `Layout` + `Routes`. `Layout` is the header +
global `AlertasBanner` + 5-item bottom nav (Dashboard · Movimientos · Cuentas · Presupuesto ·
Perfil); everything else (Inversiones, Tarjetas, Pagos Fijos, Categorías, Metas, Proyecciones) is
reached from `PerfilPage`.

## Data model rules

**Money is always integer centavos**, `bigint` in Postgres, `number` in TS. `formatQ` throws on a
non-integer input and `toCentavos` throws on NaN or a negative — these are deliberate guard rails,
so the *caller* applies the sign (`cantidad: -Math.abs(monto)` for a gasto) and **validates user
input before calling them**. Never call either with an unvalidated `parseFloat` during render: they
throw, and that unmounts the tree (there is an `ErrorBoundary` in `main.tsx`, but it is a last
resort, not the plan). Never introduce floats or store quetzales.

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
`cantidad != 0` is enforced by the DB.

What counts as spending lives in **one place**: `esGastoComputable(tipo)` in `finanzas.ts`. It
includes `gasto_tc` (a card purchase is a purchase) and excludes `pago_tc` (that moves debt;
counting it would double the expense). A new spend-like `tipo` is one edit there, not three — that
duplication is exactly why Dashboard and Presupuestos used to report different totals for the same
month.

**Editing a `gasto_tc` or `pago_tc` row is disabled in the UI on purpose.** `actualizar_deuda_tc`'s
UPDATE branch cannot reverse a payment's bucket split reliably, so card movements are corrected by
deleting and re-entering from TarjetasPage.

**Each TC row stores its own debt split** (`aplicado_ciclo_anterior` / `aplicado_actual`): the
INSERT splits a payment across the two buckets with clamping, and without persisting that split a
DELETE or UPDATE cannot reverse it. The trigger is BEFORE precisely so it can write those columns.

**Money rendering and dates are parametrized by the user's profile**, which carries `moneda`,
`locale` and `zona_horaria` (all `not null` with GTQ / es-GT / America/Guatemala defaults):

- `formatMoneda(centavos, { moneda, locale })` in `finanzas.ts` is **pure and does not read the
  context** — that is deliberate, it is what keeps it testable. `useMoneda()` currys it with the
  profile (`fmt(x)`, or `fmt(x, 'USD')` for an amount stored in another currency, which is what
  the USD `inversiones` rows are). It returns `'—'` when the profile failed to load rather than
  formatting with a guessed currency. `formatQ` is the GTQ/es-GT alias, kept only until the last
  call site migrates.
- `hoyEn(zona)` / `mesActualEn(zona)` / `ahoraEn(zona)` in `constants.ts`, with `useFechas()`
  currying them. **An invalid timezone throws** — a silent fallback would write wrong dates — so
  the provider validates with `zonaValida()` and flags `error.perfil` instead of guessing.
  `hoyGT()` / `mesActual()` / `ahoraGT()` are the Guatemala aliases, same deal as `formatQ`.
  Use these instead of `new Date()` for anything stored.

Month selectors pass `mes` as `'YYYY-MM'` and hooks derive the window themselves — note
`presupuestos.mes` is a `date` column holding the first of the month (`'YYYY-MM-01'`) with a
`unique(user_id, categoria, mes)` constraint, which budget writes rely on. The month window comes
out of the timezone, so changing a user's zone moves which transactions land in which month.

**Categories** come from two places merged in `useCategorias`: the hardcoded `CATEGORIAS_GASTO` /
`CATEGORIAS_INGRESO` / `CAT_COLORS` in `constants.ts` plus per-user rows in `categorias_usuario`.
Read `categoriasGasto` / `categoriasIngreso` / `coloresCategorias` from the hook — importing the
constants directly in a page silently drops the user's own categories.

**USD**: `inversiones` rows carry `moneda: 'GTQ' | 'USD'` and are stored in centavos of their own
currency. `profiles.tipo_cambio_usd` is *centavos GTQ per 1 USD* (`775` = Q7.75). Convert with
`usdToGTQ(...)` before summing anything across currencies.

**Recurring payments**: `useAutoApplyPagos` runs once per session per user from `App.tsx`, keyed by
a `useRef` on the user id. It applies **at most one period per pago per run**, dated at the due date
(not today), with idempotency evaluated **by month** so editing `dia_del_mes` cannot re-apply a
month already applied. The advance of `ultima_aplicacion` is a compare-and-swap done *before* the
insert: on any failure it prefers not applying (recoverable by hand) over duplicating (which
desyncs the balance and has to be hunted row by row).

Recovering *missed* months is deliberately NOT automatic — see `docs/RESTRUCTURE.md`. An earlier
version back-filled up to 12 months of backdated expenses on app open, which was worse than the bug
it fixed.

## Database

`supabase/schema.sql` is the **single authoritative source**: all 11 tables, enums, indexes, RLS
policies, triggers and RPCs. It runs from scratch on an empty project and is idempotent over a
deployed one. Its shape was verified against production by introspecting `information_schema`
(columns, types, nullability, defaults and constraints), so trust it over the SQL blocks inside
`docs/superpowers/plans/*.md` — those are a historical record, they are **superseded**, and several
of them do not even run as written (`create policy if not exists` is not valid PostgreSQL).

`supabase/migrations/` holds corrective SQL for an already-deployed database, each statement
commented with the defect it fixes.

There is no migration tool and no generated types: SQL is run by hand in Supabase → SQL Editor.
**If text is selected in that editor it runs only the selection** — that is how a migration silently
ends up half-applied. After any DDL change, check Supabase's advisors (security + performance).

When you add a table, follow the established additive style: `create table if not exists`, enum
creation wrapped in `do $$ … exception when duplicate_object then null; end $$;`, `enable row level
security`, a `for all using (auth.uid() = user_id)` policy, and `set search_path = public, pg_temp`
on any function. Guard the client against an unapplied migration the way `useInversiones` does
(non-fatal query, `does not exist` → "¿Ejecutaste la migración?").

`docs/superpowers/` is also where the workflow lives: a design spec in `specs/`, then a checkbox
task-by-task plan in `plans/`, committed before the code (`docs: add implementation plan …`), one
commit per task.

## Conventions

- **UI strings, identifiers, DB columns and most comments are Spanish**; keep new code consistent
  rather than mixing in English column names.
- **Tailwind semantic tokens only** — every token comes from `src/lib/tokens.js` (the single
  source: `tailwind.config.js` imports it, and so do the Recharts props that need real colors).
  Colors: `bg`, `surface`, `surface2`, `accent`, `accentAlt`, `success`, `danger`, `warning`,
  `text`, `textDim`. Also `rounded-{chip,control,panel,tarjeta,hoja}`,
  `tracking-{display,titulo,base,micro}`, `duration-{presion,rapida,normal,lenta}`,
  `ease-{salida,entrada,estandar}`, `border-{canto,perimetro}`, `shadow-{chip,panel,chrome,hoja}`.
  No raw hex in `className`. Raw hex is fine for chart/category colors that come from data.
  There is deliberately **no `muted` color**: it was a #3a3f4d grey used as text at ~1.5:1
  contrast on 238 sites. Dim text is `textDim`; hairlines are `border-perimetro`.
- **The design language is Apple's**, and the rules live in the repo: `.claude/skills/apple-design`
  (materials, motion, typography) and `.claude/skills/mobile-native` (the platform layer, which
  matters twice over because this ships inside a Capacitor WebView). They are vendored upstream —
  read them before changing a token or adding an animation, and don't edit them.
- **Translucency only through the `.vidrio-*` classes** in `src/index.css` (`chip` < `panel` <
  `chrome` < `hoja`, lightest to heaviest). Never stack a light material on another light one.
  The chrome in `Layout` is a floating glass layer with the page scrolling *under* it — if the
  scroll container moves back into `<main>`, the blur has nothing behind it and reads as flat
  color. `prefers-reduced-transparency`, `prefers-contrast` and `prefers-reduced-motion` each have
  a fallback at the bottom of `index.css`; a new material has to be added to those three lists.
- **Press feedback is on `:active`, never on `click`.** `index.css` dims every
  `button`/`a`/`[role=button]` on press globally (it replaces the tap highlight that was removed);
  add `.presionable` for the scale on top, for large targets. The global
  `-webkit-tap-highlight-color: transparent` means a control with neither gives no feedback at all.
- **Body text uses the system font** (`font-sans` → SF Pro inside the iOS WebView). `font-display`
  (Outfit, the only webfont left) is the wordmark only.
- **Destructive actions are 2-tap**, not `window.confirm`: a `pendingDelete` state holds the row id
  and the button relabels to "Confirmar". Transaction deletes additionally show an undo toast backed
  by `restoreTxn`.
- Pages take no data props: they read `useSesion()`. The exception is `SetupPage`, which takes
  `user` because it runs *before* the provider mounts (it is what decides whether to mount it).
- Modals are inline JSX driven by local state; there is no modal/dialog abstraction.

## Error handling

**A failed query is never rendered as an empty state.** "No data" and "could not load" are different
claims, and presenting Q0.00 as a fact when the fetch failed was a whole class of bug here — it also
fed phantom zeros into `calcDisponibleReal` / `calcPatrimonioNeto`, fabricating insolvency warnings.
`useCuentas`, `useTransacciones`, `useResumen6Meses`, `usePagosRecurrentes` and `useInversiones`
expose `error`; a page that reads their data should read that too and suppress derived figures while
it is set.

Writes surface their failure to the user, in Spanish, rather than logging to a console nobody reads.
Anything the user can trigger must not show a raw Postgres string. Await a write before promising
its result — the debt trigger can legitimately reject a delete.

## Restructure backlog

`docs/RESTRUCTURE.md` is the inventory of what is missing or structurally wrong, and why each item
was left out. It is **not** a bug list: those were fixed. Read it before proposing a redesign —
several obvious-looking ideas (deriving TC debt from the ledger, auto-recovering missed recurring
payments) are blocked or were already tried and reverted for a reason recorded there.
