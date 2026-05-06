# Budget Improvements & Dashboard Privacy — Design Spec

**Date:** 2026-05-06  
**Scope:** Three improvements to BudgetPage and DashboardPage  
**Status:** Approved

---

## Overview

Three independent improvements to the personal finance app Vorta:

1. **Budget carry-over** — Automatically copy last month's budget limits to a new month, with an undo banner
2. **Budget detail inline** — Tap a budget card to expand a list of transactions for that category
3. **Hide patrimonio** — Tap the "Patrimonio total" widget title to toggle number visibility

All changes are **frontend-only** (no DB schema changes, no new tables, no new hooks). All money values remain in centavos (bigint integers).

---

## Feature 1: Budget Carry-Over (Auto-copy + Undo Banner)

### Behavior

When `BudgetPage` loads a month with **zero presupuestos**, it automatically queries the previous month. If the previous month has presupuesto rows, it batch-inserts them into the current month and shows a dismissable banner.

### Rules

- Trigger: `presupuestos.length === 0 && !loading && !intentoCopia`
- `intentoCopia` resets when the user navigates to a different month (via `useEffect` cleanup or dependency on `mes`)
- If the previous month also has 0 budgets (e.g. first-time user), do nothing — show empty state normally
- If the user taps **↩ Deshacer**: delete the auto-inserted rows, set `intentoCopia = true` so no re-copy happens in this session for this month, show empty state

### State additions to `BudgetPage`

```typescript
const [intentoCopia, setIntentoCopia] = useState(false)
const [bannerCopia, setBannerCopia] = useState<{ n: number; ids: string[] } | null>(null)
```

`intentoCopia` is reset in the `useEffect` that depends on `mes` (the month selector), so navigating away and back to the same month within the session does not re-trigger the copy.

### Auto-copy logic

```
1. Query presupuestos WHERE mes = mesPrevInicio AND user_id = userId AND activo = true
2. If results.length === 0 → return (nothing to copy)
3. Batch-insert: same categoria + monto_limite, new mes = mesInicio, activo = true
4. Get inserted row IDs from .select()
5. setPresupuestos(insertedRows)
6. setBannerCopia({ n: insertedRows.length, ids: insertedRows.map(r => r.id) })
7. setIntentoCopia(true)
8. Auto-dismiss banner after 4 seconds (setTimeout → setBannerCopia(null))
```

### Undo logic

```
1. supabase.from('presupuestos').delete().in('id', bannerCopia.ids)
2. setPresupuestos([])
3. setBannerCopia(null)
```
(No need to set `intentoCopia = true` again — it was already set during the copy.)

### Banner UI

- Positioned below the month selector, above the budget cards
- Background: `bg-accent` (lime green), text: `text-bg` (dark)
- Text: `"Se copiaron N presupuestos del mes anterior"` — plain text, no emoji
- Button: `"↩ Deshacer"` — small, pill-shaped, dark background

---

## Feature 2: Budget Detail Inline Expansion

### Behavior

Tapping anywhere on a budget card body (excluding the ✎ and × buttons) toggles an expanded section below the progress bar. Only **one card** can be expanded at a time. A chevron indicator ▾/▴ shows state.

### State addition to `BudgetPage`

```typescript
const [expandedId, setExpandedId] = useState<string | null>(null)
```

Toggle logic: `setExpandedId(prev => prev === p.id ? null : p.id)`

### Transaction filtering

Transactions come from `txns` (already loaded by `useTransacciones`). Filter:

```typescript
const txsCat = txns
  .filter(t => t.tipo === 'gasto' && t.categoria === p.categoria)
  .sort((a, b) => b.fecha.localeCompare(a.fecha))  // descending by date
```

**Note:** `gasto_tc` (credit card charges) are intentionally excluded — consistent with how `gastadoPorCat` is calculated. The amounts shown in the detail will always add up to exactly what the progress bar displays.

### Expanded section UI

Rendered inside the card, below the existing amounts row, when `expandedId === p.id`:

- Thin divider line
- Header: `"N transacciones"` in small uppercase muted text
- Each row: descripción (left), fecha in muted text (left, below descripción), cantidad in danger-colored monospace (right)
- Empty state: `"Sin gastos registrados en este mes"` centered muted text
- No separate modal, no navigation — purely inline

### Click target

The entire card `<div>` gets `onClick={handleToggle}` with `cursor-pointer`. The ✎ and × buttons use `e.stopPropagation()` to prevent the card toggle from firing when editing or deleting.

---

## Feature 3: Hide Patrimonio Toggle

### Behavior

The "Patrimonio total" widget in `DashboardPage` has a row with the label and an SVG eye icon. Tapping anywhere in that row toggles `patrimonioOculto`.

- **Visible state:** full card — label + eye-open icon, large amount, account chips
- **Hidden state:** compact single row — label + `••••••` + eye-crossed icon; amount and chips hidden

**Session-only** — no persistence. Resets on page reload. This is an intentional privacy gesture, not a saved preference.

### State addition to `DashboardPage`

```typescript
const [patrimonioOculto, setPatrimonioOculto] = useState(false)
```

### Icon

Two SVG icons (Lucide-style, `stroke-width="1.5"`, color `text-muted`):

- **Eye open:** `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>` + `<circle cx="12" cy="12" r="3"/>`
- **Eye crossed:** same base + diagonal line `<line x1="1" y1="1" x2="23" y2="23"/>`

Both 16×16, no fill, stroke only, matching the muted color palette.

### Markup

The entire card is replaced. The button always spans the full width; when hidden the `••••••` appears inline inside the button (one compact row).

```tsx
<div className="bg-surface rounded-2xl p-5">
  <button
    onClick={() => setPatrimonioOculto(v => !v)}
    className="w-full flex justify-between items-center mb-1"
  >
    <p className="text-muted text-xs uppercase tracking-widest">Patrimonio total</p>
    <div className="flex items-center gap-2">
      {patrimonioOculto && (
        <span className="text-muted font-mono tracking-widest text-sm">••••••</span>
      )}
      {patrimonioOculto ? <EyeOffIcon /> : <EyeIcon />}
    </div>
  </button>
  {!patrimonioOculto && (
    <>
      <p className="text-3xl font-mono font-bold text-white">{formatQ(totalPatrimonio)}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {cuentas.map(c => (/* chip */)}
      </div>
    </>
  )}
</div>
```

---

## Files Changed

| File | Type | Changes |
|---|---|---|
| `src/pages/BudgetPage.tsx` | Modified | Feature 1 (auto-copy + banner) + Feature 2 (inline expansion) |
| `src/pages/DashboardPage.tsx` | Modified | Feature 3 (patrimonio toggle) |

No new files. No DB migrations. No new hooks.

---

## Out of Scope

- Persisting the patrimonio visibility preference to Supabase (session-only is intentional)
- Including `gasto_tc` in budget calculations (separate decision, not part of this spec)
- Adding an "edit" action from the inline expansion view
- Budget carry-over for future months (only previous → current)
