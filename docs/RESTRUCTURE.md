# Estado conocido y punto de partida para la reestructuración

Inventario de lo que **falta o está estructuralmente torcido** en Vorta, al 2026-09-17, después de
una auditoría de 68 defectos verificados y su corrección.

Todo lo de acá está clasificado a propósito: **nada de esta lista es un bug pendiente.** Los bugs se
arreglaron. Esto es (a) funcionalidad que nunca se construyó, (b) decisiones de modelo de datos que
se vuelven a pagar cada vez que se toca el código, y (c) deuda que no vale arreglar puntualmente
porque la reestructuración la borra.

Cada ítem dice **por qué quedó afuera**, para que la decisión sea informada y no se re-descubra.

---

## 1. Funcionalidad que no existe

Estas no son regresiones: la UI insinúa que existen, pero no hay código que las haga.

### 1.1 No se puede editar, archivar ni borrar una cuenta  · ✅ RESUELTO

Resuelto: tocar una cuenta en Patrimonio abre `ModalCuenta` (el mismo formulario del alta) para
editar nombre, tipo y color, y eliminarla. `useCuentas.eliminarCuenta` aplica `decidirBajaCuenta`
(`lib/bajaCuenta.ts`): borra si no tiene historial, archiva si tiene movimientos o pagos fijos
inactivos, y se niega si tiene saldo (archivarla bajaría el patrimonio sin explicación) o pagos
fijos activos (se seguirían aplicando sobre una cuenta invisible).

El diagnóstico original:
`cuentas.activa` existe en el esquema y **nada la escribe nunca**. Un `grep` confirma que no hay un
solo `.update()` ni `.delete()` contra `cuentas` en todo `src/`. Una cuenta creada con el nombre o
el saldo equivocado es permanente, y sigue sumando al patrimonio para siempre.

Necesita: writers `actualizarCuenta` / `archivarCuenta` en `useCuentas` (archivar si tiene
transacciones, borrar si no — el patrón ya existe en `useTarjetas.archivarTC`) y una hoja de edición
en `CuentasPage`.

### 1.2 Las metas de ahorro son de solo escritura
`metas_ahorro.monto_actual` se escribe **únicamente al insertar** y no hay ningún control para
abonar, así que el progreso de toda meta queda congelado en el día uno. `fecha_objetivo` existe en
la tabla y no se escribe ni se lee nunca.

Decisión pendiente: ¿un control "Abonar" que escribe `monto_actual`, o vincular la meta al ledger
(`meta_id` en `transacciones`) para que el progreso se derive? Lo segundo es más coherente con el
resto de la app, donde Postgres es dueño de lo derivado.

> Nota: se rechazó explícitamente hacer que "Completar" ponga `monto_actual = monto_objetivo`.
> Fabricaría ahorro que no existe.

### 1.3 Recuperar pagos fijos atrasados
`useAutoApplyPagos` aplica **como máximo un periodo por pago y por corrida**, a propósito. Una
versión anterior recuperaba hasta 12 meses automáticamente y eso resultó peor que el bug original:
quien no abría la app medio año se encontraba 32 gastos retroactivos por -Q64,000 insertados en
meses ya cerrados, sin confirmación y sin deshacer.

Necesita: UI que liste los vencimientos perdidos con su total y pida confirmación explícita. Además,
los montos retroactivos deberían usar el `monto` vigente en ese vencimiento, no el actual — hoy
`updatePago` deja cambiar el monto y no hay historial.

### 1.4 Un ciclo de tarjeta nunca llega a `pagado`
El enum `estado_ciclo_tc` tiene `'pagado'` y el badge existe en la UI, pero **nada lo escribe**:
`cerrado` es el estado terminal. Por eso los pagos se atribuyen al ciclo `cerrado` más reciente en
lugar de cerrar su ciclo.

### 1.5 Cambiar la moneda de una inversión
El selector GTQ/USD quedó **de solo lectura al editar**, porque antes mentía: aceptaba el cambio y
guardaba el monto en la moneda equivocada (una inversión en dólares registrada como quetzales
subestimaba el patrimonio ~7.75×).

