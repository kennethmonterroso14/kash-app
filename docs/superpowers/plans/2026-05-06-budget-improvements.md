# Budget Improvements & Dashboard Privacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add budget carry-over with undo banner, inline transaction detail expansion on budget cards, and a session-only patrimonio visibility toggle on the dashboard.

**Architecture:** All changes are pure React state additions in two existing page components — no new files, no DB schema changes, no new hooks. `BudgetPage.tsx` receives two independent features (carry-over + inline detail); `DashboardPage.tsx` receives one (privacy toggle).

**Tech Stack:** React 18, TypeScript, Tailwind CSS v3, Supabase JS client (browser), Vite

---

## File Map

| File | What changes |
|---|---|
| `src/pages/BudgetPage.tsx` | Feature 1: `intentoCopia` + `bannerCopia` state, auto-copy effect, reset effect, banner UI, `handleUndo`. Feature 2: `expandedId` state, card click handler, `e.stopPropagation()` on action buttons, chevron indicator, inline transaction list. |
| `src/pages/DashboardPage.tsx` | Feature 3: `patrimonioOculto` state, EyeIcon / EyeOffIcon inline SVG components, button wrapper on patrimonio header row, conditional rendering of amount + chips. |

---

## Task 1: Feature 1 — Budget Carry-Over (auto-copy + undo banner)

**File:** `src/pages/BudgetPage.tsx`

### Context for this task

`BudgetPage` already fetches `presupuestos` for the selected month and exposes `presupuestos`, `loading`, and `mes` as state. The carry-over feature auto-copies rows from the previous month when the current month has zero budgets.

Key variables already in scope:
- `mes` — `"YYYY-MM"` string (the month selector)
- `mesInicio` — `"YYYY-MM-01"` (derived from `mes`, used as the DB filter)
- `anio`, `mesNum` — numbers derived by splitting `mes`
- `userId` — prop

---

- [ ] **Step 1: Add carry-over state**

  Inside `BudgetPage`, immediately after the existing `[pendingDelete, setPendingDelete]` state declaration (line 38), add:

  ```typescript
  const [intentoCopia, setIntentoCopia] = useState(false)
  const [bannerCopia, setBannerCopia] = useState<{ n: number; ids: string[] } | null>(null)
  ```

---

- [ ] **Step 2: Add the `mes`-reset effect**

  Add this effect after the existing `useEffect` that fetches presupuestos (currently ends at line 56). It resets `intentoCopia` whenever the user navigates to a different month, so the carry-over can re-trigger for that month.

  ```typescript
  // Reset carry-over flag when month changes
  useEffect(() => {
    setIntentoCopia(false)
    setBannerCopia(null)
  }, [mes])
  ```

---

