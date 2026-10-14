# Diseño: cuentas en dólares

**Pedido:** que una cuenta pueda ser en dólares (al crearla y después, editándola), y que el total
en quetzales del Resumen las sume convertidas con el **mismo tipo de cambio de Inversiones**, el
que se actualiza desde la API ("Usar el tipo de cambio de hoy") y se puede volver a poner a mano.

## Modelo

- `cuentas.moneda text not null default 'GTQ'`, con check `in ('GTQ', 'USD')` — la misma
  convención que `inversiones.moneda`. `'GTQ'` es la moneda del perfil.
- **El saldo y TODOS los movimientos de una cuenta están en la moneda de la cuenta.** El trigger
  de saldo no cambia: suma `cantidad` como siempre. Una cuenta USD guarda centavos de dólar.
- **Un solo tipo de cambio**: `profiles.tipo_cambio_usd` (centavos de quetzal por US$1). Ya era el
  de Inversiones; ahora también convierte cuentas. Su lógica (guardar a mano, consultar la API)
  sale de `useInversiones` a `useTipoCambio`, y la hoja `ModalTipoCambio` a `components/`, para
  usarla desde Cuentas e Inversiones.

## Qué se convierte y dónde

Todo lo que **suma** pasa a la moneda del perfil con el tipo de cambio vigente; todo lo que
**muestra** una cuenta o un movimiento usa la moneda de su cuenta.

| Lugar | Cambio |
|---|---|
| `totalPatrimonio` (Resumen, Cuentas, Disponible real, Patrimonio neto, Proyecciones) | `calcTotalCuentas`: las USD convertidas |
| Estadísticas del mes, gráfica por categoría, presupuestos, neto del día, 6 meses | cada movimiento de una cuenta USD convertido antes de sumar |
| Filas de movimientos, últimos movimientos, saldo por cuenta, chips del Resumen | en la moneda de la cuenta (US$) |
| CSV | columna `moneda`; la cantidad queda en su moneda |

Para saber la moneda de un movimiento, `useCuentas` lee **todas** las cuentas (también las
archivadas, que tienen historial) y el provider expone `monedasCuentas`. Así no hace falta un
join en cada consulta de movimientos.

Convertir con el tipo de cambio **de hoy** también los meses pasados es una aproximación, y se
acepta: es lo mismo que ya hace Inversiones, y guardar el tipo de cada movimiento sería otro
proyecto.

## Escrituras entre monedas

- **Transferencia** entre una cuenta en quetzales y una en dólares: cada pata en su moneda. La hoja
  pide "Llega" en la moneda destino, propuesto con el tipo de cambio y editable (el banco usa el
  suyo).
- **Pago de tarjeta** (`pago_tc`): el trigger usa el MISMO monto para la cuenta y la deuda, así que
  solo se paga desde cuentas en la moneda de la tarjeta (quetzales). Las USD no aparecen ahí.
- **Cambiar la moneda de una cuenta existente** la re-etiqueta: los números no se convierten (es el
  caso de "registré mi cuenta de dólares como quetzales"). La hoja lo dice antes de guardar y remite
  a "Cambiar saldo" si el saldo real es otro.
- **Apple Pay**: el importe trae su moneda ("Q45.00", "$45.00"). Si no coincide con la de la cuenta
  destino, el RPC lo convierte con el tipo de cambio del perfil.
- **Conector MCP**: los montos van en la moneda de cada cuenta; el resumen del mes convierte; una
  transferencia entre monedas acepta `monto_recibido` (si falta, convierte con el tipo vigente).

## Plan

- [ ] `finanzas.ts`: `aMonedaBase`, `convertirMoneda`, `calcTotalCuentas`, `txnsEnMonedaBase`,
      `agruparPorDia` con valuación; tests.
- [ ] `lib/tipoCambio.ts`, `useTipoCambio`, `ModalTipoCambio` y `BotonTipoCambio` compartidos.
- [ ] Migración `20261014000000_cuentas_moneda.sql` + schema + tests SQL (incluye Apple Pay).
- [ ] `useCuentas` (todas, moneda, guarda contra migración sin aplicar) + provider.
- [ ] Cuentas, Resumen, hoja de cuenta, "Cambiar saldo", tipo de cambio desde Cuentas.
- [ ] Movimientos, transferencias entre monedas, presupuestos, 6 meses, CSV, pago de tarjeta,
      pagos fijos, pagos por categorizar.
- [ ] Conector MCP y `/api/atajo`.
- [ ] Privacidad, CLAUDE.md, docs.
