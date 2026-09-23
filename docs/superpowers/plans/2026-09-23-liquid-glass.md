# Plan: Liquid Glass en toda la app

Diseño aprobado en el canvas "Vorta — Liquid Glass" (claude.ai/artifact/G27UKuB3z41cw5SgMsktnJ).
Decisiones del dueño: fondo oscuro con brillos de color · vidrio también en las tarjetas de
contenido · tema claro y oscuro (sigue al sistema) · SF Pro · acento morado · referencias Bolsa,
Salud/Fitness y Music/Fotos de iOS 26.

## Fase A — Base (cambia todas las pantallas a la vez)
- [x] Tokens por tema: `temas.oscuro` / `temas.claro` en `tokens.js`; Tailwind los vuelca a
      variables CSS (`--c-*`, `--m-*`, `--b-*`, `--s-*`) en `:root` y en `prefers-color-scheme: light`.
      Las clases (`bg-accent/15`, `text-textDim`, …) no cambian.
- [x] `useColores()` para las gráficas (Recharts necesita colores reales en props).
- [x] SF Pro (pila del sistema) en lugar de Poppins: se borran los woff2 y los `@font-face`;
      `tabular-nums` pasa a alinear de verdad.
- [x] Fondo con brillos (capa fija detrás de todo) y `theme-color` por tema.
- [x] Las tarjetas de contenido (`bg-surface`) pasan a `.vidrio-panel`.

## Fase B — Estructura
- [x] Sin header fijo: títulos grandes por pantalla (34 pt) con su acción a la derecha; el engranaje
      de Ajustes vive en el título de Resumen.
- [x] El riel de pestañas de Patrimonio/Plan pasa a control segmentado de vidrio.

## Fase C — Pantallas
- [ ] Resumen: patrimonio grande + línea de 6 meses, tiles Ingresos/Gastos/Ahorro, anillos de
      presupuesto, próximo pago, últimos movimientos.
- [ ] Movimientos: buscador, mes y filtro en cápsulas, lista agrupada por día.
- [ ] Tarjetas: tarjetas apiladas estilo Wallet + panel del ciclo.
- [ ] Patrimonio: total + barras por mes + lista de cuentas.
- [ ] Hoja de nuevo movimiento: monto grande, categorías en círculos.

Cada fase: `tsc` · `eslint` · tests · build, y capturas de la app real (Supabase simulado) en
oscuro y claro antes del commit.
