-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: deuda de TC derivada del ledger (tarea 4.2a)
-- Archivo: supabase/migrations/20260921010000_deuda_tc_derivada.sql
--
-- ESTADO: PENDIENTE de aplicar. Correr a mano en Supabase → SQL Editor →
-- New query, con NADA seleccionado.
--
-- ORDEN: después de 20260921000000_cerrado_at_en_ciclos_tc.sql, que crea la
-- columna `cerrado_at` de la que esto depende.
--
-- QUÉ AGREGA
--   Tres funciones de SOLO LECTURA (pasos 1 a 3) y UNA corrección de dato
--   (paso 4). No crea ni borra columnas, no cambia el trigger y no cambia
--   ningún saldo: la fuente de verdad de la deuda sigue siendo
--   `tarjetas_credito.deuda_*`.
--
--     · deuda_tc_derivada(tarjeta_id)   — reproduce la deuda desde el ledger.
--     · reconciliar_deuda_tc()          — guardado vs derivado, por tarjeta.
--     · verificar_reparto_tc(tarjeta_id) — ¿el reparto guardado de cada pago
--                                          es posible? Cubre el punto ciego de
--                                          comparar totales.
--
-- POR QUÉ ENTRA AL LADO Y NO EN LUGAR DEL TRIGGER
--   Cambiar la fuente de verdad de la deuda de una tarjeta de crédito sin
--   haber comparado las dos primero es el tipo de salto que produjo los
--   defectos que la Fase 4 viene a cerrar. Retirar el total corriente es la
--   tarea 4.2b, y su condición de arranque es que esto quede en verde después
--   de al menos un cierre real de ciclo.
--
-- PARA QUÉ SIRVE HOY. Después de aplicar:
--
--     select * from reconciliar_deuda_tc();
--     select t.nombre, v.* from tarjetas_credito t
--       cross join lateral verificar_reparto_tc(t.id) v;
--
--   La segunda consulta tiene que devolver CERO filas. Cada fila es un pago
--   cuyo reparto guardado excede la deuda que había en el momento, o sea una
--   fila que al borrarse devolvería deuda que el pago nunca quitó.
-- ══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- 9. RPC: deuda de TC DERIVADA del ledger  (tarea 4.2a)
--
--    Reproduce la historia de la deuda de una tarjeta desde `transacciones` +
--    `ciclos_tc`, sin leer `tarjetas_credito.deuda_*`. Es la alternativa al
--    total corriente que mantiene `trg_deuda_tc`, y la razón es RESTRUCTURE
--    §2.1: un delta mal aplicado en un total corriente no se detecta y no se
--    puede reconstruir, y de ahí salieron los tres defectos críticos de TC.
--
--    POR AHORA CONVIVE CON EL TRIGGER. La fuente de verdad sigue siendo
--    `tarjetas_credito.deuda_*`; esto se agrega al lado para poder COMPARAR
--    (ver `reconciliar_deuda_tc`). Cambiar la fuente de verdad de la deuda de
--    una tarjeta de crédito sin haber comparado primero es el tipo de salto
--    que produjo los defectos que esta fase viene a cerrar.
--
--    ── Cómo deriva ──
--    Se ordenan tres clases de evento y se recorren una vez:
--      · gasto_tc → suma al bucket ABIERTO
--      · pago_tc  → liquida primero el bucket ANTERIOR y el sobrante baja el
--                   abierto (la misma regla del trigger)
--      · cierre   → mueve el bucket abierto al anterior
--
--    **El orden es por `created_at` / `cerrado_at`, NO por `fecha`.** El
--    trigger aplicó sus deltas en orden de INSERCIÓN, así que un cargo con
--    fecha retroactiva ingresado después de un cierre cayó en el ciclo
--    abierto. La derivación reproduce eso, no lo "corrige": si ordenara por
--    `fecha` diría algo distinto de lo que el usuario vio y la reconciliación
--    marcaría diferencias que no son errores.
--
--    ── Lo que ESTO no necesita ──
--    Ni `transacciones.ciclo_id` ni `aplicado_ciclo_anterior` /
--    `aplicado_actual`. Lo que decide el bucket de un cargo no es su FK sino
--    si entró antes o después del cierre. Por eso los cargos sin `ciclo_id` y
--    los pagos repartidos (que quedan en NULL por diseño) dejan de ser un
--    problema, y §2.3 se disuelve sin tocar la tabla.
--
--    ── Cuándo NO deriva ──
--    Si la tarjeta tiene algún ciclo cerrado SIN `cerrado_at`, ese cierre pasó
--    en un instante desconocido y la historia no se puede ordenar. Devuelve
--    `derivable = false` con el motivo, en vez de inventar un instante o de
--    devolver un número que parece bueno. No hay ninguna fila así en la base
--    real (se midió antes de la tarea 4.1), pero una base más vieja puede
--    tenerlas.
--
--    Sin `greatest(0, …)` en ningún lado, a diferencia del trigger: una
--    reproducción que arranca en 0 no puede dejar un bucket negativo, porque
--    cada pago se recorta contra lo que hay. El `greatest` del trigger existe
--    justamente porque un total corriente SÍ puede haber derivado.
-- ══════════════════════════════════════════════════════════════════════

