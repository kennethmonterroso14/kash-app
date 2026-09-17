# Fase 1 — Bases internas · Design Spec

Decisiones tomadas que enmarcan esta fase:

- **Shell nativo: Capacitor.** El rediseño de la Fase 3 se hará sobre estos mismos componentes
  React, así que nada de lo que se construya acá se tira.
- **Multi-país, no solo Guatemala.** Esto agrega la tarea 1.6 a la fase, y es la razón por la que
  el contexto de sesión (1.1) tiene que cargar moneda, locale y zona horaria desde el principio.
- **Multi-tenant**, cada usuario con sus datos vía RLS. No hay hogares compartidos.

---

## Problema

Medido sobre el código actual:

| Síntoma | Medición |
|---|---|
| `useCuentas` instanciado por | **6 páginas** |
| `useCategorias` instanciado por | **6 páginas** |
| `useTarjetas` instanciado por | 4 páginas |
| Consultas distintas a `transacciones` | **15** |
| Consultas distintas a `profiles` | **6** |
| Hooks que instancia el Dashboard | **6** |
| Páginas sobre 600 líneas | 4 (612 a 749) |

No hay caché ni store: cada página monta sus hooks y vuelve a pedir lo mismo. Abrir el Dashboard
dispara seis fetch independientes; navegar a Cuentas vuelve a pedir cuentas y categorías.

Y la moneda está cableada en la capa pura: `formatQ` siempre emite `Q` con `es-GT`, `hoyGT()` siempre
asume `America/Guatemala`, y `profiles.moneda` existe sin usarse.

---

## Diseño

### 1. `SesionProvider` — lo que se carga una vez

Va **dentro** del gate de autenticación de `App.tsx`, envolviendo `Layout` y las rutas. Carga en
paralelo, una sola vez por sesión:

```
perfil      → nombre, moneda, locale, zona_horaria, tipo_cambio_usd
cuentas     → las activas del usuario
categorias  → base + las propias del usuario, ya mezcladas
tarjetas    → las activas, con su resumen
```

**Qué NO va en el contexto, y por qué:** `transacciones` y `presupuestos` están acotados por mes
(cachearlos globalmente significaría inventar una caché por mes, que es la Fase 3 si hace falta);
`inversiones` e `historial` solo los usan 2 páginas y son pesados; `ciclos_tc` es por tarjeta.
Esos siguen siendo hooks por página.

### 2. Forma de la API

```ts
const { perfil, cuentas, categorias, tarjetas, cargando, error, refrescar } = useSesion()
```

- `error` por slice, no uno global: que falle el fetch de tarjetas no debe ocultar las cuentas.
- `refrescar.cuentas()` etc. — invalidación **explícita** después de un write. No hay refetch
  automático ni polling: el modelo actual (escribir y refrescar el slice que el trigger tocó) ya
  funciona y se conserva.
- Los writers (`agregarCategoria`, `agregarTC`, …) se mueven al provider, porque son los que tienen
  que invalidar.

### 3. Migración incremental — el punto crítico

Esto toca 6+ páginas. **No se hace de un golpe.** El orden que mantiene la app funcionando y
revisable en cada paso:

1. Crear el provider **usando los hooks existentes por dentro**. Comportamiento idéntico, un solo
   punto de montaje. Nada más cambia.
2. Migrar las páginas **una por una** de `useCuentas(user.id)` a `useSesion().cuentas`. Cada
   migración es un commit verificable por separado.
3. Cuando ninguna página llame a los hooks viejos directamente, colapsarlos dentro del provider.

El paso 1 ya elimina la duplicación (el provider monta cada hook una vez); los pasos 2 y 3 son
limpieza. Si algo se complica, se puede parar después de cualquier paso y la app queda consistente.

### 4. Moneda y locale — preservando la pureza

`formatQ` tiene 48 tests y es pura. **No debe leer el contexto**: eso rompería las dos cosas.

```ts
// finanzas.ts — pura, parametrizada, testeable
formatMoneda(centavos: number, opts: { moneda: string; locale: string }): string

// hooks/useMoneda.ts — currifica con lo del perfil
const fmt = useMoneda()      // fmt(150000) → "Q1,500.00" | "$1,500.00" | "L1,500.00"
```

`formatQ` queda como alias de `formatMoneda(c, { moneda: 'GTQ', locale: 'es-GT' })` para no romper
los tests existentes ni los sitios sin migrar, y se retira cuando no queden llamadas.

Lo mismo con fechas: `hoyGT()` → `hoyEn(zonaHoraria)`, con `hoyGT()` como alias. **Esto es más
delicado que la moneda**: de ahí salen los límites de mes de todas las consultas, así que cambiar la
zona horaria de un usuario mueve qué transacciones caen en qué mes. Se parametriza ahora y se prueba
con los tests de 1.4; no se expone un selector de zona horaria en la UI hasta la Fase 2.

**Fuera de alcance en esta fase:** conversión entre monedas arbitrarias. Hoy
`profiles.tipo_cambio_usd` convierte USD→GTQ y solo lo usan las inversiones. Un modelo general de
tasas (base + N monedas) es Fase 4 o 5; acá solo se parametriza el **formateo** y se deja la
conversión como está.

### 5. Partición de páginas

Se extrae por sección — la lista, cada modal, cada tarjeta — **manteniendo el estado donde está**.
Sin inventar todavía una abstracción de modal ni de formulario: eso es la Fase 3.2, con el sistema
de diseño, y abstraer antes de partir sería abstraer sobre la estructura equivocada.

La migración de `formatQ` a `useMoneda` viaja junto con esta partición, no como barrido aparte: ya se
está tocando cada archivo.

### 6. Tests

`@testing-library/react` sobre Vitest y jsdom, que ya están. Se empieza por **lo que ya falló**, no
por lo fácil:

1. Carry-over de presupuestos — que no resucite lo borrado, que no escriba en meses futuros, que el
   banner y "Deshacer" sí sean alcanzables.
2. `useAutoApplyPagos` — idempotencia por mes al editar `dia_del_mes`, el compare-and-swap, y que un
   insert fallido no avance `ultima_aplicacion`.
3. Reparto de deuda de TC en insert / update / delete.
4. Carreras de cambio de mes — que una respuesta lenta no pinte el mes equivocado.

---

## Criterios de terminado

- Abrir el Dashboard dispara **una** consulta de perfil, cuentas, categorías y tarjetas — no seis.
- Ninguna página recibe el objeto `User`; todas leen del contexto.
- Ningún `window.location.reload()` en `src/`.
- Ninguna página sobre 300 líneas.
- `formatQ` sin llamadas propias (solo el alias) y `formatMoneda` cubierto por tests con al menos
  tres monedas.
- Tests de hooks para los cuatro escenarios de arriba, y `npm test` / `lint` / `tsc` en verde.
