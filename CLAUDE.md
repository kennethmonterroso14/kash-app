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
npm run test:sql                 # triggers y RPCs contra un PostgreSQL local (ver supabase/tests/)
```

`src/lib/supabase.ts` **throws at import time** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
are missing, so `npm run dev` needs `.env.local` (copy `.env.example`). `npm run build` and
`npm test` do not.

State of the checks on a clean tree: `build`, `test` (350 tests) and `lint` (0 problems) all pass.
`npm run test:sql` is separate — it needs a local PostgreSQL, so it is not part of `npm test`.
Keep it that way — a red check now means your change broke it.

## Architecture

SPA: React 19 + Vite + Tailwind + Supabase. The browser talks straight to Postgres through
`@supabase/supabase-js`, and RLS (`auth.uid() = user_id` on every table) is the only authorization
layer. Deployed on Vercel with SPA rewrites (`vercel.json`, which keeps `/api/*` and
`/.well-known/*` out of the fallback).

**There are two server-side pieces, both stateless Vercel functions under `api/`** (logic in
`api/_lib/`, tested with `npm test`), and **neither uses the service role**:

- **The MCP connector** (`api/mcp.ts`) lets a person's AI assistant read and write *their* data. It
  authenticates with Supabase Auth's OAuth 2.1 server (consent screen at `/oauth/consent`,
  `ConsentimientoPage`) and forwards the person's token to PostgREST, so RLS stays the boundary. Its
  tools reuse `finanzas.ts` and follow the ledger rules (no writes to `cuentas.saldo`, integer
  centavos, dates in the profile's zone). Setup and security: `docs/MCP.md`.
- **The Apple Pay shortcut** (`api/atajo.ts`) receives each Apple Pay payment from an iOS Shortcuts
  "Transacción" automation. It hashes the person's shortcut key and calls `registrar_pago_atajo` as
  `anon` — a `security definer` RPC whose only power is inserting one expense for the key's owner.
  Each such payment is also marked in `pagos_por_categorizar`, and the global
  `PagosPorCategorizar` notice in `Layout` asks the person to pick its category; that goes through
  `categorizar_pago()`, never a plain UPDATE — on a `gasto_tc` a plain UPDATE makes `trg_deuda_tc`
  re-apply the charge to the open cycle even after its cycle closed. See `docs/APPLE_PAY.md`.

Two constraints that break only in production: relative imports under `api/` carry an explicit
`.js` (Vercel runs it as unbundled Node ESM), and `api/` may import only dependency-free modules
from `src/` — never `lib/supabase.ts`, which reads `import.meta.env` at load. `tsconfig.api.json`
type-checks it in `tsc -b`.

**What an assistant may do is enforced by Postgres, not by the connector** (`schema.sql` §4b): a
token carrying the `client_id` claim (OAuth; the app's own session has none) reads and inserts
freely, but restrictive policies block UPDATE/DELETE on every table unless
`profiles.ia_puede_editar` is on (Ajustes → Asistentes de IA), never allow touching `profiles`
(the assistant would grant itself the permission), and `borrar_mi_cuenta()` refuses it outright.
A new table needs its `_ia_update` / `_ia_delete` pair — the loop in §4b lists them — and
`supabase/tests/acceso_ia.sql` is the one SQL test that runs under real RLS (`authenticated` role
plus JWT claims) to prove it.

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
   store and no react-query: each hook runs its own `useEffect` fetch. Writes update local state
   optimistically and only refetch when a trigger changed something server-side (`useTarjetas`
   calls `cargar()` after every write for exactly this reason).

   **`SesionProvider` (`src/context/`) owns the four session-wide slices** — profile, cuentas,
   categorías, tarjetas — and mounts their hooks **once**, with `cargando` and `error` *per slice*
   so a failing slice doesn't hide the others. Pages read `useSesion()` and never instantiate those
   hooks themselves. The month-scoped and page-specific tables keep their own hooks, instantiated
   by the page: `useTransacciones`, `usePresupuestos`, `useInversiones`, `useMetas`,
   `usePagosRecurrentes`, `useResumen6Meses`, and `useLimitesPresupuesto` — a **read-only** budget
   query for Resumen's rings. Don't swap it for `usePresupuestos`: that one copies the previous
   month's budgets into an empty month, so mounting it on Resumen would write on every month browsed.

   **A hook the provider mounts cannot call `useSesion()`** — it would consume the context that
   component provides. That is why `useTarjetas(userId, zonaHoraria)` takes the timezone as a
   parameter instead of using `useFechas()`, and it is the kind of thing someone "fixes" and breaks.

Pages are glue: `useSesion()` plus their own hooks for data, `finanzas.ts` for numbers, and the
sections and modals as components under `src/pages/<pagina>/`. No page is over 300 lines; the
add/edit form of a given entity is **one** component, not two copies.

**App shell** (`App.tsx`): `useAuth` → loading splash → `LoginPage` (Supabase email + password —
`signInWithPassword` / `signUp`, *not* a magic link — plus optional Google OAuth via
`signInWithOAuth`, whose button only renders when `/auth/v1/settings` reports the provider enabled;
setup in `docs/LOGIN_GOOGLE.md`) →
`SetupPage` if the user has no `profiles` row → `ConsentimientoPage` if the path is
`/oauth/consent` (an AI assistant asking to connect; `lib/volverTrasLogin.ts` brings the user back
there after a Google login, which returns to the origin) → `Layout` + `Routes`. `Layout` has **no header**:
a soft top scroll edge under the status bar, the global `AlertasBanner`, and a floating 5-item
bottom nav (Resumen · Movimientos · Tarjetas · Patrimonio · Plan) plus the `+` FAB. The nav icons
are drawn SVGs in `src/components/iconos.tsx`, not glyphs — no UI font carries them. Each screen
names itself with **`TituloGrande`** (34pt large title, optional subtitle, a trailing round action
from `CLASE_BOTON_TITULO`, and an iOS-style back link for second-level screens); it is the page's
only `<h1>`. Patrimonio (Cuentas · Inversiones) and Plan (Presupuesto · Metas · Proyecciones) are
a large title plus a glass segmented control via `SeccionConPestanas titulo=…`. There is no
`PerfilPage`: configuration (Pagos Fijos, Categorías, Metas edit, profile) lives behind the gear in
Resumen's title, at `/ajustes` (`AjustesPage`).

## Data model rules

**Money is always integer centavos**, `bigint` in Postgres, `number` in TS. `formatMoneda` throws on
a non-integer input and `toCentavos` throws on NaN or a negative — these are deliberate guard rails,
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
  formatting with a guessed currency. **There is no `formatQ` any more** — it was retired once the
  last call site migrated, so nothing can hardcode quetzales by accident. `calcDisponibleReal`
  takes the money options too, because one of its three warnings quotes an amount.
- `hoyEn(zona)` / `mesActualEn(zona)` / `ahoraEn(zona)` in `constants.ts`, with `useFechas()`
  currying them. **An invalid timezone throws** — a silent fallback would write wrong dates — so
  the provider validates with `zonaValida()` and flags `error.perfil` instead of guessing.
  **The `hoyGT()` / `mesActual()` / `ahoraGT()` aliases were retired too.** Use `useFechas()`
  instead of `new Date()` for anything stored.

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

**Recurring payments**: `useAutoApplyPagos` runs once per session per user, keyed by a `useRef` on
the user id. It is mounted by `<AutoAplicarPagos>` **inside** the provider, not from `App.tsx`,
because the user's timezone decides which month is current — and therefore which due date counts as
overdue. It applies **at most one period per pago per run**, dated at the due date
(not today), with idempotency evaluated **by month** so editing `dia_del_mes` cannot re-apply a
month already applied. The advance of `ultima_aplicacion` is a compare-and-swap done *before* the
insert: on any failure it prefers not applying (recoverable by hand) over duplicating (which
desyncs the balance and has to be hunted row by row).

Recovering *missed* months is deliberately NOT automatic — see `docs/RESTRUCTURE.md`. An earlier
version back-filled up to 12 months of backdated expenses on app open, which was worse than the bug
it fixed.

## Database

`supabase/schema.sql` is the **single authoritative source**: all 14 tables, enums, indexes, RLS
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
  source: `tailwind.config.js` imports it). Colors: `bg`, `surface`, `surface2`, `accent`,
  `accentAlt`, `success`, `danger`, `warning`, `text`, `textDim`. Also `rounded-{chip,control,panel,tarjeta,hoja}`,
  `tracking-{display,titulo,base,micro}`, `duration-{presion,rapida,normal,lenta}`,
  `ease-{salida,entrada,estandar}`, `border-{canto,perimetro}`, `shadow-{chip,panel,chrome,hoja}`.
  No raw hex in `className`. Raw hex is fine for chart/category colors that come from data.
  There is deliberately **no `muted` color**: it was a #3a3f4d grey used as text at ~1.5:1
  contrast on 238 sites. Dim text is `textDim`; hairlines are `border-perimetro`.
- **Two themes, following the system** (`prefers-color-scheme`; dark is the default). `tokens.js`
  exports `temas.{oscuro,claro}`, each a full palette — not an inversion — plus materials, glass
  borders, shadows and the background glow intensities. A plugin in `tailwind.config.js` dumps each
  theme to CSS variables (`--c-*` as RGB channels so `bg-accent/15` still works, `--m-*`, `--b-*`,
  `--s-*`, `--brillo-*`) and every class points at the variables, so components never branch on
  the theme. Anything that needs a **real** color in a prop (Recharts) calls `useColores()`, which
  returns the active palette and re-renders when the system theme changes — never import
  `temas`/`colores` for that, it would freeze the dark palette.
- **The accent is the user's choice** (Ajustes → Color de acento): eight `acentos` in `tokens.js`,
  each with a dark and a light value that pass AA against that theme's `bg` (`acentos.test.ts`
  checks it, and that `profiles.acento`'s DB check lists the same ids). The plugin turns
  `data-acento` on `<html>` into `--c-accent` / `--c-accentAlt`, so every `accent` class follows
  it for free. `lib/acento.ts` owns the attribute: `iniciarAcento()` applies this device's last
  choice before the first render (localStorage), the provider applies `profiles.acento` when the
  profile loads, and `useColores()` includes it. The column is optional — without its migration
  the provider re-reads the profile without it and the accent is per-device only.
- **The background is a glow layer** (`body::before` in `index.css`: accent + `brillo2` radial
  gradients) so the glass has something to refract. **Never put `bg-bg` on a page or root
  container** — it paints over that layer and every card reads as flat grey. Content cards are
  `vidrio-panel`; controls, tracks and secondary buttons inside glass use `bg-vidrio-relleno`
  (iOS's tertiary fill, translucent) rather than an opaque `bg-bg`/`bg-surface2`.
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
- **One typeface: the system's, i.e. SF Pro on Apple devices** (`font-sans`, `font-display` and a
  nearly-unused `font-mono` all map through `fuentes` in `src/lib/tokens.js`, starting with
  `-apple-system`). Nothing is downloaded or precached — there are no `@font-face` blocks and no
  third-party font request (the privacy policy forbids one). Other platforms fall back to their own
  UI font (Segoe UI, Roboto). `font-display` still exists as a token so a separate title face is a
  one-line change. **Amounts use `tabular-nums`, not `font-mono`** — SF Pro has `tnum`, so columns
  of figures line up. Icons are SVGs in `src/components/iconos.tsx`, not glyphs; `font-mono`
  survives only for the ErrorBoundary's technical dump.
- **The PWA updates itself, but never with a sheet open.** `registerType: 'prompt'` +
  `injectRegister: false` in `vite.config.ts`; `src/registrarSW.ts` registers through
  `virtual:pwa-register`, re-checks for a new `sw.js` on `visibilitychange` (iOS resumes a
  home-screen PWA from memory without navigating, so nothing else would check) and applies it via
  `crearAplicador` in `lib/actualizacion.ts`, which waits while any `[role="dialog"]` is open —
  a reload would drop what the user is typing. Do **not** switch back to `autoUpdate` or the bare
  injected `registerSW.js`: that is how a deployed fix never reached an installed phone.
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
