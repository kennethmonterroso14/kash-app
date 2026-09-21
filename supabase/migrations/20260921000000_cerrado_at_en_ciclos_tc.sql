-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: `cerrado_at` en `ciclos_tc` (tarea 4.1)
-- Archivo: supabase/migrations/20260921000000_cerrado_at_en_ciclos_tc.sql
--
-- ESTADO: PENDIENTE de aplicar. Correr a mano en Supabase → SQL Editor →
-- New query, con NADA seleccionado: si hay texto seleccionado el editor corre
-- SOLO la selección, que es cómo una migración termina a medias.
--
-- QUÉ ARREGLA
--   `ciclos_tc.fecha_cierre` es la fecha TEÓRICA del corte, pero el usuario
--   cierra cuando quiere. Sin registrar el instante real del cierre no se
--   puede saber en qué momento un monto pasó de `deuda_actual` a
--   `deuda_ciclo_anterior`, y por lo tanto **la historia de la deuda no se
--   puede reproducir desde el ledger** (RESTRUCTURE §2.1). Eso es lo que hoy
--   hace que una diferencia como los Q6.50 de "Ysi Visa" no se pueda rastrear.
--
-- POR QUÉ CONVIENE APLICARLA YA
--   Medido en esta base el 2026-09-21: **cero ciclos cerrados**. Nunca se
--   corrió `cerrar_ciclo_tc`, así que todavía no hay nada de historia perdida.
--   El primer cierre que ocurra sin esta columna deja ese tramo sin poder
--   derivarse para siempre. Aplicada antes del primer cierre, el 100% de la
--   historia queda reproducible.
--
-- QUÉ NO HACE
--   No rellena nada hacia atrás. Un ciclo cerrado con `cerrado_at` en NULL
--   significa "se cerró antes de que existiera esta columna", y la derivación
--   de la tarea 4.2 lo dirá en vez de inventar un instante. Hoy no hay
--   ninguna fila así.
--
-- Es idempotente y se puede correr dos veces sin efecto extra.
-- `supabase/schema.sql` ya incluye todo esto y sigue siendo el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

-- ── PASO 1. La columna ────────────────────────────────────────────────
alter table public.ciclos_tc
  add column if not exists cerrado_at timestamptz;

comment on column public.ciclos_tc.cerrado_at is
  'Instante real del cierre, escrito por cerrar_ciclo_tc. NULL en un ciclo cerrado = se cerró antes de que existiera la columna, y ese tramo no es derivable. fecha_cierre es la fecha teórica, esto es la efectiva.';

