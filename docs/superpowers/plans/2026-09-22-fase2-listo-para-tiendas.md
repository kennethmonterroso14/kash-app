# Fase 2 — Listo para varios usuarios y para tiendas · Plan

Roadmap: [`2026-09-17-reestructuracion-roadmap.md`](2026-09-17-reestructuracion-roadmap.md)

Un commit por tarea. `tsc`, `lint`, `test` y `test:sql` en verde antes de cada commit.

---

## El estado real, verificado antes de planear

| Tarea | Lo que decía el roadmap | Lo que hay hoy |
|---|---|---|
| 2.1 Onboarding | `SetupPage` solo escribe `profiles` | **Sigue igual.** Un usuario nuevo cae al dashboard con 0 cuentas y todo en Q0.00 |
| 2.2 Borrar la cuenta | "Hoy no existe nada" | **Correcto, no existe nada** |
| 2.3 Auth | *"Hoy solo magic link"* | **VIEJO.** `LoginPage` usa `signInWithPassword` / `signUp` desde la Fase 1 |
| 2.4 Legales | No hay | **Correcto:** cero menciones de privacidad o términos en `src/` |
| 2.5 Marca | PNGs sin arte | **Correcto, y peor de lo escrito:** `pwa-512x512.png` pesa **787 KB** y `pwa-192x192.png` **110 KB** — para dos cuadrados de color sólido |

**2.3 hay que reescribirla, no hacerla.** El magic link ya no existe, así que "el correo abre en otro
navegador y se pierde la sesión" dejó de aplicar. Lo que queda de esa tarea es otra cosa:

- **Sign in with Apple NO es obligatorio hoy.** Apple lo exige cuando la app ofrece login de
  *terceros* (Google, Facebook…). Con email+contraseña propio y nada más, no aplica. Si algún día se
  agrega Google, entra en el mismo release.
- **La protección de contraseñas filtradas sigue desactivada** y requiere plan Pro. Lo que sí se
  puede hoy, gratis, en Authentication → Sign In / Providers → Email: subir el largo mínimo y exigir
  variedad de caracteres. Los usuarios existentes siguen entrando con su contraseña actual.

Esas dos son decisiones del dueño del proyecto (¿se agrega Google? ¿se sube a Pro?), no código. Se
dejan escritas y 2.3 no bloquea nada.

## Orden

Por valor y por independencia, no por número:

1. **2.2 Borrar la cuenta** — requisito duro de App Store, no existe nada, y es autocontenido.
2. **2.4 Legales** — requisito duro de las dos tiendas, y es chico.
3. **2.5 Íconos** — hay un defecto medible ahí (787 KB por un cuadrado), no solo falta de arte.
4. **2.1 Onboarding** — el hueco más grande para un usuario nuevo de verdad.
5. **2.3** — reescrita arriba; no hay código que escribir.

## Decisiones

**Borrar la cuenta va por un RPC con orden explícito, no por un `delete from auth.users`.** Todas
las tablas cuelgan de `auth.users` con `on delete cascade`, así que la tentación es borrar el
usuario y dejar que la base haga el resto. **No funciona:** hay tres FKs entre tablas hermanas que
no son cascade —`transacciones.cuenta_id` y `pagos_recurrentes.cuenta_id` son `on delete restrict`,
y `transacciones.tarjeta_id` / `ciclo_id` son NO ACTION— y un `restrict` se evalúa de inmediato, no
al final de la sentencia. El orden de los cascades entre hermanas no está garantizado, así que
borrar `cuentas` mientras `transacciones` todavía la referencia puede fallar. El RPC borra en orden
de dependencia y recién al final la fila de `auth.users`.

**Y apaga el trigger de deuda mientras borra.** `trg_deuda_tc` corre en cada DELETE de
`transacciones` y **lanza** si la fila no tiene reparto guardado. Una cuenta vieja con filas
anteriores al backfill no se podría borrar nunca. Para eso está `vorta.reparto_manual`: las tarjetas
se van en la misma operación, así que mantener sus columnas de deuda al día mientras se borran no
tiene sentido.

**Borrar la cuenta no es un borrado de 2 toques.** La convención del repo son dos toques para lo
destructivo, y eso está bien para una fila. Esto borra *todo* y es irreversible, así que pide
escribir el correo: es la barrera que corresponde, y es lo que las dos tiendas esperan ver.

**Los legales son texto que describe lo que la app hace de verdad**, no una plantilla. Van como
páginas dentro de la app (requisito: accesibles desde la app) y no como un enlace externo, así que
no dependen de un sitio aparte. **No son asesoría legal** y eso queda escrito en el propio
documento; lo que sí son es una descripción exacta y verificable de qué datos se guardan y dónde.

## Tareas

- [ ] **2.2** RPC `borrar_mi_cuenta()` con orden de dependencia + tests de SQL, y la pantalla de
      confirmación en Ajustes.
- [ ] **2.4** Política de privacidad y términos, accesibles desde Ajustes.
- [ ] **2.5** Marca: un glifo propio en SVG y los PNG de tienda exportados a un peso razonable.
- [ ] **2.1** Onboarding que cree la primera cuenta con su saldo.
- [x] **2.3** Reescrita arriba: no hay código, son dos decisiones del dueño.

## Fuera de alcance

- **Presupuestos de arranque.** El roadmap los menciona en 2.1. Se dejan afuera: las categorías base
  ya existen (`CATEGORIAS_GASTO`), y un presupuesto sugerido sin conocer los ingresos del usuario es
  un número inventado que después hay que corregir. Crear la primera cuenta sí es indispensable;
  sugerir cuánto gastar en comida, no.
- **Subir a plan Pro y agregar Google.** Decisiones del dueño, anotadas arriba.