create or replace function deuda_tc_derivada(p_tarjeta_id uuid)
returns table (
  bucket_anterior bigint,
  bucket_actual   bigint,
  derivable       boolean,
  motivo          text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ev        record;
  v_ant       bigint := 0;
  v_act       bigint := 0;
  v_monto     bigint;
  v_d_ant     bigint;
  v_sin_sello int;
begin
  -- `security invoker` (el default): RLS limita qué tarjetas se ven. Se
  -- verifica explícitamente para no devolver (0, 0) — un cero silencioso se
  -- lee como "esta tarjeta no debe nada", que es una respuesta peor que un
  -- error.
  if not exists (select 1 from tarjetas_credito where id = p_tarjeta_id) then
    raise exception 'Tarjeta % no encontrada', p_tarjeta_id;
  end if;

  select count(*) into v_sin_sello
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and estado::text <> 'abierto'
     and cerrado_at is null;

  if v_sin_sello > 0 then
    return query select null::bigint, null::bigint, false,
      format('%s ciclo(s) se cerraron antes de que existiera cerrado_at, así que no se puede saber en qué momento su deuda cambió de bucket. Ese tramo no es derivable.', v_sin_sello);
    return;
  end if;

  for v_ev in
    -- Cargos y pagos, en orden de inserción.
    select x.created_at as t, 0 as clase, x.tipo::text as tipo, abs(x.cantidad) as monto, x.id
      from transacciones x
     where x.tarjeta_id = p_tarjeta_id
       and x.tipo in ('gasto_tc', 'pago_tc')
    union all
    -- Cierres, en el instante real en que ocurrieron.
    select c.cerrado_at, 1, 'cierre', 0::bigint, c.id
      from ciclos_tc c
     where c.tarjeta_id = p_tarjeta_id
       and c.cerrado_at is not null
    -- `clase` desempata un cargo y un cierre del mismo instante (el cargo
    -- primero), e `id` desempata lo demás. `transacciones.created_at` es
    -- `now()`, o sea el inicio de la transacción, así que dos filas insertadas
    -- en la misma transacción lo comparten; el cliente inserta una por
    -- request, y para dos cargos el orden no cambia el resultado.
    order by t, clase, id
  loop
    if v_ev.tipo = 'gasto_tc' then
      v_act := v_act + v_ev.monto;
    elsif v_ev.tipo = 'pago_tc' then
      v_monto := v_ev.monto;
      v_d_ant := least(v_monto, v_ant);
      v_ant   := v_ant - v_d_ant;
      v_act   := v_act - least(v_monto - v_d_ant, v_act);
    else
      -- Cierre: lo que estaba en el ciclo abierto pasa al estado de cuenta.
      v_ant := v_ant + v_act;
      v_act := 0;
    end if;
  end loop;

  return query select v_ant, v_act, true, null::text;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 10. RPC: reconciliar lo guardado contra lo derivado  (tarea 4.2a)
--
--     Una fila por tarjeta del usuario, con los dos números y su diferencia.
--     Es la red que no existía: una diferencia como los Q6.50 de "Ysi Visa"
--     se habría visto el día que entró, en lugar de descubrirse meses después
--     y sin poder rastrearla.
--
--     `cuadra` compara el TOTAL (anterior + actual) y no cada bucket por
--     separado, porque un reparto viejo puede tener el monto en el bucket
--     equivocado sin que falte ni sobre dinero: son dos problemas distintos y
--     conviene poder distinguirlos. `diferencia_total` es lo que importa.
-- ══════════════════════════════════════════════════════════════════════

create or replace function reconciliar_deuda_tc()
returns table (
  tarjeta_id         uuid,
  nombre             text,
  guardado_anterior  bigint,
  guardado_actual    bigint,
  derivado_anterior  bigint,
  derivado_actual    bigint,
  diferencia_total   bigint,
  cuadra             boolean,
  derivable          boolean,
  motivo             text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select t.id,
         t.nombre,
         t.deuda_ciclo_anterior,
         t.deuda_actual,
         d.bucket_anterior,
         d.bucket_actual,
         case when d.derivable
              then (t.deuda_ciclo_anterior + t.deuda_actual)
                   - (d.bucket_anterior + d.bucket_actual)
         end,
         case when d.derivable
              then (t.deuda_ciclo_anterior + t.deuda_actual)
                   = (d.bucket_anterior + d.bucket_actual)
         end,
         d.derivable,
         d.motivo
    from tarjetas_credito t
    cross join lateral deuda_tc_derivada(t.id) d
   order by t.nombre;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 11. RPC: ¿el reparto GUARDADO de cada pago es posible?  (tarea 4.2a)
--
--     `reconciliar_deuda_tc` compara TOTALES, y eso tiene un punto ciego: dos
--     errores de la misma magnitud en sentidos opuestos se cancelan y la
--     tarjeta parece cuadrar. Pasó de verdad, y es lo que motivó esta función.
--
--     Lo que verifica: que `|aplicado_ciclo_anterior| + |aplicado_actual|` de
--     cada `pago_tc` no exceda lo que había para pagar en el instante en que se
--     insertó. Un reparto mayor que la deuda del momento es **imposible**, y su
--     consecuencia es concreta: el trigger revierte un DELETE usando esas
--     columnas, así que borrar esa fila devolvería a la tarjeta más deuda de la
--     que el pago le quitó — deuda fantasma, sin rastro en el ledger.
--
--     Caso real encontrado el 2026-09-21 en "Ysi Visa": el primer pago
--     (Q4,760.58) fue Q6.50 mayor que la deuda del momento (Q4,754.08). El
--     trigger aplicó solo lo que había, pero el backfill de septiembre escribió
--     el monto completo en `aplicado_actual`. La tarjeta cuadra igual; la fila
--     no.
-- ══════════════════════════════════════════════════════════════════════

create or replace function verificar_reparto_tc(p_tarjeta_id uuid)
returns table (
  transaccion_id   uuid,
  fecha            date,
  monto            bigint,
  reparto_guardado bigint,
  habia_para_pagar bigint,
  exceso           bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ev    record;
  v_ant   bigint := 0;
  v_act   bigint := 0;
  v_monto bigint;
  v_d_ant bigint;
  v_rep   bigint;
begin
  if not exists (select 1 from tarjetas_credito where id = p_tarjeta_id) then
    raise exception 'Tarjeta % no encontrada', p_tarjeta_id;
  end if;

  for v_ev in
    select x.created_at as t, 0 as clase, x.tipo::text as tipo, abs(x.cantidad) as monto,
           x.id, x.fecha,
           abs(coalesce(x.aplicado_ciclo_anterior, 0)) + abs(coalesce(x.aplicado_actual, 0)) as reparto
      from transacciones x
     where x.tarjeta_id = p_tarjeta_id
       and x.tipo in ('gasto_tc', 'pago_tc')
    union all
    select c.cerrado_at, 1, 'cierre', 0::bigint, c.id, null::date, 0::bigint
      from ciclos_tc c
     where c.tarjeta_id = p_tarjeta_id
       and c.cerrado_at is not null
    order by t, clase, id
  loop
    if v_ev.tipo = 'gasto_tc' then
      v_act := v_act + v_ev.monto;
    elsif v_ev.tipo = 'pago_tc' then
      v_monto := v_ev.monto;
      v_rep   := v_ev.reparto;

      -- Lo que había para pagar justo antes de este pago.
      if v_rep > v_ant + v_act then
        return query select v_ev.id, v_ev.fecha, v_monto, v_rep, v_ant + v_act,
                            v_rep - (v_ant + v_act);
      end if;

      v_d_ant := least(v_monto, v_ant);
      v_ant   := v_ant - v_d_ant;
      v_act   := v_act - least(v_monto - v_d_ant, v_act);
    else
      v_ant := v_ant + v_act;
      v_act := 0;
    end if;
  end loop;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- PASO 4 — CORRECCIÓN DE DATO: el reparto del primer pago de "Ysi Visa"
--
-- QUÉ PASÓ, medido el 2026-09-21 sobre la base real:
--   El primer pago de la tarjeta (2026-08-26, Q4,760.58) fue **Q6.50 mayor
--   que la deuda que la tarjeta tenía en ese momento** (Q4,754.08 de cargos,
--   cero pagos antes). El trigger aplicó solo lo que había — correcto, no se
--   puede pagar deuda que no existe — y la tarjeta quedó en 0.
--
--   Pero `aplicado_actual` de esa fila quedó en −476058: el monto COMPLETO.
--   Lo escribió el backfill del PASO 2c de la migración de septiembre, que
--   rellenó el reparto de los pagos existentes sin modelar el recorte.
--
-- POR QUÉ IMPORTA
--   El trigger revierte un DELETE con esas columnas
--   (`deuda_actual - OLD.aplicado_actual`). Borrar ese pago le devolvería a la
--   tarjeta Q4,760.58 cuando el pago solo le quitó Q4,754.08: **Q6.50 de deuda
--   fantasma**, sin nada en el ledger que la respalde. Es el mismo mecanismo
--   que produjo los defectos de la auditoría.
--
-- ESTO NO ES "el Q6.50 que faltaba"
--   La diferencia de Q6.50 que `RESTRUCTURE.md` y el roadmap venían
--   reportando como inexplicable **no existe**. Salía de comparar el total
--   guardado contra `sum(cargos) − sum(pagos)`, que no modela el recorte de un
--   sobrepago. Reproduciendo el ledger en orden, la tarjeta CUADRA exacto:
--   Q865.75 guardado = Q865.75 derivado. Lo que estaba mal era la
--   comparación, no el dato. Lo único que hay que corregir es esta fila.
--
-- `vorta.reparto_manual` evita que el trigger recalcule el delta desde
-- `cantidad` y vuelva a aplicarlo: el saldo de la tarjeta ya es correcto y NO
-- debe moverse. Idempotente por el `where`.
-- ══════════════════════════════════════════════════════════════════════

do $$
declare v_filas int;
begin
  perform set_config('vorta.reparto_manual', 'on', true);

  update transacciones x
     set aplicado_actual = -(
           select coalesce(sum(abs(c.cantidad)), 0)
             from transacciones c
            where c.tarjeta_id = x.tarjeta_id
              and c.tipo = 'gasto_tc'
              and c.created_at <= x.created_at
         )
   where x.tipo = 'pago_tc'
     and x.aplicado_ciclo_anterior = 0
     -- Solo los pagos anteriores a cualquier otro pago de esa tarjeta: para
     -- esos, lo que había para pagar es exactamente la suma de cargos previos.
     -- Un pago posterior necesita la reproducción completa, y no hay ninguno
     -- en este estado (lo dice verificar_reparto_tc).
     and not exists (
       select 1 from transacciones p
        where p.tarjeta_id = x.tarjeta_id
          and p.tipo = 'pago_tc'
          and p.created_at < x.created_at
     )
     -- Y solo si el reparto guardado excede lo que había.
     and abs(x.aplicado_actual) > (
           select coalesce(sum(abs(c.cantidad)), 0)
             from transacciones c
            where c.tarjeta_id = x.tarjeta_id
              and c.tipo = 'gasto_tc'
              and c.created_at <= x.created_at
         );

  get diagnostics v_filas = row_count;
  perform set_config('vorta.reparto_manual', 'off', true);
  raise notice 'PASO 4: % fila(s) de reparto corregidas (se esperaba 1 en la base de producción)', v_filas;
end $$;

-- ── VERIFICACIÓN FINAL ────────────────────────────────────────────────
-- Las dos consultas tienen que devolver 0 filas.
--
--   select t.nombre, v.* from tarjetas_credito t
--     cross join lateral verificar_reparto_tc(t.id) v;
--
--   select * from reconciliar_deuda_tc() where not cuadra;
