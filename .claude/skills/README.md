# Skills de diseño (vendorizadas)

Copiadas tal cual de [`emilkowalski/skills`](https://github.com/emilkowalski/skills),
commit `85e8e2363b713506e1d5b6e07a0eb2da66be1bc3`. **No editar acá**: son upstream.
Para actualizarlas, volver a copiar desde ese repo (o `npx skills@latest add emilkowalski/skills`)
y anotar el commit nuevo en esta línea.

Las que aplican a este proyecto:

- **`apple-design`** — es la que rige el rediseño. De ahí salen los materiales
  translúcidos y las sombras de `src/lib/tokens.js` (§12), las curvas y resortes
  (§4–§6), el tracking por tamaño (§15) y los `prefers-reduced-*` (§14).
- **`mobile-native`** — la base de `src/index.css`: tap highlight, `touch-action`,
  inputs de 16px, `dvh`, `overscroll-behavior`, safe areas. Relevante doble acá
  porque la app va a correr dentro de un WebView de Capacitor.
- **`animate`**, **`review-animations`**, **`animation-vocabulary`**,
  **`find-animation-opportunities`**, **`improve-animations`** — para cuando el
  rediseño llegue a las transiciones.
- **`pick-ui-library`** — antes de meter cualquier dependencia de UI.

`animate-expo` y `write-swift` no aplican hoy (no hay React Native; el shell
nativo de Capacitor casi no se toca), pero se dejan para no divergir del upstream.