Hacerlo bien necesita un RPC atómico que convierta `monto_invertido`, `valor_actual` y **cada fila
de historial** a un tipo de cambio confirmado por el usuario. No es un toggle.

### 1.6 La PWA no tiene ícono
`public/pwa-192x192.png` y `pwa-512x512.png` son cuadrados sólidos `#12151c` sin arte (787 KB para
un PNG en blanco de 512px), y `public/favicon.svg` sigue siendo el rayo de la plantilla de Vite.
Tarea de diseño: hay que dibujar la marca y re-exportarla.

---

## 2. Decisiones de modelo de datos que cuestan en cada cambio

### 2.1 La deuda de TC son totales corrientes, no derivados del ledger
`deuda_actual` y `deuda_ciclo_anterior` se mantienen con deltas desde el día uno. Todos los defectos
más graves de la auditoría vivían acá: un delta mal calculado no se detecta y no se puede
reconstruir.

Lo natural sería derivar los dos buckets del ledger (`transacciones` + `ciclos_tc`) en una vista o
función, y que el total corriente desaparezca.

**Bloqueante real:** los cierres de ciclo **no están timestamped**. `ciclos_tc` guarda la
`fecha_cierre` teórica, pero el usuario cierra cuando quiere, así que no se puede saber en qué
momento un monto pasó de un bucket al otro y **la historia no se puede reproducir**. Para derivar
hay que primero registrar `cerrado_at` y aceptar que lo viejo queda con el reparto que tiene.

**CORREGIDO el 2026-09-21 — la diferencia de Q6.50 no existía.** Esta sección venía reportando
"Q6.50 de diferencia en Ysi Visa, de dónde salió no se puede saber". Con la derivación de la tarea
4.2a se pudo por fin reproducir el ledger en orden, y la tarjeta **cuadra exacto**: Q865.75
guardado = Q865.75 derivado.

La diferencia salía de la comparación, no del dato. Se estaba comparando el total guardado contra
`sum(cargos) − sum(pagos)`, y esa resta **no modela el recorte de un sobrepago**. Lo que pasó de
verdad: el primer pago de esa tarjeta (2026-08-26, Q4,760.58) fue Q6.50 mayor que la deuda que
había en ese momento (Q4,754.08 de cargos, cero pagos antes). El trigger aplicó solo lo que había
—correcto, no se puede pagar deuda que no existe— y esos Q6.50 nunca bajaron ningún bucket. La
suma simple los cuenta como pago; el saldo real, no.

Queda una consecuencia real, y esa sí era un defecto: `aplicado_actual` de esa fila quedó en
−476058, el monto completo, porque el backfill de septiembre rellenó el reparto de los pagos
existentes sin modelar el recorte. El trigger revierte un DELETE con esa columna, así que borrar
ese pago le habría devuelto a la tarjeta Q4,760.58 cuando solo le quitó Q4,754.08 — **Q6.50 de
deuda fantasma**. Lo corrige el PASO 4 de
`supabase/migrations/20260921010000_deuda_tc_derivada.sql`, y `verificar_reparto_tc()` es la
función que lo detecta: existe porque comparar TOTALES tiene un punto ciego, y este caso es
exactamente ese punto ciego (dos errores de la misma magnitud en sentidos opuestos, y la tarjeta
parece cuadrar).

La moraleja se queda igual y es la de esta sección: un total corriente no se puede auditar. Lo que
cambió es que ahora hay con qué.

### 2.2 `ciclos_tc.total_cargos` y `total_pagos` no tienen quien los escriba
Están siempre en 0. El historial los deriva de las transacciones del ciclo en el cliente. O se
llenan con un trigger, o se borran de la tabla; tenerlos ahí en 0 invita a que alguien los use.

### 2.3 Los pagos de TC apuntan a un solo `ciclo_id`
El trigger reparte un pago entre dos buckets (y por lo tanto, conceptualmente, entre dos estados de
cuenta), pero `transacciones.ciclo_id` es una sola FK. Cuando el pago se reparte se deja en NULL y
el historial cae a atribución por rango de fechas. Un pago no pertenece a un ciclo: pertenece a un
reparto.

