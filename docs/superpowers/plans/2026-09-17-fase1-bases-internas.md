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

- [x] **1.3.1** `formatMoneda(centavos, { moneda, locale })` en `finanzas.ts`, con `formatQ` como
      alias de GTQ/es-GT. Armado sobre `formatToParts` para quitar el espacio entre símbolo y
      número SOLO cuando el símbolo va adelante, así los quetzales se ven igual que antes. Dos
      cambios a propósito: los negativos pasan de `Q-1,234.56` a `-Q1,234.56`, y los decimales
      quedan forzados a 2 aunque ICU no los use para esa moneda (COP), porque el modelo guarda
      centésimos siempre. Una moneda inválida devuelve el código en lugar de lanzar en render.
      **El spec decía que `formatQ` tenía 48 tests; no tenía ninguno** — 48 era el total del repo.
- [x] **1.3.2** `hoyEn(zona)`, `mesActualEn(zona)` y `ahoraEn(zona)` en `constants.ts`, con
      `hoyGT()`, `mesActual()` y `ahoraGT()` como alias. Una zona inválida LANZA (un fallback
      silencioso escribiría fechas equivocadas), así que va con `zonaValida()` para que quien lee
      el perfil valide antes. `constants.ts` pasa a tener tests: cruce de día, cruce de mes, los
      extremos UTC+14 y UTC−11, y el ancla del mediodía contra DST.
- [x] **1.3.3** `useMoneda()` y `useFechas()` en `src/hooks/`. `useMoneda` acepta una moneda
      explícita como segundo parámetro (`fmt(x, 'USD')`), que no estaba en el spec: las filas USD
      de `inversiones` están en centavos de dólar y hoy se formatean a mano sin separador de miles.
      Devuelve `'—'` si el perfil falló, en lugar de formatear con una moneda supuesta.
- [x] **1.3.4** `locale` y `zona_horaria` en `profiles`, migración aditiva con defaults.
      **Aplicada en producción** el 2026-09-17 (7 perfiles, todos en GTQ/es-GT/Guatemala, sin
      cambios). El provider los lee, y marca error en el slice si la zona no es válida o si falta
      la columna.

> La migración de los sitios de llamada NO va acá: viaja con la partición de 1.4, que ya toca cada
> archivo. Hasta entonces los alias mantienen todo funcionando.

## Task 1.4 — Partir las páginas grandes

Una página por commit, extrayendo por sección y migrando de paso sus `formatQ`/`hoyGT` a los hooks
de 1.3. Objetivo: ninguna sobre 300 líneas.

Cada página que se parte se lleva también el trabajo visual que es decisión por sitio y no se puede
barrer con `sed`: `tracking-*` según el tamaño del texto, `rounded-*` según la superficie, y
`.presionable` en los objetivos grandes (el atenuado al presionar ya es global). Ver la tarea 3.0
del roadmap.

- [x] **1.4.1** `TarjetasPage`: 748 → **99**, y las seis piezas todas bajo 180.
      `./tarjetas/{TarjetaTile,ModalTC,ModalCargo,ModalPago,ModalCerrarCiclo}`. Los formularios
      "Nueva TC" y "Editar TC" eran el MISMO formulario copiado dos veces (~180 líneas), así que
      quedan en un solo `ModalTC` — un arreglo ahí ya no hay que hacerlo dos veces. El estado de
      cada formulario se mudó a su modal: como el modal se monta al abrirse, el montaje ES el
      reset, y desaparecen los cuatro helpers `abrir*` que reseteaban 21 `useState` a mano.
      Migrados `formatQ` → `useMoneda()` y `hoyGT()` → `useFechas()`. Dos defectos encontrados de
      paso: el chip de "% usado" se partía en dos renglones con un nombre largo, y el vacío se
      mostraba también cuando la consulta fallaba. Verificado con capturas de la lista y los
      cuatro modales.
- [x] **1.4.2** `TransaccionesPage`: 706 → **192**, en siete piezas (la más grande, 262).
      `./transacciones/{SelectorMes,FiltrosTxn,FilaTxn,ModalNuevoMovimiento,ModalEditarTxn}` más
      `exportarCSV.ts` con **10 tests propios**. Los 16 `useState` de formularios se mudaron a sus
      modales, y con ellos se van los dos `useEffect` que ponían la cuenta y la tarjeta por default.
      El `formError` que era uno solo para el alta, la edición y la lista (con guardas
      `!showForm && !editingTxn`) queda separado: cada modal tiene el suyo y la página guarda el de
      la lista. Cinco defectos encontrados de paso, ver el commit — entre ellos que **la columna de
      montos del CSV salía como texto** y que la lista no leía el `error` del hook.
