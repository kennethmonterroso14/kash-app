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

**Borrar la cuenta va por un RPC, y la razón medida no es la que yo esperaba.** Todas las tablas
cuelgan de `auth.users` con `on delete cascade`, así que la tentación es borrar el usuario y dejar
que la base haga el resto. Escribí que eso "no funciona" — y al probarlo por mutación resultó que
**sí funciona**: un `delete from auth.users` pelado se lleva las once tablas. Corregido acá, porque
una premisa que no se sostiene es peor que no tenerla.

Lo que sí obliga al RPC, y está medido:

1. **El trigger de deuda bloquea el borrado.** `trg_deuda_tc` corre también en un DELETE por
   cascada y **lanza** si la fila no tiene reparto guardado (`aplicado_*` en NULL). Una cuenta con
   filas anteriores al backfill no se podría borrar nunca — y una cuenta vieja es exactamente la que
   va a querer irse. Apagarlo necesita `set_config`, o sea una función: desde el cliente no se
   puede. **Esta es la razón real.**
2. **El orden entre hermanas no está garantizado.** `transacciones.cuenta_id` y
   `pagos_recurrentes.cuenta_id` son `on delete restrict`, y `transacciones.tarjeta_id` / `ciclo_id`
   son NO ACTION. Un `restrict` se evalúa de inmediato y Postgres no promete en qué orden procesa
   los cascades, así que que hoy funcione no garantiza que siga funcionando. Que el orden importa
   está medido: quitar `transacciones` de la lista rompe con `transacciones_ciclo_id_fkey`.

**Borrar la cuenta no es un borrado de 2 toques.** La convención del repo son dos toques para lo
destructivo, y eso está bien para una fila. Esto borra *todo* y es irreversible, así que pide
escribir el correo: es la barrera que corresponde, y es lo que las dos tiendas esperan ver.

**Los legales son texto que describe lo que la app hace de verdad**, no una plantilla. Van como
páginas dentro de la app (requisito: accesibles desde la app) y no como un enlace externo, así que
no dependen de un sitio aparte. **No son asesoría legal** y eso queda escrito en el propio
documento; lo que sí son es una descripción exacta y verificable de qué datos se guardan y dónde.

## Tareas

- [x] **2.2** RPC `borrar_mi_cuenta()` con orden de dependencia + tests de SQL, y la pantalla de
      confirmación en Ajustes.
- [x] **2.4** Política de privacidad y términos, accesibles desde Ajustes.
- [x] **2.5** Marca: un glifo propio en SVG y los PNG de tienda exportados a un peso razonable.
- [x] **2.1** Onboarding que cree la primera cuenta con su saldo. Salió más grande de lo planeado:
      ver abajo.
- [x] **2.3** Reescrita arriba: no hay código, son dos decisiones del dueño.

## Lo que 2.1 destapó

**No existía ningún editor de perfil.** Las únicas escrituras a `profiles` eran el onboarding (solo
el nombre) y el tipo de cambio de Inversiones, así que `moneda`, `locale` y `zona_horaria` quedaban
con el default de la tabla —GTQ, es-GT, America/Guatemala— **para siempre**. La Fase 1 hizo todo el
trabajo de parametrizar los montos y las fechas por perfil y nada podía cambiar esos valores.

Para una fase que se llama "listo para varios usuarios" eso es el problema, no un detalle: un
usuario en México veía quetzales y el calendario de Guatemala sin salida. Y de la zona salen los
límites de mes de todas las consultas, así que no era cosmético.

Así que 2.1 quedó de tres partes:

1. La primera cuenta, que es lo que pedía el roadmap.
2. La zona y el idioma **del navegador**, como default y sin preguntar: se aciertan casi siempre, y
   una pantalla menos vale más que una pregunta bien contestada.
3. `ModalPerfil` en Ajustes, para que nada de lo que se elige en el onboarding sea permanente. Sin
   esto, preguntar la moneda al principio sería *peor* que no preguntarla: una decisión
   irreversible tomada en el minuto cero.

La moneda sí se pregunta porque no se deduce del idioma del teléfono, y equivocarse ahí se ve en
cada pantalla. La lista es corta y **solo de monedas de 2 decimales**: la app guarda centavos
enteros y `formatMoneda` divide por 100, así que una moneda de 0 decimales (CLP, JPY) daría montos
mal por un factor de 100 sin parecer un error.

Y de paso salió un extracto que hacía falta: crear una cuenta con saldo son **dos** escrituras —la
cuenta en 0 y un `ajuste` que el trigger convierte en saldo— con una compensación si la segunda
falla. Eso vivía solo dentro de `ModalNuevaCuenta` y `SetupPage` lo necesitaba, pero no puede usar
ese componente porque corre antes del provider. Vive en `lib/altaCuenta.ts` y ahora tiene tests: la
compensación no tenía ninguno, y es de las cosas que solo se descubren roto cuando ya pasó.

## Fuera de alcance

- **Presupuestos de arranque.** El roadmap los menciona en 2.1. Se dejan afuera: las categorías base
  ya existen (`CATEGORIAS_GASTO`), y un presupuesto sugerido sin conocer los ingresos del usuario es
  un número inventado que después hay que corregir. Crear la primera cuenta sí es indispensable;
  sugerir cuánto gastar en comida, no.
- **Subir a plan Pro y agregar Google.** Decisiones del dueño, anotadas arriba.