### 2.4 `profiles` tiene PK propia además de `user_id`
`id` es un uuid generado y `user_id` es el FK único a `auth.users`. **La relación real es `user_id`**
(confirmado contra producción) y `PerfilPage` filtraba por `id`, lo que nunca coincidía. Ya está
corregido, pero la tabla sigue con dos claves y eso va a volver a confundir. Colapsar `id` a
`user_id` es una migración chica y elimina la clase de bug.

### 2.5 El onboarding no crea cuentas
`App.tsx` decide que el setup terminó consultando `profiles`, y `SetupPage` solo escribe esa fila.
Es consistente ahora, pero significa que un usuario nuevo entra al Dashboard sin ninguna cuenta y
ve todo en Q0.00. `CUENTAS_INICIALES` y `PRESUPUESTOS_INICIALES` en `constants.ts` están ahí para
eso y **nadie los importa** — además traen los saldos bancarios reales de una persona hardcodeados,
así que hay que borrarlos o convertirlos en plantilla genérica antes de que alguien los cablee.

---

## 3. Deuda estructural del cliente

### 3.9 La moneda, el idioma y la zona del perfil no se podían cambiar  · ✅ RESUELTO (fase 2)

La Fase 1 parametrizó los montos y las fechas por perfil (`moneda`, `locale`, `zona_horaria`), y
funcionaba — pero **nada las escribía nunca**. Las únicas escrituras a `profiles` eran el onboarding
(solo el nombre) y el tipo de cambio de Inversiones. O sea que los tres valores quedaban con el
default de la tabla —GTQ, es-GT, America/Guatemala— para siempre, y un usuario en México veía
quetzales y el calendario guatemalteco sin forma de salir. De la zona salen los límites de mes de
todas las consultas, así que no era cosmético.

Se resolvió por los dos lados: el onboarding pregunta la moneda y saca la zona y el idioma del
navegador, y `ModalPerfil` en Ajustes permite cambiar nombre, moneda y zona después. El `locale` no
se pregunta a propósito: es una pregunta que nadie sabe contestar ("¿es-GT o es-419?") para un
efecto que casi no se ve.



### 3.8 Una escritura en `transacciones` no invalidaba el saldo de las cuentas  · ✅ RESUELTO (fase 4)

`cuentas.saldo` lo mueve el trigger `trigger_saldo_transaccion`, del lado del servidor, en cada
escritura sobre `transacciones`. Pero el slice de cuentas vive en el `SesionProvider`, que está
montado **por encima del router**: navegar no lo vuelve a montar, así que quedaba viejo hasta un
reload completo.

Síntoma reportado: "agrego un registro y no aparece en el dashboard". Y era exactamente eso —
Patrimonio, Disponible real y Patrimonio neto seguían con el saldo anterior. Las cifras del mes sí
se actualizaban, porque `DashboardPage` remonta y vuelve a pedir las transacciones, y esa mezcla
—unas cosas al día y otras no— es lo que hacía parecer que el movimiento no se había guardado.

Tres puntos de inserción, ninguno invalidaba:

- `useTransacciones` (`addTxn`, `addTransferencia`, `deleteTxn`, `restoreTxn`, `updateTxn`)
- `useTarjetas.registrarPago` — recargaba las tarjetas pero no las cuentas, y un `pago_tc` debita
  una cuenta bancaria
- `useAutoApplyPagos` — los pagos fijos del mes se aplicaban al abrir la app

La invalidación quedó **dentro** de cada punto de inserción y no en el sitio de llamada, que es
donde se olvidaba. `registrarPago` es el caso especial: `useTarjetas` no puede leer el contexto
—el provider lo monta— así que el wrapper que compone los dos slices vive en el provider, que es
lo único que conoce ambos.



### 3.1 Dos formas de recibir el usuario  · ✅ RESUELTO (fase 1, tarea 1.2)

Ninguna página recibe el objeto `User`: todas leen `useSesion()`. La única excepción es `SetupPage`,
que lo recibe porque corre ANTES de que el provider exista — es lo que decide si montarlo.

<details><summary>Descripción original</summary>
Las páginas nuevas reciben `{ userId: string }`; `DashboardPage`, `TransaccionesPage`,
`CuentasPage` y `PerfilPage` reciben el objeto `User` completo. Unificar a `userId` (o a un contexto
de sesión) es mecánico.