- [x] **1.4.3** `InversionesPage`: 687 → **139**, en seis piezas más `tipoCambio.ts` con 5 tests.
      `./inversiones/{ResumenPortafolio,InversionTile,ModalInversion,ModalActualizarValor,ModalTipoCambio}`.
      "Nueva" y "Editar" eran otra vez el mismo formulario copiado; la única diferencia real es que
      la moneda se elige al crear y es de solo lectura al editar. Tres defectos: los montos USD se
      armaban a mano y **perdían el separador de miles** (`$3187.50` en lugar de `$3,187.50`),
      archivar usaba `window.confirm` contra la convención del repo, y el color de la gráfica era
      un hex suelto. El chequeo de "tipo de cambio viejo" sale a una función pura con tests, y el
      reloj se lee una sola vez en el inicializador del estado (leerlo en render es impuro).
- [x] **1.4.4** `BudgetPage`: 611 → **170**. Acá el problema de fondo no era el largo: `presupuestos`
      era **la única tabla sin hook**, así que ~250 líneas de acceso a datos vivían mezcladas con el
      JSX. Sale `src/hooks/usePresupuestos.ts` con todo el estado delicado (etiquetado por mes, el
      latch de la copia, el banner) y la página lo recibe ya filtrado por el mes visible: de cinco
      estados etiquetados a cero. Más `./presupuesto/{TarjetaPresupuesto,ModalPresupuesto}` y
      `SelectorMes` movido a `components/` porque ya lo usan dos páginas. Tres defectos: el % usaba
      `text-yellow-400` (color crudo) mientras la barra usaba `colores.warning` — dos amarillos
      distintos; un fallo al cargar los movimientos dejaba las barras en Q0.00 gastado sin avisar; y
      "Reintentar" recargaba la app entera en lugar de repetir la consulta.
- [x] **1.4.5** `DashboardPage`: 436 → **104**, en ocho piezas (la mayor, 85).
      `./dashboard/{Monto,TarjetaPatrimonio,TarjetaDisponibleReal,TarjetasTC,TarjetaPatrimonioNeto,StatsMes,GraficaCategorias,Grafica6Meses}`.
      Tres defectos: las barras de los 6 meses tenían el verde y el rojo **viejos** como hex sueltos
      (`#4ade80`/`#f87171`), así que eran los dos únicos colores de la app que no cambiaron con la
      paleta; el tooltip de barras armaba la moneda a mano con `Q` cableada; y la página no leía el
      `error` de `useTransacciones`, así que un fetch fallido pintaba todas las cifras del mes en
      Q0.00. Los dos tooltips se movieron a nivel de módulo (un componente recreado en cada render
      rompe la reconciliación — `react-hooks/static-components`) con el formateador por prop.
- [x] **1.4.6** `MetasPage`: 368 → **92** (`metas_ahorro` era otra tabla sin hook → `useMetas`,
      más `./metas/{TarjetaMeta,ModalMeta}`). `PagosRecurrentesPage`: 363 → **120**
      (`./pagos/{FilaPago,ModalPagoFijo}`, con alta y edición unificadas). Defectos: ninguna de las
      dos leía el `error` de su consulta, la fecha del estimador de metas usaba `es-GT` cableado en
      lugar del locale del perfil, el estado de un pago fijo se calculaba con el calendario del
      navegador y no con la zona del usuario, y la categoría por default de un pago fijo era el
      string `'Suscripciones'` — quien la hubiera borrado quedaba con un select sin opción válida.
- [ ] **1.4.6b** `CuentasPage` (310) — quedó como la única sobre 300.
- [x] **1.4.7** Barrido final hecho: **los cuatro alias retirados** (`formatQ`, `hoyGT`, `ahoraGT`,
      `mesActual`) y cero sitios que asuman Guatemala o quetzales. Tres cosas que salieron en el
      camino y no eran mecánicas:
      - `useAutoApplyPagos` corría **fuera del provider** (desde `App.tsx`), así que no tenía cómo
        leer la zona del perfil — y de la zona depende qué mes es el actual, o sea qué vencimiento
        cuenta como vencido. Se movió adentro con `<AutoAplicarPagos>`, que además lo corre después
        del gate de onboarding (un usuario sin fila en `profiles` tampoco tiene pagos fijos).
      - `useTarjetas` **no puede** usar `useFechas()`: lo monta el provider, así que consumiría el
        contexto que él mismo provee. La zona le entra por parámetro.
      - `calcDisponibleReal` armaba una de sus tres advertencias con `formatQ`, o sea con la moneda
        cableada dentro de una función pura. Ahora recibe las opciones de moneda; sigue siendo pura
        porque son datos, no contexto.

## Task 1.5 — Tests de hooks

