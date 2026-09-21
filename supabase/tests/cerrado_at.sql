-- ══════════════════════════════════════════════════════════════════════
-- Tarea 4.1 — `cerrado_at`: el instante REAL del cierre.
--
-- Lo que se prueba no es que la columna exista, sino la propiedad por la que
-- existe: que después de un cierre se pueda decir **en qué momento** un monto
-- pasó de `deuda_actual` a `deuda_ciclo_anterior`. Sin eso la historia de la
-- deuda no se puede reproducir desde el ledger, que es el bloqueante de la
-- tarea 4.2 (RESTRUCTURE §2.1).
--
-- Correr con -v ON_ERROR_STOP=1; sin salida de error = todo pasó.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into profiles (user_id, nombre)
values ('11111111-1111-1111-1111-111111111111', 'Test 4.1');

insert into tarjetas_credito (
  id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior,
  dia_cierre, dia_pago, color
) values (
  '33333333-4444-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 'TC 4.1', 1000000, 0, 0,
  15, 5, '#fff'
);

-- ── 1. Un ciclo ABIERTO no tiene instante de cierre ───────────────────
do $$
declare v_cerrado timestamptz; v_estado text;
begin
  insert into ciclos_tc (id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  values ('55555555-4444-0000-0000-000000000001',
          '33333333-4444-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111',
          date '2026-09-01', date '2026-09-15', date '2026-10-05', 'abierto');

  select cerrado_at, estado::text into v_cerrado, v_estado
    from ciclos_tc where id = '55555555-4444-0000-0000-000000000001';
  assert v_estado = 'abierto', format('el ciclo debía estar abierto, está %s', v_estado);
  assert v_cerrado is null,
    format('un ciclo abierto no puede tener instante de cierre, tiene %s', v_cerrado);
end $$;

-- ── 2. Cerrar lo estampa, y con el instante real ──────────────────────
do $$
declare v_cerrado timestamptz; v_estado text; v_antes timestamptz; v_despues timestamptz;
begin
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, ciclo_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-4444-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', null,
          '33333333-4444-0000-0000-000000000001',
          '55555555-4444-0000-0000-000000000001',
          date '2026-09-10', -50000, 'Cargo', 'Otros', 'gasto_tc');

  v_antes := clock_timestamp();
  perform cerrar_ciclo_tc('33333333-4444-0000-0000-000000000001');
  v_despues := clock_timestamp();

  select cerrado_at, estado::text into v_cerrado, v_estado
    from ciclos_tc where id = '55555555-4444-0000-0000-000000000001';

  assert v_estado = 'cerrado', format('el ciclo debía quedar cerrado, quedó %s', v_estado);
  assert v_cerrado is not null, 'un ciclo cerrado tiene que tener instante de cierre';
  -- Entre el antes y el después de la llamada: lo que se guarda es CUÁNDO se
  -- cerró, no `now()` (que es el inicio de la transacción y en un test dentro
  -- de un BEGIN queda minutos antes de la llamada).
  assert v_cerrado between v_antes and v_despues,
    format('el instante %s cayó fuera de la ventana de la llamada (%s .. %s) — ¿es now() en vez de clock_timestamp()?',
           v_cerrado, v_antes, v_despues);
end $$;

-- ── 3. La fecha teórica y la efectiva son cosas distintas ─────────────
do $$
declare v_teorica date; v_efectiva date;
begin
  select fecha_cierre, (cerrado_at at time zone 'America/Guatemala')::date
    into v_teorica, v_efectiva
    from ciclos_tc where id = '55555555-4444-0000-0000-000000000001';

  -- El ciclo tenía cierre teórico el 2026-09-15 y se cerró hoy. Que no
  -- coincidan ES el punto de la columna: `fecha_cierre` nunca podría haber
  -- servido para ordenar la historia, porque no dice cuándo pasó nada.
  assert v_teorica = date '2026-09-15',
    format('la fecha teórica no debía moverse, es %s', v_teorica);
  assert v_efectiva <> v_teorica,
    'el test perdió su sentido: la fecha efectiva coincidió con la teórica por casualidad';
