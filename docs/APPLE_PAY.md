# Pagos con Apple Pay que se registran solos

Cada pago con Apple Pay en tienda se registra en Vorta sin tocar nada, vía la automatización
**Transacción** de la app Atajos (iOS 17+). Diseño: `docs/superpowers/specs/2026-09-25-apple-pay-atajo-design.md`.

## Cómo funciona

```
Pago con Apple Pay ─▶ Atajos "Transacción" ─POST /api/atajo  (Authorization: Bearer <clave>)
    { "monto": "Q45.00", "comercio": "Super La Torre", "tarjeta": "Visa BI" }
/api/atajo ─ sha256(clave), importe → centavos ─▶ rpc registrar_pago_atajo (rol anon)
◀── texto: "Vorta ✓ Q45.00 · Supermercado · BAC Débito"   (el atajo lo muestra)
```

- `api/atajo.ts` — handler de Vercel; lógica en `api/_lib/atajo.ts` (lee la clave del encabezado o
  del cuerpo, entiende el importe en cualquier idioma, arma el texto de respuesta). Tests en
  `api/_lib/atajo.test.ts`.
- `registrar_pago_atajo` (`schema.sql` §13) — `security definer`, ejecutable solo por `anon`.
  Resuelve la persona por el hash de la clave y registra UN gasto: a una cuenta (`gasto`) o a una
  tarjeta de crédito (`gasto_tc` en el ciclo abierto, que abre si falta). Categoría aprendida del
  último gasto con el mismo comercio; un reintento en 2 minutos no duplica. Tests en
  `supabase/tests/atajo_apple_pay.sql`.
- `atajo_claves` guarda solo el SHA-256 de la clave (una por persona); la clave se genera en el
  navegador (`lib/claveAtajo.ts`) y se muestra una vez. `atajo_tarjetas` mapea el nombre de Wallet
  a su destino; una tarjeta desconocida se agrega sola "sin asignar" y ese pago no se registra.
- **Sin service role.** La función llama con la clave pública; la autorización es el hash.

## Para la persona

Ajustes → Apple Pay: crear la clave, asignar cada tarjeta de Wallet y seguir los pasos para armar
la automatización. Solo pagos con Apple Pay en tienda (iPhone o Watch): la tarjeta física y
muchas compras en línea no disparan la automatización. Se configura en cada iPhone.

## Seguridad

- La clave solo registra gastos de su dueño: no lee, no edita, no borra. Quien la robe puede
  anotar gastos falsos, nada más; regenerarla la invalida al instante.
- El advisor de Supabase marca `registrar_pago_atajo` como `security definer` ejecutable por
  `anon`: es a propósito (el atajo no tiene sesión) y el hash de 256 bits es la autorización.