- [ ] **Step 3: Add the auto-copy effect**

  Add this effect immediately after the reset effect from Step 2. It fires whenever `presupuestos`, `loading`, or `intentoCopia` change. If all guard conditions pass it queries the previous month and batch-inserts those rows.

  ```typescript
  // Auto-copy previous month's budgets when current month is empty
  useEffect(() => {
    if (presupuestos.length > 0 || loading || intentoCopia) return

    // Calculate previous month start date
    const prevDate = new Date(anio, mesNum - 2, 1)
    const mesPrevInicio = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`

    ;(async () => {
      const { data: prevRows } = await supabase
        .from('presupuestos')
        .select('categoria, monto_limite')
        .eq('user_id', userId)
        .eq('mes', mesPrevInicio)
        .eq('activo', true)

      // Mark attempted regardless — prevents infinite loop
      setIntentoCopia(true)

      if (!prevRows || prevRows.length === 0) return

      const inserts = prevRows.map(r => ({
        user_id: userId,
        categoria: r.categoria,
        monto_limite: r.monto_limite,
        mes: mesInicio,
        activo: true,
      }))

      const { data: inserted } = await supabase
        .from('presupuestos')
        .insert(inserts)
        .select('id, categoria, monto_limite, mes')

      if (!inserted || inserted.length === 0) return

      setPresupuestos(inserted)
      setBannerCopia({ n: inserted.length, ids: inserted.map(r => r.id) })
      setTimeout(() => setBannerCopia(null), 4000)
    })()
  }, [presupuestos.length, loading, intentoCopia, anio, mesNum, userId, mesInicio])
  ```

  > **Why `setIntentoCopia(true)` before the insert?** If the insert fails or returns nothing, we still want to suppress retries — the flag prevents an infinite re-render loop.

---

- [ ] **Step 4: Add the `handleUndo` function**

  Add this function alongside the existing `handleDelete` function:

  ```typescript
  const handleUndo = async () => {
    if (!bannerCopia) return
    await supabase.from('presupuestos').delete().in('id', bannerCopia.ids)
    setPresupuestos([])
    setBannerCopia(null)
  }
  ```

---

- [ ] **Step 5: Add the banner UI**

  In the JSX `return`, immediately after the `{/* Header */}` block (the month selector `<div>`), and before the `{/* Empty state */}` block, add:

  ```tsx
  {/* Carry-over banner */}
  {bannerCopia && (
    <div className="flex justify-between items-center bg-accent text-bg rounded-xl px-4 py-2.5">
      <span className="text-sm font-medium">
        Se copiaron {bannerCopia.n} presupuestos del mes anterior
      </span>
      <button
        onClick={handleUndo}
        className="text-xs font-semibold bg-bg/20 rounded-lg px-3 py-1 ml-3 hover:bg-bg/30 transition-colors"
      >
        ↩ Deshacer
      </button>
    </div>
  )}
  ```

---

- [ ] **Step 6: Manual verification**

  Run the dev server:
  ```bash
  cd /Users/kennethmonterroso/Documents/kash-app && npm run dev
  ```

  Test checklist:
  1. Navigate to Presupuestos for the **current month** (which already has budgets) → banner should NOT appear.
  2. Navigate to a **future month** with no budgets, while a previous month had budgets → banner should appear after a moment with "Se copiaron N presupuestos del mes anterior", then auto-dismiss after 4 seconds.
  3. While banner is visible, tap "↩ Deshacer" → budgets disappear, banner disappears, empty state shows.
  4. Navigate away and back to that same future month in the same session → banner should NOT reappear (intentoCopia is still true... wait, navigating away resets it). Actually, navigating to a *different* month and back resets `intentoCopia`, so the copy will trigger again — this is correct behavior per spec.
  5. Navigate to a month where the previous month ALSO had no budgets → no banner, just empty state.

---

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/kennethmonterroso/Documents/kash-app
  git add src/pages/BudgetPage.tsx
  git commit -m "feat: auto-copy previous month budgets with undo banner"
  ```

---

## Task 2: Feature 2 — Budget Detail Inline Expansion

**File:** `src/pages/BudgetPage.tsx`

### Context for this task

`BudgetPage` already loads `txns` via `useTransacciones(userId, mes)`. Transactions have `tipo`, `categoria`, `descripcion`, `fecha`, and `cantidad` fields. `gastadoPorCat` already excludes `gasto_tc` (filters on `tipo === 'gasto'`). The inline expansion must be consistent with that — show only `tipo === 'gasto'` transactions.

---

- [ ] **Step 1: Add `expandedId` state**

  After the `[bannerCopia, setBannerCopia]` state added in Task 1, add:

  ```typescript
  const [expandedId, setExpandedId] = useState<string | null>(null)
  ```

---

