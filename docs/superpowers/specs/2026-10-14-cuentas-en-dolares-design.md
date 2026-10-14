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

- [x] `finanzas.ts`: `aMonedaBase`, `convertirMoneda`, `calcTotalCuentas`, `txnsEnMonedaBase`,
      `agruparPorDia` con valuación; tests.
- [x] `lib/tipoCambio.ts`, `useTipoCambio`, `ModalTipoCambio` y `BotonTipoCambio` compartidos.
- [x] Migración `20261014000000_cuentas_moneda.sql` + schema + tests SQL (incluye Apple Pay).
- [x] `useCuentas` (todas, moneda, guarda contra migración sin aplicar) + provider.
- [x] Cuentas, Resumen, hoja de cuenta, "Cambiar saldo", tipo de cambio desde Cuentas.
- [x] Movimientos, transferencias entre monedas, presupuestos, 6 meses, CSV, pago de tarjeta,
      pagos fijos, pagos por categorizar.
- [x] Conector MCP y `/api/atajo`.
- [x] Privacidad, CLAUDE.md, docs.

## Decisiones tomadas al implementar

- **`'GTQ'` es la moneda del perfil, también al mostrar.** Pasar la columna tal cual a
  `formatMoneda` le mostraba "Q" a un perfil en lempiras. `monedaISO` traduce en un lugar
  (`useMoneda`, y `useMonedas` para el símbolo, el código del CSV y el nombre en los textos).
- **Con el perfil en dólares no se ofrece "en dólares"**: convertiría US$ a US$ con el tipo de
  cambio. Una cuenta que ya lo fuera sigue mostrando el selector, para poder devolverla.
- **`profiles.tipo_cambio_usd > 0` es un check**: ahora el total del Resumen convierte en render y
  `usdToGTQ` lanza con 0. El cliente ya no lo escribía así; el check lo vuelve invariante.
- **Apple Pay manda lo que ve, y decide la base.** `/api/atajo` envía un código ISO, o `'$'` para un
  "$" a secas: son dólares salvo en un perfil en pesos (MXN, DOP), y el perfil solo lo conoce el
  RPC. Solo se convierte entre el dólar y la moneda del perfil; otra moneda (euros de un viaje) se
  registra tal cual y la notificación lo avisa. Sin la migración, `/api/atajo` cae a la versión de
  4 parámetros (PGRST202).
- **El pago de tarjeta se filtra en la hoja, no en la base.** Es el único que escribe `pago_tc` (el
  conector no lo hace), y tocar `actualizar_deuda_tc` por esto no compensa el riesgo.
- **Límite conocido:** con un perfil en una moneda que también se escribe "$" (MXN), el dólar y la
  moneda del perfil se ven igual (`currencyDisplay: 'narrowSymbol'`). Las listas de cuentas marcan
  "(US$)" y Cuentas dice "en dólares", pero el monto suelto no los distingue.

