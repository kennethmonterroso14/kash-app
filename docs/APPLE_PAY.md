# Pagos con Apple Pay que se registran solos

Cada pago con Apple Pay en tienda se registra en Vorta sin tocar nada, vía la automatización
**Transacción** de la app Atajos (iOS 17+). Diseño: `docs/superpowers/specs/2026-09-25-apple-pay-atajo-design.md`.

## Cómo funciona

```
Pago con Apple Pay ─▶ Atajos "Transacción" ─POST /api/atajo
    { "clave": "vorta_…", "monto": "Q45.00", "comercio": "Super La Torre", "tarjeta": "Visa BI" }
/api/atajo ─ sha256(clave), importe → centavos ─▶ rpc registrar_pago_atajo (rol anon)
◀── texto: "Vorta ✓ Q45.00 · BAC Débito. Abre Vorta para elegir la categoría."
```

**La categoría la elige la persona.** El pago se registra al instante (saldo y deuda al día) con la
categoría aprendida del comercio como sugerencia, y queda en `pagos_por_categorizar`. Un aviso
global del Layout (`PagosPorCategorizar`) abre una hoja para confirmarla o cambiarla, pago por pago;
`categorizar_pago()` (§14) cambia solo la categoría sin tocar el reparto de deuda.

- `api/atajo.ts` — handler de Vercel; lógica en `api/_lib/atajo.ts` (lee la clave del cuerpo —
  lo que enseña la app, un campo más del JSON — o de un `Authorization: Bearer`, entiende el importe en cualquier idioma, arma el texto de respuesta). Tests en
  `api/_lib/atajo.test.ts`.
- `registrar_pago_atajo` (`schema.sql` §13) — `security definer`, ejecutable solo por `anon`.
  Resuelve la persona por el hash de la clave y registra UN gasto: a una cuenta (`gasto`) o a una
  tarjeta de crédito (`gasto_tc` en el ciclo abierto, que abre si falta). Categoría aprendida del
  último gasto con el mismo comercio; un reintento en 2 minutos no duplica. Tests en
  `supabase/tests/atajo_apple_pay.sql`.
- **Moneda.** `leerMonedaImporte` saca la moneda del texto ("US$20.00" → USD, "Q45.00" → GTQ,
  "L45.00" → HNL; "$20.00" → `'$'`) y el RPC la recibe en `p_moneda`. Si es el dólar o la moneda
  del perfil y no coincide con la de la cuenta o tarjeta destino, convierte con
  `profiles.tipo_cambio_usd` y la respuesta trae lo pagado (`$20.00 → Q155.00`). Un "$" a secas son
  dólares, salvo en un perfil en pesos (MXN, DOP). Otra moneda (un pago en euros) se registra tal
  cual y la notificación avisa. Sin la migración `20261014000000_cuentas_moneda.sql`, `api/atajo.ts`
  cae a la versión de 4 parámetros (sin conversión). Tests en `supabase/tests/cuentas_moneda.sql`.
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
