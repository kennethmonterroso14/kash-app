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

- [x] **3.2.1** `Hoja` y `Dialogo`; migrar los 14 modales.
- [x] **3.2.2** `Campo`; migrar los formularios. Salieron 22 sitios, no 14: cuatro páginas
      (`Categorias`, `Login`, `Setup`, `Proyecciones`) nunca habían pasado por `CLASE_INPUT` y
      tenían sus propias ocho etiquetas sin `htmlFor`.
- [x] **3.2.3** `BotonConfirmar`; migrar los 9 sitios.
- [x] **3.2.4** `EstadoVacio` y `Aviso`; 8 estados vacíos y 31 avisos.
- [x] **3.2.5** Tests de los primitivos: 27 casos en `Campo.test.tsx`, `BotonConfirmar.test.tsx`,
      `Hoja.test.tsx` y `Aviso.test.tsx`. Verificados por mutación, uno por primitivo:
      quitar el `clearTimeout` del desmonte, el `htmlFor` del label y el `role="alert"` del aviso
      rompe 1, 5 y 2 casos respectivamente.
- [x] **3.2.6** Verificar con capturas que ninguna hoja cambió de forma. Ver abajo.

## 3.2.6 — la verificación

Las 14 hojas montadas aisladas contra una sesión de mentira, en Chromium a 390×844 y DPR 2,
19 estados en total (alta y edición donde el modal hace las dos). No se midió a ojo: el arnés
mide el DOM y falla si algo se desborda.

| Qué se comprobó | Resultado |
|---|---|
| Desborde horizontal de la página | ninguno, en los 19 |
| El ✕ dentro de la hoja | dentro, en los 18 que lo tienen (el `Dialogo` no lleva) |
| La hoja pegada al borde inferior | `bottom = 844` en los 18 |
| Contenido recortado por el `max-h` | `scrollHeight == clientHeight` en los 19: nada se corta |
| Título largo | con "Mastercard Platinum Banrural Empresarial" el título se elide y el ✕ **no** se sale; antes lo empujaba fuera |

Alturas: de 228px (`presupuesto-edit`) a 677px (`inversion-edit`), todas por debajo del 92dvh
(776px), así que el scroll de la hoja no se activa con este contenido — pero sigue ahí para
cuando el teclado reduzca el viewport.

**Lo que esto NO verifica**, y sigue necesitando hardware: `env(safe-area-inset-bottom)` vale 0
en Chromium de escritorio, así que el `pb-[calc(1.5rem+env(...))]` no se puede ver funcionar;
tampoco el costo por frame del `backdrop-filter` en el WebView de Capacitor ni el zoom del input
en iOS. El arnés era temporal y no quedó en el repo.

## Lo que la migración encontró

No se buscaba nada de esto; salió al mover el código:

| Defecto | Dónde |
|---|---|
| "Archivar tarjeta" sin confirmación: **un toque archivaba la TC** | `ModalTC` |
| 14 controles con `placeholder` y sin etiqueta | las hojas de tarjetas e inversiones |
| 8 `<label>` sin `htmlFor`, sin asociar a nada | `Categorias`, `Login`, `Setup`, `Proyecciones` |
| 12 avisos de error sin `role="alert"` | 8 archivos |
| `id` fijos (`inv-fecha`, `inv-fecha-update`): duplicados con dos instancias | `ModalInversion`, `ModalActualizarValor` |
| Ninguna de las 14 hojas cerraba con Escape, ni tenía `role="dialog"` | todas |
| Sin `autoComplete` en correo y contraseña | `LoginPage`, `SetupPage` |
| `stopPropagation` no frena a los demás listeners del mismo nodo, así que dos capas se cerraban con un Escape | `useCerrarConEscape`, mientras se escribía |

El último lo encontró el test, no la lectura del código: el comentario del hook afirmaba lo
contrario de lo que hacía. Hace falta `stopImmediatePropagation`.

## Fuera de alcance

- **Movimiento.** Los primitivos quedan listos para animarse (un solo lugar donde hacerlo), pero
  acá no se anima nada: eso necesita la librería de resortes y es la tarea siguiente.
- **`Money`.** `useMoneda()` ya ES el primitivo del dinero; envolverlo en un componente no agrega
  nada. El `Monto` del dashboard se queda donde está porque lo suyo es el modo privado, no el
  formateo.