end $$;

-- ── 4. Dos cierres seguidos quedan ORDENADOS entre sí ─────────────────
-- Es la razón de `clock_timestamp()` y no `now()`. Con `now()` los dos cierres
-- de una misma transacción tendrían el mismo instante, y una reproducción de
-- la historia no sabría cuál fue primero.
do $$
declare v_a timestamptz; v_b timestamptz;
begin
  insert into tarjetas_credito (
    id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior,
    dia_cierre, dia_pago, color
  ) values (
    '33333333-4444-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111', 'TC 4.1 bis', 1000000, 0, 0,
    20, 10, '#fff'
  );
  insert into ciclos_tc (id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  values ('55555555-4444-0000-0000-000000000002',
          '33333333-4444-0000-0000-000000000002',
          '11111111-1111-1111-1111-111111111111',
          date '2026-09-01', date '2026-09-20', date '2026-10-10', 'abierto');
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, ciclo_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-4444-0000-0000-000000000002',
          '11111111-1111-1111-1111-111111111111', null,
          '33333333-4444-0000-0000-000000000002',
          '55555555-4444-0000-0000-000000000002',
          date '2026-09-10', -30000, 'Cargo bis', 'Otros', 'gasto_tc');

  perform cerrar_ciclo_tc('33333333-4444-0000-0000-000000000002');

  select cerrado_at into v_a from ciclos_tc where id = '55555555-4444-0000-0000-000000000001';
  select cerrado_at into v_b from ciclos_tc where id = '55555555-4444-0000-0000-000000000002';
  assert v_a < v_b,
    format('dos cierres en la misma transacción quedaron sin orden (%s vs %s) — ¿now() en vez de clock_timestamp()?', v_a, v_b);
end $$;

-- ── 5. El sucesor nace abierto y sin instante ─────────────────────────
do $$
declare v_abiertos int; v_con_instante int;
begin
  select count(*) filter (where estado::text = 'abierto'),
         count(*) filter (where estado::text = 'abierto' and cerrado_at is not null)
    into v_abiertos, v_con_instante
    from ciclos_tc
   where tarjeta_id = '33333333-4444-0000-0000-000000000001';

  assert v_abiertos = 1, format('debía quedar exactamente 1 ciclo abierto, hay %s', v_abiertos);
  assert v_con_instante = 0,
    format('%s ciclos abiertos traen instante de cierre; el sucesor tiene que nacer limpio', v_con_instante);
end $$;

-- ── 6. Un cierre que no hace nada no estampa nada ─────────────────────
-- `cerrar_ciclo_tc` sale temprano si no hay deuda ni cargos. Ese camino no
-- debe cerrar el ciclo nuevo ni ponerle un instante: si lo hiciera, la
-- historia tendría un cierre que nunca pasó.
do $$
declare v_cerrados_antes int; v_cerrados_despues int; v_estado text;
begin
  select count(*) into v_cerrados_antes
    from ciclos_tc where tarjeta_id = '33333333-4444-0000-0000-000000000001'
      and cerrado_at is not null;

  -- La deuda quedó en deuda_ciclo_anterior, pero deuda_actual está en 0 y el
  -- ciclo nuevo no tiene cargos: es el caso de salida temprana.
  perform cerrar_ciclo_tc('33333333-4444-0000-0000-000000000001');

  select count(*) into v_cerrados_despues
    from ciclos_tc where tarjeta_id = '33333333-4444-0000-0000-000000000001'
      and cerrado_at is not null;
  assert v_cerrados_despues = v_cerrados_antes,
    format('un cierre sin nada que cerrar estampó un instante nuevo (%s → %s)',
           v_cerrados_antes, v_cerrados_despues);

  select estado::text into v_estado
    from ciclos_tc
   where tarjeta_id = '33333333-4444-0000-0000-000000000001'
     and cerrado_at is null;
  assert v_estado = 'abierto', format('el ciclo sin instante debía seguir abierto, está %s', v_estado);
end $$;

rollback;
