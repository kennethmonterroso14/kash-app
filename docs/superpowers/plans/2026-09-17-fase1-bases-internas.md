# Fase 1 — Bases internas · Plan

Spec: [`../specs/2026-09-17-fase1-bases-internas-design.md`](../specs/2026-09-17-fase1-bases-internas-design.md)
Roadmap: [`2026-09-17-reestructuracion-roadmap.md`](2026-09-17-reestructuracion-roadmap.md)

Un commit por tarea. `tsc`, `lint` y `test` en verde antes de cada commit.

---

## Task 1.0 — Quitar los datos personales del repo · ✅ HECHO

Commit `08c5cee`. `CUENTAS_INICIALES` (saldos bancarios reales de una persona) y
`PRESUPUESTOS_INICIALES` reemplazados por `CUENTAS_SUGERIDAS` sin montos.

---

## Task 1.1 — `SesionProvider`

- [x] **1.1.1** Crear `src/context/SesionContext.tsx` con el provider y `useSesion()`, usando por
      dentro los hooks existentes (`useCuentas`, `useCategorias`, `useTarjetas`) más una consulta
      nueva de `profiles`. Error por slice, no global.
- [x] **1.1.2** Montarlo en `App.tsx` dentro del gate de auth, envolviendo `Layout` y las rutas.
      Verificar en la pestaña de red que el Dashboard pasa de 6 fetch a 1 por slice.
- [x] **1.1.3** Mover al provider la consulta de `profiles` duplicada. Quedaron solo las
      legítimas: la del gate en `App.tsx` y la de prefill de `SetupPage` corren ANTES de que el
      provider exista (son lo que decide si montarlo), y las otras dos son writes. De 6 lecturas
      a 1.
- [x] **1.1.4** Exponer `refrescar.{perfil,cuentas,categorias,tarjetas}` y mover ahí los writers
      que hoy viven en los hooks, para que cada write invalide su slice.

## Task 1.2 — Migrar las páginas al contexto

Una página por commit. Cada una: quitar la instanciación del hook, leer de `useSesion()`, y si
recibía `user` cambiar la prop a nada.

- [x] **1.2.1** `CategoriasPage` (la más chica, sirve de patrón)
- [x] **1.2.2** `ProyeccionesPage`
- [x] **1.2.3** `MetasPage`
- [x] **1.2.4** `PagosRecurrentesPage`
- [x] **1.2.5** `CuentasPage` — además quitar los dos `window.location.reload()` usando
      `refrescar.cuentas()` (cierra la tarea 1.5 del roadmap)
- [x] **1.2.6** `BudgetPage`
- [x] **1.2.7** `TarjetaHistorialPage`
- [x] **1.2.8** `TarjetasPage`
- [x] **1.2.9** `InversionesPage`
- [x] **1.2.10** `DashboardPage`
- [x] **1.2.11** `TransaccionesPage`
- [x] **1.2.12** `PerfilPage` y `SetupPage`
- [x] **1.2.13** Verificado con grep: ninguna página ni componente instancia `useCuentas`,
      `useCategorias` ni `useTarjetas`. Los archivos SE QUEDAN porque el provider los usa por
      dentro — colapsarlos en un solo archivo grande no compraría nada y perdería sus tests.

## Task 1.3 — Moneda y locale parametrizados

- [ ] **1.3.1** `formatMoneda(centavos, { moneda, locale })` en `finanzas.ts`, con `formatQ` como
      alias de GTQ/es-GT. Tests con al menos GTQ, USD y una tercera moneda, más los casos de borde
      que ya cubre `formatQ` (lanza con no-entero).
- [ ] **1.3.2** `hoyEn(zonaHoraria)` y `mesActualEn(zonaHoraria)` en `constants.ts`, con `hoyGT()` y
      `mesActual()` como alias. Tests incluyendo un cruce de día entre zonas.
- [ ] **1.3.3** `useMoneda()` y `useFechas()` en `src/hooks/`, currificando con lo que trae el
      perfil del contexto.
- [ ] **1.3.4** Agregar `locale` y `zona_horaria` a `profiles` (migración aditiva, con default
      `es-GT` / `America/Guatemala` para no romper a nadie) y al `SesionProvider`.

> La migración de los sitios de llamada NO va acá: viaja con la partición de 1.4, que ya toca cada
> archivo. Hasta entonces los alias mantienen todo funcionando.

## Task 1.4 — Partir las páginas grandes

Una página por commit, extrayendo por sección y migrando de paso sus `formatQ`/`hoyGT` a los hooks
de 1.3. Objetivo: ninguna sobre 300 líneas.

- [ ] **1.4.1** `TarjetasPage` (748 líneas)
- [ ] **1.4.2** `TransaccionesPage` (710)
- [ ] **1.4.3** `InversionesPage` (686)
- [ ] **1.4.4** `BudgetPage` (612)
- [ ] **1.4.5** `DashboardPage` (436)
- [ ] **1.4.6** `MetasPage` (368) y `PagosRecurrentesPage` (367)
- [ ] **1.4.7** Barrido final: grep de `formatQ(` y `hoyGT(` sin llamadas fuera de los alias, y
      retirar los alias.

## Task 1.5 — Tests de hooks

- [x] **1.5.1** Agregar `@testing-library/react` y un `setup` de Vitest para React.
- [ ] **1.5.2** Carry-over de presupuestos: no resucita lo borrado, no escribe meses futuros, el
      banner y "Deshacer" son alcanzables.
- [ ] **1.5.3** `useAutoApplyPagos`: idempotencia por mes al editar `dia_del_mes`, el
      compare-and-swap, y que un insert fallido no deje avanzado `ultima_aplicacion`.
- [ ] **1.5.4** Reparto de deuda de TC en insert / update / delete.
- [ ] **1.5.5** Carreras de cambio de mes en `useTransacciones` y `BudgetPage`.
- [x] **1.5.6** `SesionProvider`: una sola carga por slice, y que el error de un slice no tumbe los
      otros.

## Cierre de fase

- [ ] Verificar los criterios de terminado del spec.
- [ ] Actualizar `CLAUDE.md` (la arquitectura cambia: ya no es "un hook por tabla instanciado por
      página") y marcar en `RESTRUCTURE.md` lo que sale del inventario.