- [ ] **Step 2: Make card div clickable and add chevron**

  In the budget cards map (starts at `{presupuestos.map(p => {`), replace the outer card `<div>`:

  **Before:**
  ```tsx
  <div key={p.id} className="bg-surface rounded-2xl p-4">
    <div className="flex justify-between items-center mb-2">
      <span className="text-white text-sm font-medium flex-1">{p.categoria}</span>
      <div className="flex items-center gap-1">
  ```

  **After:**
  ```tsx
  <div
    key={p.id}
    className="bg-surface rounded-2xl p-4 cursor-pointer"
    onClick={() => setExpandedId(prev => prev === p.id ? null : p.id)}
  >
    <div className="flex justify-between items-center mb-2">
      <div className="flex items-center gap-2">
        <span className="text-white text-sm font-medium">{p.categoria}</span>
        <span className={`text-xs ${expandedId === p.id ? 'text-accent' : 'text-muted'}`}>
          {expandedId === p.id ? '▴' : '▾'}
        </span>
      </div>
      <div className="flex items-center gap-1">
  ```

---

- [ ] **Step 3: Add `e.stopPropagation()` to the edit and delete buttons**

  Still inside the card map, update the ✎ and × buttons so they don't bubble the click up to the card toggle.

  **Before (edit button):**
  ```tsx
  <button
    onClick={() => openEdit(p)}
    className="text-xs px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors"
    aria-label="Editar"
  >
    ✎
  </button>
  ```

  **After (edit button):**
  ```tsx
  <button
    onClick={e => { e.stopPropagation(); openEdit(p) }}
    className="text-xs px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors"
    aria-label="Editar"
  >
    ✎
  </button>
  ```

  **Before (delete button):**
  ```tsx
  <button
    onClick={() => handleDelete(p.id)}
    className={`text-xs px-2 py-1 rounded-lg transition-colors ${
      pendingDelete === p.id
        ? 'bg-danger text-white'
        : 'text-muted hover:text-danger'
    }`}
  >
    {pendingDelete === p.id ? 'Confirmar' : '×'}
  </button>
  ```

  **After (delete button):**
  ```tsx
  <button
    onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
    className={`text-xs px-2 py-1 rounded-lg transition-colors ${
      pendingDelete === p.id
        ? 'bg-danger text-white'
        : 'text-muted hover:text-danger'
    }`}
  >
    {pendingDelete === p.id ? 'Confirmar' : '×'}
  </button>
  ```

---

- [ ] **Step 4: Add the inline expansion section**

  Inside the card map, immediately after the `<div className="text-xs text-muted mt-0.5 text-right">Límite: ...</div>` line (the last element before the closing `</div>` of the card), add the expanded transaction list:

  ```tsx
  {expandedId === p.id && (() => {
    const txsCat = txns
      .filter(t => t.tipo === 'gasto' && t.categoria === p.categoria)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
    return (
      <div className="border-t border-muted/20 mt-3 pt-3">
        <p className="text-muted text-xs uppercase tracking-wider mb-2">
          {txsCat.length} transacciones
        </p>
        {txsCat.length === 0 ? (
          <p className="text-muted text-xs text-center py-2">
            Sin gastos registrados en este mes
          </p>
        ) : (
          <div>
            {txsCat.map(t => (
              <div
                key={t.id}
                className="flex justify-between items-start py-2 border-b border-muted/10 last:border-0"
              >
                <div>
                  <p className="text-white text-xs">{t.descripcion}</p>
                  <p className="text-muted text-xs">{t.fecha}</p>
                </div>
                <span className="text-danger text-xs font-mono font-semibold ml-4 flex-shrink-0">
                  −{formatQ(Math.abs(t.cantidad))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  })()}
  ```

  > **Why an IIFE?** The `txsCat` filter depends on `p` (from the map), so it can't be computed outside the map. Using an IIFE keeps it inline without creating a helper function and avoids polluting the component scope.

---

- [ ] **Step 5: Manual verification**

  With the dev server running:
  1. Open Presupuestos page with at least one budget that has transactions in the current month.
  2. Tap anywhere on a card body → it expands showing a divider, transaction count, and a row per gasto transaction (descripción left, fecha below, −Q amount right in danger color).
  3. Tap again → collapses. Chevron toggles ▾ / ▴.
  4. Tap a different card → previous collapses, new one opens (only one expanded at a time).
  5. Tap ✎ (edit) or × (delete) → card does NOT toggle; only the modal/delete action fires.
  6. For a category with no `gasto` transactions → shows "Sin gastos registrados en este mes".