-- ── PASO 2. `cerrar_ciclo_tc` la escribe ──────────────────────────────
-- Se redefine la función completa: es la única forma de cambiarle el cuerpo, y
-- `create or replace` la deja idéntica a la de schema.sql. El único cambio
-- respecto de la versión de septiembre es el `cerrado_at = clock_timestamp()`
-- del update que cierra los ciclos abiertos.
create or replace function public.cerrar_ciclo_tc(p_tarjeta_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := auth.uid();
  v_tc            record;
  v_ciclo_id      uuid;
  v_ciclos_cerr   uuid[];
  v_ultimo_cierre date;
  v_inicio        date;
  v_cierre        date;
  v_pago          date;
begin
  if v_uid is null then
    raise exception 'cerrar_ciclo_tc requiere una sesión autenticada';
  end if;

  select id, dia_cierre, dia_pago, deuda_actual
    into v_tc
    from tarjetas_credito
   where id = p_tarjeta_id
     and user_id = v_uid
     for update;
  if not found then
    raise exception 'Tarjeta % no encontrada para el usuario actual', p_tarjeta_id;
  end if;

  select id into v_ciclo_id
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto'
   order by fecha_inicio desc
   limit 1;

  -- Nada que cerrar: sin deuda abierta y sin cargos en el ciclo. Evita que
  -- dos toques seguidos al botón encadenen ciclos vacíos.
  if v_tc.deuda_actual = 0
     and (v_ciclo_id is null
          or not exists (
            select 1 from transacciones
             where ciclo_id = v_ciclo_id
               and tipo = 'gasto_tc'
          )) then
    return;
  end if;

  -- Se capturan ANTES de cerrarlos, para migrar solo el reparto de las filas
  -- que este cierre arrastra (y que un segundo cierre sea idempotente).
  select coalesce(array_agg(id), '{}')
    into v_ciclos_cerr
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto';

  -- ── EL CAMBIO DE ESTA MIGRACIÓN ──
  -- `cerrado_at` es el momento REAL del cierre, y es lo que vuelve
  -- reproducible la historia de la deuda. `clock_timestamp()` y no `now()`:
  -- `now()` es el inicio de la transacción, y dos cierres en la misma
  -- transacción quedarían con el mismo instante y sin orden entre ellos.
  update ciclos_tc
     set estado = 'cerrado',
         saldo_final = v_tc.deuda_actual,
         cerrado_at = clock_timestamp()
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto';

  update tarjetas_credito
     set deuda_ciclo_anterior = deuda_ciclo_anterior + deuda_actual,
         deuda_actual = 0
   where id = p_tarjeta_id
     and user_id = v_uid;

  -- El cierre acaba de mover estos cargos de deuda_actual a
  -- deuda_ciclo_anterior, así que su reparto guardado tiene que moverse con
  -- ellos. Sin esto, aplicado_actual apunta a un bucket donde el monto ya no
  -- está y al eliminar el cargo la reversión resta del bucket equivocado.
  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones
     set aplicado_ciclo_anterior = coalesce(aplicado_ciclo_anterior, 0) + aplicado_actual,
         aplicado_actual         = 0
   where tarjeta_id = p_tarjeta_id
     and user_id    = v_uid
     and tipo       = 'gasto_tc'
     and aplicado_actual is not null
     and aplicado_actual <> 0
     and ciclo_id = any(v_ciclos_cerr);
  perform set_config('vorta.reparto_manual', 'off', true);

  -- ── Sucesor: contiguo al último cierre registrado ──
  select max(fecha_cierre) into v_ultimo_cierre
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid;

  v_inicio := coalesce(v_ultimo_cierre + 1,
                       (now() at time zone 'America/Guatemala')::date);

  v_cierre := dia_del_mes_clamp(v_inicio, v_tc.dia_cierre);
  if v_cierre <= v_inicio then
    v_cierre := dia_del_mes_clamp(
      (date_trunc('month', v_inicio::timestamp) + interval '1 month')::date,
      v_tc.dia_cierre
    );
  end if;

  if v_tc.dia_pago > v_tc.dia_cierre then
    v_pago := dia_del_mes_clamp(v_cierre, v_tc.dia_pago);
  else
    v_pago := dia_del_mes_clamp(
      (date_trunc('month', v_cierre::timestamp) + interval '1 month')::date,
      v_tc.dia_pago
    );
  end if;

  insert into ciclos_tc (
    tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado
  )
  values (p_tarjeta_id, v_uid, v_inicio, v_cierre, v_pago, 'abierto')
  on conflict (tarjeta_id, fecha_inicio) do nothing;
end;
$$;

-- ── VERIFICACIÓN ──────────────────────────────────────────────────────
-- Después de aplicar, correr esto aparte. Las tres filas tienen que dar `t`.
--
--   select 'columna existe' as que,
--          exists (select 1 from information_schema.columns
--                   where table_schema = 'public' and table_name = 'ciclos_tc'
--                     and column_name = 'cerrado_at') as ok
--   union all
--   select 'la función la escribe',
--          pg_get_functiondef('public.cerrar_ciclo_tc(uuid)'::regprocedure)
--            like '%cerrado_at = clock_timestamp()%'
--   union all
--   select 'ningún ciclo cerrado sin instante',
--          not exists (select 1 from public.ciclos_tc
--                       where estado <> 'abierto' and cerrado_at is null);
