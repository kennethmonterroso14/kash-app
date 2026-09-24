# Diseño: registrar solos los pagos con Apple Pay

**Pedido:** que cada pago con Apple Pay se registre en Vorta sin tocar nada. Decisión del dueño:
**directo** — se registra al momento, sin bandeja "Por revisar".

## Por qué con un Atajo

Una app web no puede leer las notificaciones del iPhone (ninguna app puede). Lo que sí existe es
la automatización **Transacción** de la app Atajos (iOS 17+): se dispara al pagar con una tarjeta
de Wallet y entrega **importe, comercio y nombre de la tarjeta**. La automatización de cada
persona hace un POST a Vorta con esos tres datos.

Límites que se dicen en la app: solo pagos con Apple Pay en tienda (no la tarjeta física ni
todas las compras en línea); se configura a mano en cada iPhone.

## Flujo

```
iPhone paga ─▶ Atajo "Transacción" ─POST /api/atajo  (Authorization: Bearer <clave>)
   { monto: "Q45.00", comercio: "Super La Torre", tarjeta: "Visa BI" }
/api/atajo ─ sha256(clave) + monto en centavos ─▶ rpc registrar_pago_atajo (rol anon)
   └─ busca la persona por el hash, la tarjeta de Wallet → cuenta o tarjeta de crédito,
      adivina la categoría, inserta en `transacciones` ─▶ triggers de saldo / deuda
◀── texto plano "Vorta: Q45.00 · Supermercado · BAC Débito" (el atajo lo muestra)
```

## Decisiones

- **Clave personal, no OAuth.** Un atajo no puede hacer un login OAuth. La clave es aleatoria de
  256 bits, se genera en el navegador, se muestra **una sola vez** y en la base solo queda su
  SHA-256 (`atajo_claves`, una por persona). Regenerarla invalida la anterior.
- **Sin service role.** `/api/atajo` llama con la clave pública (anon) a un RPC `security definer`
  que resuelve la persona por el hash. Lo único que ese RPC sabe hacer es registrar UN gasto de
  esa persona: con la clave no se lee ni se borra nada.
- **Tarjeta de Wallet → destino** (`atajo_tarjetas`): cada nombre de Wallet va a una cuenta
  (`gasto`) o a una tarjeta de crédito (`gasto_tc`, en su ciclo abierto; si no hay, se abre con la
  misma lógica que `cerrar_ciclo_tc`). Un cargo **sin** `ciclo_id` no se permite: el cierre solo
  migra el reparto de los cargos enlazados a su ciclo.
- **Tarjeta desconocida:** no se registra (no hay adónde), se agrega a la lista como "sin asignar"
  y la respuesta dice dónde asignarla. Es la única vez que un pago se pierde, y se avisa en el
  momento.
- **Categoría:** la del último gasto con la misma descripción (el comercio); si no hay, "Otros".
- **Doble disparo:** un pago idéntico (comercio, monto, destino) en los últimos 2 minutos no se
  duplica.
- **Fecha:** hoy en la zona del perfil.
- Las tablas nuevas siguen las reglas de la casa: RLS `own`, y su par `_ia_update`/`_ia_delete`.

## Plan

- [x] Migración `20260925000000_atajo_apple_pay.sql` + `schema.sql` (tablas, RLS, RPC) y test SQL.
- [x] `api/atajo.ts` + `api/_lib/atajo.ts` (importe → centavos, hash, respuesta en texto) con tests.
- [x] Ajustes → Apple Pay: clave, tarjetas de Wallet y los pasos del atajo.
- [x] Privacidad, `docs/APPLE_PAY.md`, CLAUDE.md.
