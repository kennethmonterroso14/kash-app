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

### 1.1 No se puede editar, archivar ni borrar una cuenta
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

Consecuencia hoy: hay **Q6.50 de diferencia en "Ysi Visa"** entre el saldo de la tarjeta (Q718.10)
y lo que dice el ledger (Q711.60). Verificado el 2026-09-17: las otras tres tarjetas cuadran, no
existe ninguna transacción de Q6.50, y la diferencia es un offset constante que sobrevivió sin
cambio al pago de Q2,221.80 de ese día — o sea un delta que entró una vez, no un cálculo que se
repite. **De dónde salió no se puede saber** porque no hay `updated_at` ni bitácora, que es
exactamente lo que esta sección describe. Las dos formas de corregirlo están en el roadmap, en
"Cosas pendientes del mundo real".

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

### 3.1 Dos formas de recibir el usuario
Las páginas nuevas reciben `{ userId: string }`; `DashboardPage`, `TransaccionesPage`,
`CuentasPage` y `PerfilPage` reciben el objeto `User` completo. Unificar a `userId` (o a un contexto
de sesión) es mecánico.

### 3.2 Cada página vuelve a pedir lo mismo
No hay store ni caché: el Dashboard instancia seis hooks y varias páginas vuelven a pedir cuentas,
categorías y transacciones del mismo mes. El perfil se consulta en tres lugares distintos. Un
contexto de sesión (perfil + cuentas + categorías, cargados una vez) quita la mayoría.

### 3.3 `window.location.reload()` como refresco
`CuentasPage` recarga la página entera en dos lugares porque los hooks no exponen un `refetch`.

### 3.4 Los hooks exponen `error` pero no todas las páginas lo consumen
`useCuentas`, `useTransacciones`, `useResumen6Meses`, `usePagosRecurrentes` e `useInversiones` ya lo
exponen. El Dashboard consume el de cuentas e inversiones; el resto de las páginas todavía no.

### 3.5 El auto-apply no es atómico contra dos dispositivos
El avance de `ultima_aplicacion` usa compare-and-swap, así que dos pestañas no duplican. Dos
**dispositivos** simultáneos siguen siendo una carrera posible, y cerrarla de verdad necesita que la
lectura, el insert y el avance sean **un RPC transaccional**. No hay constraint que lo atrape del
lado del servidor.

### 3.6 Solo `finanzas.ts` tiene tests
48 tests, todos ahí. Los hooks y las páginas no tienen ninguno — ni un test de que el carry-over de
presupuestos no resucite lo borrado, que fue uno de los bugs críticos. Vitest y jsdom ya están
configurados; falta `@testing-library/react`.

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