---

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/kennethmonterroso/Documents/kash-app
  git add src/pages/BudgetPage.tsx
  git commit -m "feat: inline transaction detail expansion on budget cards"
  ```

---

## Task 3: Feature 3 — Hide Patrimonio Toggle

**File:** `src/pages/DashboardPage.tsx`

### Context for this task

The current patrimonio widget (lines 93–105) is a static `<div>` with a `<p>` label, a large amount, and account chips. We need to wrap the label row in a `<button>` that toggles `patrimonioOculto`. When hidden: the button shows `••••••` inline next to the eye-off icon; the amount and chips are hidden. Session-only — no persistence.

---

- [ ] **Step 1: Add `patrimonioOculto` state**

  At the top of `DashboardPage`, after the existing `const [mes, setMes] = useState(mesActual())` line, add:

  ```typescript
  const [patrimonioOculto, setPatrimonioOculto] = useState(false)
  ```

---

- [ ] **Step 2: Define the SVG eye icon components**

  Add these two inline component definitions inside `DashboardPage`, immediately before the `return` statement. They use Lucide-style paths, monochromatic stroke only (`currentColor` + `text-muted`).

  ```tsx
  const EyeIcon = () => (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      className="text-muted flex-shrink-0"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )

  const EyeOffIcon = () => (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      className="text-muted flex-shrink-0"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
  ```

---

- [ ] **Step 3: Replace the patrimonio widget**

  In the JSX `return`, find the existing patrimonio block:

  ```tsx
  {/* Patrimonio total */}
  <div className="bg-surface rounded-2xl p-5">
    <p className="text-muted text-xs uppercase tracking-widest mb-1">Patrimonio total</p>
    <p className="text-3xl font-mono font-bold text-white">{formatQ(totalPatrimonio)}</p>
    <div className="flex flex-wrap gap-2 mt-3">
      {cuentas.map(c => (
        <div key={c.id} className="flex items-center gap-1.5 bg-bg rounded-lg px-2 py-1">
          <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
          <span className="text-xs text-muted">{c.nombre}</span>
          <span className="text-xs font-mono text-white">{formatQ(c.saldo)}</span>
        </div>
      ))}
    </div>
  </div>
  ```

  Replace it entirely with:

  ```tsx
  {/* Patrimonio total */}
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
          {cuentas.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 bg-bg rounded-lg px-2 py-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              <span className="text-xs text-muted">{c.nombre}</span>
              <span className="text-xs font-mono text-white">{formatQ(c.saldo)}</span>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
  ```

---

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /Users/kennethmonterroso/Documents/kash-app && npx tsc --noEmit
  ```

  Expected: no errors. If any errors appear, check that `EyeIcon` and `EyeOffIcon` are defined before the `return` and that the `<line>` JSX element in `EyeOffIcon` uses lowercase (it is an SVG element, not React's `Line`).

---

- [ ] **Step 5: Manual verification**

  With the dev server running:
  1. Open Dashboard → patrimonio widget shows the amount and chips. Eye-open icon (muted) is visible on the right of the label row.
  2. Tap the label row → amount and chips disappear; `••••••` appears inline next to the eye-off icon. Widget is now one compact line.
  3. Tap again → full widget returns.
  4. Reload page → widget returns to visible state (session-only, not persisted).
  5. Rest of dashboard below the widget does not shift unexpectedly (chips were wrapped so the height change is expected).

---

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/kennethmonterroso/Documents/kash-app
  git add src/pages/DashboardPage.tsx
  git commit -m "feat: session-only patrimonio visibility toggle"
  ```

---

## Done

All three features are independent — they can be implemented and committed in any order. Each commit produces working, testable software on its own.
