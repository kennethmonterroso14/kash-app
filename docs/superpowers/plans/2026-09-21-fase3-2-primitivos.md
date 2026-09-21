# Fase 3.2 — Primitivos de UI · Plan

Roadmap: [`2026-09-17-reestructuracion-roadmap.md`](2026-09-17-reestructuracion-roadmap.md)

Un commit por tarea. `tsc`, `lint` y `test` en verde antes de cada commit.

---

## La duplicación, medida

No estimada: contada sobre el código después de la partición de 1.4.

| Patrón | Copias | Síntoma |
|---|---|---|
| Esqueleto de hoja (`scrim` + contenedor + encabezado + ✕) | **14 archivos** | **5 variantes** del mismo contenedor: `p-5` vs `p-6`, con y sin `max-w-lg`, con y sin scroll |
| `CLASE_INPUT` | **63 usos** en 14 archivos | el `<label htmlFor>` va aparte, así que se olvida |
| Borrado en 2 taps | **9 archivos** | cada uno con su `useState` y su `setTimeout` |
| Estado vacío | **8 archivos** | icono, título, pista y botón, cada vez a mano |
| Aviso de error (`role="alert"` rojo) | ~8 sitios | |

El costo no es estético: **un cambio visual cuesta catorce ediciones**, y ahí es donde se cuelan las
inconsistencias. Las cinco variantes del contenedor de hoja no las decidió nadie — aparecieron.

## Por qué ahora y no antes

La Fase 1 dejó esto explícitamente para después: *"sin inventar todavía una abstracción de modal ni
de formulario: abstraer antes de partir sería abstraer sobre la estructura equivocada"*. Con las
páginas partidas, la estructura correcta ya está visible y los primitivos salen de ella.

## Decisiones

**`Hoja` y `Dialogo` son dos componentes, no uno con una prop.** Una hoja entra desde abajo y un
diálogo de confirmación aparece en el centro: son formas distintas con orígenes distintos, y
`apple-design` §7 pide que lo que entra por un lado salga por el mismo. Una sola prop `variante`
esconde que son dos animaciones diferentes cuando llegue el movimiento.

**`Campo` renderiza el input, no lo recibe.** La alternativa (pasar el `id` al hijo por render-prop)
es más flexible y no resuelve el problema real: que el `htmlFor` se olvide. Si el primitivo es dueño
del `<label>`, del `id` y del input, la asociación no se puede romper. Cubre texto, número, fecha y
select, que es todo lo que usan estos formularios.

**`BotonConfirmar` se queda con el timeout.** Hoy cada sitio tiene su `useState` y su `setTimeout`
de 3s, y ninguno lo limpia al desmontar — un `setState` sobre un componente desmontado.

## Tareas

- [ ] **3.2.1** `Hoja` y `Dialogo`; migrar los 14 modales.
- [ ] **3.2.2** `Campo`; migrar los formularios.
- [ ] **3.2.3** `BotonConfirmar`; migrar los 9 sitios.
- [ ] **3.2.4** `EstadoVacio` y `Aviso`; migrar los ~16 sitios.
- [ ] **3.2.5** Tests de los primitivos: que `Campo` asocie label e input, que `BotonConfirmar`
      necesite dos taps y se rinda solo, y que `Hoja` cierre con el scrim y con Escape.
- [ ] **3.2.6** Verificar con capturas que ninguna hoja cambió de forma.

## Fuera de alcance

- **Movimiento.** Los primitivos quedan listos para animarse (un solo lugar donde hacerlo), pero
  acá no se anima nada: eso necesita la librería de resortes y es la tarea siguiente.
- **`Money`.** `useMoneda()` ya ES el primitivo del dinero; envolverlo en un componente no agrega
  nada. El `Monto` del dashboard se queda donde está porque lo suyo es el modo privado, no el
  formateo.