</details>

### 3.2 Cada página vuelve a pedir lo mismo  · ✅ RESUELTO (fase 1, tareas 1.1 y 1.2)

`SesionProvider` carga perfil, cuentas, categorías y tarjetas UNA vez, con `cargando` y `error` por
slice. `profiles` pasó de 6 lecturas a 1. Hay un test que cuenta las consultas por tabla para
afirmarlo, no solo para describirlo.

Lo que NO entró al contexto, a propósito: `transacciones` y `presupuestos` están acotados por mes,
`inversiones` e `historial` son pesados y los usan 2 páginas, y `ciclos_tc` es por tarjeta.

### 3.3 `window.location.reload()` como refresco  · ✅ RESUELTO (fase 1, tareas 1.2 y 1.4.4)

Los dos de `CuentasPage` usan `refrescar.cuentas()`, y el "Reintentar" de presupuestos usa el
`recargar()` del hook. Los dos que quedan son pantallas de error (el gate de perfil en `App.tsx` y
el `ErrorBoundary`), donde una recarga completa ES la recuperación correcta.

### 3.4 Los hooks exponen `error` pero no todas las páginas lo consumen  · ✅ RESUELTO (fase 1, tarea 1.4)

Cada página que se partió se llevó su error sin leer. Eran seis: Tarjetas, Movimientos, Dashboard
(el de transacciones), Presupuesto, Metas y Pagos Fijos. En todos los casos el síntoma era el mismo
— un fetch fallido se pintaba como estado vacío o como Q0.00, que afirma algo distinto de "no se
pudo saber".

### 3.5 El auto-apply no es atómico contra dos dispositivos
El avance de `ultima_aplicacion` usa compare-and-swap, así que dos pestañas no duplican. Dos
**dispositivos** simultáneos siguen siendo una carrera posible, y cerrarla de verdad necesita que la
lectura, el insert y el avance sean **un RPC transaccional**. No hay constraint que lo atrape del
lado del servidor.

### 3.6 Solo `finanzas.ts` tiene tests  · ✅ RESUELTO (fase 1, tarea 1.5)

122 tests en 10 archivos, más 10 bloques de aserciones en SQL contra un PostgreSQL real
(`npm run test:sql`) para el trigger de deuda de TC — eso no se puede probar con un mock del
cliente. Los cuatro escenarios que el spec pedía están cubiertos y **verificados por mutación**:
carry-over de presupuestos, `useAutoApplyPagos`, el reparto de deuda y las carreras de cambio de
mes. Lo que sigue sin tests son las páginas como tal (no hay test de render de una página completa);
los hooks y la matemática sí.

### 3.7 `calcPagoDeuda` es un export muerto
Sin llamadas y sin tests.

---

## 4. Lo que ya se hizo (para no re-auditarlo)

- Los 3 críticos: signo invertido al editar (movía el saldo 2× el monto), carry-over que resucitaba
  presupuestos borrados, y gate de onboarding contra la tabla equivocada.
- Desbordes de día de mes (29-31 y febrero) en ciclos y alertas de TC.
- La fecha inválida `YYYY-MM-31` que dejaba la gráfica de 6 meses en cero.
- Errores de consulta descartados que se renderizaban como estado vacío.
- Carreras entre meses en los fetch de transacciones y presupuestos.
- Moneda USD descartada al editar una inversión.
- Accesibilidad de las tarjetas de presupuesto (`role="button"` podaba del árbol todas las cifras).
- CSV: comillas en todos los campos, inyección de fórmulas, nombre de tarjeta en vez de UUID.
- SQL aplicado en producción: trigger de deuda exactamente reversible, `cerrar_ciclo_tc` scopeado
  por usuario (era un agujero cross-tenant), `search_path` fijo y `EXECUTE` revocado en las
  funciones que no deben ser RPC.
- `schema.sql` pasó de 5 tablas a las 11 reales, verificado por introspección contra producción.

El detalle está en los mensajes de commit de la rama `claude/gracious-wright-9p6fdq`.
