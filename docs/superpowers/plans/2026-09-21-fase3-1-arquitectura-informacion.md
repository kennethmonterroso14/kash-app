# Fase 3.1 — Arquitectura de información · Plan

Roadmap: [`2026-09-17-reestructuracion-roadmap.md`](2026-09-17-reestructuracion-roadmap.md)

Un commit por tarea. `tsc`, `lint` y `test` en verde antes de cada commit.

---

## El problema, dicho con precisión

No es que seis secciones estén escondidas detrás de Perfil. Es que **las once son tres tipos de
cosa distintos mezclados**, y `Perfil` terminó siendo el cajón donde cae lo que no entró en la nav:

| Tipo | Secciones |
|---|---|
| Registro y consulta diaria | Movimientos, Cuentas, Tarjetas |
| Planeación | Presupuesto, Metas, Proyecciones, Inversiones |
| Configuración | Pagos Fijos, Categorías, la cuenta |

`apple-design` §6 lo nombra directo: *"burying everything in one place looks minimal but isn't
simple"*. Y la regla de wayfinding pide que cada pantalla conteste dónde estoy, a dónde puedo ir,
qué hay ahí y cómo salgo — hoy tres secciones necesitan tres taps para encontrarse.

## La estructura elegida

Cinco destinos, cada uno una pregunta. La configuración sale de la nav porque **no es un destino**:

```
Resumen       ¿cómo estoy?
Movimientos   registrar y revisar
Tarjetas      ¿cuánto debo y cuándo vence?
Patrimonio    lo que tengo      → Cuentas · Inversiones
Plan          a dónde voy       → Presupuesto · Metas · Proyecciones

⚙ (header)    Pagos Fijos · Categorías · Cuenta
```

Por qué esas dos agrupaciones y no otras:

- **Tarjetas sube a la nav** porque es la única sección con *vencimientos*: plata que se debe en una
  fecha. Ya tiene su banner de alertas global; que viva a tres taps era incoherente.
- **Cuentas + Inversiones** contestan lo mismo — cuánto tengo — en dos horizontes. El Dashboard ya
  las suma en un solo número (patrimonio neto).
- **Presupuesto + Metas + Proyecciones** son "a dónde voy". El roadmap ya anotaba que *"Metas y
  Proyecciones son la misma pregunta vista distinto"*.

## Decisiones de implementación

**Las pestañas van en la URL, no en estado local.** `/patrimonio/cuentas` y no `/patrimonio` con un
`useState`: así el botón de atrás funciona, el enlace se puede compartir y un refresh no pierde la
pestaña. Se resuelve con rutas anidadas y `<Outlet>`.

**Las rutas viejas se conservan como redirecciones.** `/cuentas`, `/inversiones`, `/budget`,
`/metas`, `/proyecciones`, `/dashboard` y `/perfil` siguen funcionando: pueden estar en un atajo de
la PWA instalada o en un bookmark, y romperlos por un cambio de nav es gratuito de evitar.

**El riel de pestañas NO es sticky ni lleva vidrio propio.** Va en el contenido y scrollea con él.
Apilar un segundo material pesado debajo del header viola §12 ("never stack a light translucent
surface on another"), y un riel sticky bajo un header sticky es justo eso. Es además lo que hacen
las apps de Apple con los controles segmentados: viven en el contenido.

## Tareas

- [x] **3.1.1** `SeccionConPestanas`: el riel segmentado + `<Outlet>`. Con `aria-current` en la
      pestaña activa y `role="tablist"` **no** — son enlaces de navegación, no pestañas ARIA, y
      mentir el rol rompe la semántica que el lector de pantalla ya entiende.
- [x] **3.1.2** Rutas: `/patrimonio/*`, `/plan/*`, `/ajustes`, `/resumen`, más las redirecciones de
      las siete rutas viejas.
- [x] **3.1.3** `Layout`: la nav de cinco con las etiquetas nuevas y el engranaje en el header.
- [x] **3.1.4** `PerfilPage` → `AjustesPage`: la lista queda solo con lo que es configuración
      (Pagos Fijos, Categorías) más la cuenta y cerrar sesión.
- [x] **3.1.5** Quitar de las páginas los títulos que ahora duplican el riel o la nav
      ("Inversiones", "Metas de ahorro", "Pagos Fijos", "Tarjetas de Crédito").
- [x] **3.1.6** Verificar con capturas: los cinco destinos, las dos secciones con pestañas, el
      engranaje, y que las redirecciones viejas caigan donde deben.

## Lo que salió al implementarlo

- **`NavLink` no sirve para el nav de abajo.** En React Router 7 fija
  `aria-current="page"` sin opción de cambiarlo, así que en una ruta con pestañas quedaban DOS
  elementos contestando "¿cuál es la página actual?": el item de nav y la pestaña. El nav pasa a
  `Link` con el activo calculado a mano y dice `location` cuando la sección tiene pestañas.
  Verificado en el DOM: `/plan/metas` da `["Metas=page","Plan=location"]`.
- **El `<Outlet>` quedó FUERA del contenedor del riel.** Con el riel y el contenido en el mismo
  `max-w-lg px-4`, y cada página con su propio wrapper, el gutter se duplicaba a 32px.
- **Dos páginas mostraban su botón de acción dos veces** cuando la lista estaba vacía: el del
  encabezado y el del estado vacío. Ahora el de arriba solo aparece si hay algo que listar.
- **`PagosRecurrentesPage` no tenía forma de volver.** Se alcanza desde Ajustes y no hay riel ni
  nav que la marque, así que la pantalla tenía que decir cómo salir (wayfinding).
- **Un engranaje dibujado y no un emoji** en el header: el emoji cambia de forma y de color según
  la plataforma, y ese es cromo, no contenido.

## Fuera de alcance, a propósito

- **Iconos.** La nav sigue con los glifos actuales. Cambiar a un set coherente es un ítem aparte del
  repaso visual; mezclarlo acá haría el diff imposible de revisar.
- **Movimiento.** Las transiciones entre pestañas y entre secciones son la tarea de movimiento, que
  necesita una librería de resortes. Acá no se anima nada nuevo.
- **Fusionar Metas y Proyecciones en una sola pantalla.** Comparten la pregunta, pero son dos flujos
  distintos (una registra, la otra simula). Quedan como pestañas hermanas; fusionarlas de verdad es
  una decisión de producto que conviene tomar después de usarlas juntas un rato.
