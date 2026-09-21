# Fase 4 — Modelo de deuda de TC · Plan

Roadmap: [`2026-09-17-reestructuracion-roadmap.md`](2026-09-17-reestructuracion-roadmap.md)
Inventario: [`RESTRUCTURE.md`](../../RESTRUCTURE.md) §2.1, §2.2, §2.3

Un commit por tarea. `tsc`, `lint`, `test` y `test:sql` en verde antes de cada commit.

---

## Lo que dice producción, que cambia el plan

Antes de escribir nada se midió la base real (solo lecturas):

| Dato | Valor | Por qué importa |
|---|---|---|
| Ciclos creados | **2** | |
| Ciclos **cerrados alguna vez** | **0** | `cerrar_ciclo_tc` nunca corrió en producción |
| `sum(deuda_ciclo_anterior)` | **0** | todo lo que hay está en el ciclo abierto |
| Filas con `aplicado_ciclo_anterior <> 0` | **0** | ningún reparto histórico que preservar |
| Filas TC sin reparto guardado | **0** | el backfill de la migración de septiembre está aplicado |
| `gasto_tc` | 91, **7 sin `ciclo_id`** | |
| `pago_tc` | 6, **6 sin `ciclo_id`** | es por diseño: un pago repartido queda en NULL |
| `ciclos_tc.total_cargos + total_pagos` | **0** | confirma §2.2 |

**La consecuencia es grande: no hay historia no-derivable.** El roadmap asumía que 4.2 iba a tener
que aceptar "lo anterior a 4.1 queda con el reparto que tiene" y una fecha de corte en el código.
Con cero cierres, ese costo es **cero**: en el momento en que exista `cerrado_at`, el 100% de la
historia queda reproducible.

Y al revés: **la ventana se cierra con el primer cierre de ciclo.** El día que el usuario toque
"Cerrar ciclo" sin `cerrado_at`, ese tramo de historia deja de ser derivable para siempre. Eso mueve
4.1 de "prerrequisito" a "urgente", y es lo único de esta fase que no conviene demorar.

### La diferencia de "Ysi Visa" sigue ahí, y sigue siendo Q6.50

| Tarjeta | Guardado | Ledger | Diferencia |
|---|---|---|---|
| Mastercard BAC Estudiante | Q254.33 | Q254.33 | — |
| Ysi Visa | **Q865.75** | **Q859.25** | **Q6.50** |
| BAC extension, Bac student | Q0 | Q0 | — |

El saldo subió desde el Q718.10 / Q711.60 de septiembre, y la diferencia es **la misma**: un delta
que entró una vez, no un cálculo que se repite. Sigue sin poder saberse de dónde salió.

## Decisiones

**4.1 va sola y va primero.** Es una columna y un `update`; mezclarla con la derivación retrasaría
lo único urgente detrás de lo más grande.

**La derivación no necesita `ciclo_id` ni `aplicado_*`.** Es el hallazgo que simplifica la fase: si
se reproduce la historia **en orden de `created_at`**, un `gasto_tc` suma al bucket abierto y un
cierre mueve el bucket abierto al anterior. Lo que decide el bucket de un cargo no es su `ciclo_id`
sino si se insertó antes o después del cierre — que es exactamente lo que hizo el trigger. Así:

- los 7 `gasto_tc` sin `ciclo_id` dejan de ser un problema;
- los 6 `pago_tc` sin `ciclo_id` tampoco, y **§2.3 se disuelve** sin tocar la tabla;
- `aplicado_ciclo_anterior` / `aplicado_actual` dejan de ser necesarias para derivar.

**En orden de `created_at`, no de `fecha`.** El trigger aplicó sus deltas en orden de inserción, así
que un cargo con fecha retroactiva ingresado después de un cierre cayó en el ciclo abierto. La
derivación tiene que reproducir eso, no "corregirlo": si ordenara por `fecha` diría algo distinto de
lo que el usuario vio, y la reconciliación marcaría diferencias que no son errores.

**La derivación entra AL LADO del trigger, no en su lugar.** Primero se agrega la función derivada y
una reconciliación que compara derivado contra guardado; el trigger sigue siendo la fuente de
verdad. Cambiar la fuente de verdad de la deuda de una tarjeta de crédito a ciegas, en una base que
no puedo ver con datos reales corriendo, es exactamente el tipo de salto que produjo los defectos
que esta fase viene a cerrar. La reconciliación es además lo que **habría detectado el Q6.50 el día
que entró**.

## Tareas

- [ ] **4.1** `cerrado_at` en `ciclos_tc`, escrito por `cerrar_ciclo_tc`. Migración + `schema.sql` +
      tests de SQL. **Urgente**: cada cierre sin esto es historia que se pierde.
- [ ] **4.2a** `deuda_tc_derivada(p_tarjeta_id)`: la reproducción en orden de `created_at`. Y
      `reconciliar_deuda_tc()`, que compara derivado contra guardado para todas las tarjetas del
      usuario. Los dos al lado del trigger, sin retirar nada.
- [ ] **4.2a-bis** Correr la reconciliación contra producción y reportar.
- [ ] **4.2b** *(después, con evidencia)* Retirar el total corriente: `trg_deuda_tc`, su escape
      hatch, las columnas `aplicado_*` y las columnas `deuda_*`. Condición para arrancarlo: la
      reconciliación en verde **después de al menos un cierre real** de ciclo, para que lo que se
      retire ya haya sido probado contra el caso que lo motiva.
- [ ] **4.3** Se disuelve con 4.2a: la atribución de un pago se deriva, no se estampa. Queda cerrar
      la nota de `RESTRUCTURE.md` cuando 4.2b retire el estampado.
- [ ] **4.4** `ciclos_tc.total_cargos` / `total_pagos`: o se llenan desde la derivación o se borran.
      Va después de 4.2b, porque la respuesta depende de qué quede siendo la fuente.

## Fuera de alcance

- **Bitácora de cambios (`updated_at`, auditoría).** Es lo que habría contestado de dónde salió el
  Q6.50, pero no es lo que pide la fase: con la deuda derivada del ledger, un delta suelto no puede
  volver a aparecer, así que la bitácora deja de ser el arreglo y pasa a ser un lujo.
- **Corregir el Q6.50.** No es una decisión de código: depende de lo que diga el estado de cuenta del
  banco, y las dos formas están en el roadmap. La reconciliación de 4.2a lo deja medido y a la vista.