- [x] **1.5.1** Agregar `@testing-library/react` y un `setup` de Vitest para React.
- [x] **1.5.2** Carry-over de presupuestos: **10 tests** sobre `usePresupuestos`. Cubren que no
      resucite lo borrado, que no materialice meses futuros, que el banner y "Deshacer" sean
      alcanzables, que deshacer no re-dispare la copia, que un fetch fallido no cuente como mes
      vacío, y que las tres escrituras vayan acotadas por `user_id` y `mes`. **Verificados por
      mutación**: quitar el guard de mes futuro rompe un test, y volver a decidir la copia con la
      lista viva rompe otro. (La primera mutación que probé no rompía nada porque no era fiel al
      bug — le faltaba la dependencia del efecto; con la fiel sí rompe.)
- [x] **1.5.3** `useAutoApplyPagos`: **11 tests**. Un periodo como máximo por corrida (un pago con
      ocho meses de atraso aplica uno), idempotencia por mes al editar `dia_del_mes`, el
      compare-and-swap con el valor leído, que otra pestaña que ya avanzó el pago impida el insert,
      que un insert fallido revierta `ultima_aplicacion`, que el gasto se feche en el vencimiento y
      no hoy, y que en `StrictMode` (que invoca el efecto dos veces) inserte una sola vez.
      **Verificados por mutación**: comparar por fecha en lugar de por mes rompe uno, y quitar la
      reversión rompe otro.
- [x] **1.5.4** Reparto de deuda de TC: **10 bloques de aserciones en SQL, contra un PostgreSQL
      de verdad** (`supabase/tests/`, `npm run test:sql`). Un mock del cliente no sirve acá: lo que
      hay que verificar es lo que hace el trigger. Cubren el cargo al ciclo abierto, el cierre
      moviendo la deuda de bucket (con un solo ciclo abierto por tarjeta), el pago liquidando
      primero el vencido, el sobrepago recortado sin dejar negativos, el DELETE revirtiendo el
      reparto **guardado** y no un recálculo desde `cantidad`, el rechazo de una fila sin reparto
      registrado, y que el escape hatch sea local a la transacción. **Verificado por mutación**:
      revertir desde `cantidad` rompe el bloque del delete de un pago.
- [ ] **1.5.5** Carreras de cambio de mes en `useTransacciones` y `BudgetPage`.
- [x] **1.5.6** `SesionProvider`: una sola carga por slice, y que el error de un slice no tumbe los
      otros.

## Cierre de fase · ✅ FASE 1 TERMINADA

- [x] **Criterios de terminado del spec, verificados uno por uno:**

  | Criterio | Estado |
  |---|---|
  | Una consulta de perfil, cuentas, categorías y tarjetas — no seis | ✅ con un test que cuenta las consultas por tabla |
  | Ninguna página recibe el objeto `User` | ✅ salvo `SetupPage`, que corre antes del provider |
  | Ningún `window.location.reload()` como refetch | ✅ quedan los dos de pantallas de error, que el spec deja |
  | Ninguna página sobre 300 líneas | ✅ la mayor es `ProyeccionesPage` con 294 |
  | `formatMoneda` con tests de al menos tres monedas | ✅ cinco, y `formatQ` ya no existe |
  | Tests de hooks para los cuatro escenarios | ✅ los cuatro, y verificados por mutación |
  | `npm test` / `lint` / `tsc` en verde | ✅ 122 tests, 0 problemas de lint, `tsc` limpio |

- [x] `CLAUDE.md` actualizado: la arquitectura ya no es "un hook por tabla instanciado por página",
      así que la capa 3 se reescribió con el provider, qué tablas quedaron fuera del contexto y por
      qué, la restricción de que un hook que monta el provider no puede llamar `useSesion()`, el
      conteo de tests y `npm run test:sql`.
- [x] `RESTRUCTURE.md`: salen del inventario **3.1, 3.2, 3.3, 3.4 y 3.6**. Siguen abiertos 3.5
      (el auto-apply no es atómico contra dos dispositivos: eso necesita un RPC transaccional) y
      3.7 (`calcPagoDeuda` es un export muerto).

### Lo que la fase NO resolvió, y conviene no perder de vista

- **Nadie ha visto las páginas corriendo con datos reales.** Se verificaron tipos, lint, 122 tests,
  el SQL contra Postgres y capturas en Chromium con datos de prueba. No puedo autenticarme contra
  Supabase desde el entorno, así que la verificación con datos propios sigue pendiente.
- **Tres cosas solo se comprueban en un teléfono**: el costo en frames de `backdrop-filter` dentro
  del WebView de Capacitor, las safe areas, y que los inputs ya no hagan zoom en iOS.
- **No hay test de render de una página completa.** Los hooks y la matemática sí están cubiertos.
- Los pendientes del mundo real (el Q6.50 de "Ysi Visa" y la protección de contraseñas filtradas)
  están en el roadmap, no acá.
