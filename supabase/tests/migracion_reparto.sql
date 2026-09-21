-- ══════════════════════════════════════════════════════════════════════
-- Tarea 4.2a — La corrección de dato de la migración, probada corriendo el
-- archivo de migración REAL (no una copia de su SQL).
--
-- Lo que se prueba: que el PASO 4 de
-- `20260921010000_deuda_tc_derivada.sql` arregle exactamente la fila que
-- tiene el reparto imposible, **sin mover el saldo de la tarjeta** — el saldo
-- ya es correcto y ahí está el riesgo de una corrección de este tipo.
--
-- Se reproduce la forma exacta del caso real de "Ysi Visa": cargos por
-- Q4,754.08, un primer pago de Q4,760.58 (Q6.50 de más) y el reparto guardado
-- inflado al monto completo, como lo dejó el backfill de septiembre.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into profiles (user_id, nombre)
values ('11111111-1111-1111-1111-111111111111', 'Test migración');
insert into cuentas (id, user_id, nombre, tipo, saldo, color)
values ('22222222-9900-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Cuenta', 'ahorro', 100000000, '#fff');
insert into tarjetas_credito (
  id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior,
  dia_cierre, dia_pago, color
) values (
  '33333333-9900-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 'Ysi Visa (forma real)', 10000000, 0, 0,
  25, 10, '#fff'
);

-- Cargos por 475408, el número real.
insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo, created_at)
values ('44444444-9900-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', null,
        '33333333-9900-0000-0000-000000000001',
        date '2026-08-01', -400000, 'Cargos A', 'Otros', 'gasto_tc', clock_timestamp()),
       ('44444444-9900-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', null,
        '33333333-9900-0000-0000-000000000001',
        date '2026-08-10', -75408, 'Cargos B', 'Otros', 'gasto_tc', clock_timestamp());

-- El pago de más. El trigger recorta y deja la tarjeta en 0.
insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo, created_at)
values ('44444444-9900-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        '22222222-9900-0000-0000-000000000001',
        '33333333-9900-0000-0000-000000000001',
        date '2026-08-26', -476058, 'Pago tarjeta de crédito', 'Otros', 'pago_tc', clock_timestamp());

-- Y el backfill lo infla al monto completo.
do $$
begin
  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones set aplicado_actual = -476058
   where id = '44444444-9900-0000-0000-000000000003';
  perform set_config('vorta.reparto_manual', 'off', true);
end $$;

-- Cargos posteriores, para que la tarjeta tenga saldo como el caso real.
insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo, created_at)
values ('44444444-9900-0000-0000-000000000004',
        '11111111-1111-1111-1111-111111111111', null,
        '33333333-9900-0000-0000-000000000001',
        date '2026-09-05', -86575, 'Cargos C', 'Otros', 'gasto_tc', clock_timestamp());

-- ── 1. El estado de partida es el del caso real ───────────────────────
do $$
declare v_ofensas int; v_cuadra boolean; v_saldo bigint;
begin
  select count(*) into v_ofensas
    from verificar_reparto_tc('33333333-9900-0000-0000-000000000001');
  assert v_ofensas = 1,
    format('el escenario debía arrancar con 1 reparto imposible, tiene %s', v_ofensas);

  -- Y la tarjeta cuadra: es el punto ciego que motivó verificar_reparto_tc.
  select cuadra into v_cuadra from reconciliar_deuda_tc()
   where tarjeta_id = '33333333-9900-0000-0000-000000000001';
  assert v_cuadra, 'el escenario perdió su sentido: la tarjeta tenía que cuadrar igual';

  select deuda_actual into v_saldo
    from tarjetas_credito where id = '33333333-9900-0000-0000-000000000001';
  assert v_saldo = 86575, format('el saldo de partida debía ser 86575, es %s', v_saldo);
end $$;

-- ── 2. Se corre el archivo de migración REAL ──────────────────────────
\i :raiz/supabase/migrations/20260921010000_deuda_tc_derivada.sql

-- ── 3. La fila queda arreglada y el saldo NO se movió ─────────────────
do $$
declare v_ofensas int; v_reparto bigint; v_saldo bigint; v_cuadra boolean;
begin
  select count(*) into v_ofensas
    from verificar_reparto_tc('33333333-9900-0000-0000-000000000001');
  assert v_ofensas = 0,
    format('después de la migración no debía quedar ningún reparto imposible, quedan %s', v_ofensas);

  select aplicado_actual into v_reparto
    from transacciones where id = '44444444-9900-0000-0000-000000000003';
  assert v_reparto = -475408,
    format('el reparto debía quedar en -475408 (lo que había para pagar), quedó en %s', v_reparto);

  -- Lo más importante: la corrección NO toca dinero. El saldo ya era correcto.
  select deuda_actual into v_saldo
    from tarjetas_credito where id = '33333333-9900-0000-0000-000000000001';
  assert v_saldo = 86575,
    format('la corrección movió el saldo de la tarjeta de 86575 a %s — no debe tocarlo', v_saldo);

  select cuadra into v_cuadra from reconciliar_deuda_tc()
   where tarjeta_id = '33333333-9900-0000-0000-000000000001';
  assert v_cuadra, 'la tarjeta tiene que seguir cuadrando después de la corrección';
end $$;

-- ── 4. Ahora borrar el pago devuelve lo que el pago quitó ─────────────
-- Era la consecuencia concreta del reparto inflado: un delete devolvía Q6.50
-- de deuda fantasma. Es lo que la corrección compra.
do $$
declare v_saldo bigint;
begin
  delete from transacciones where id = '44444444-9900-0000-0000-000000000003';

  select deuda_actual into v_saldo
    from tarjetas_credito where id = '33333333-9900-0000-0000-000000000001';
  -- 86575 + 475408 = lo que había antes del pago más los cargos posteriores.
  assert v_saldo = 86575 + 475408,
    format('borrar el pago debía devolver exactamente 475408, el saldo quedó en %s (esperado %s)',
           v_saldo, 86575 + 475408);
end $$;

-- ── 5. Correr la migración dos veces no cambia nada más ───────────────
do $$
declare v_antes bigint;
begin
  select count(*) into v_antes from transacciones
   where tarjeta_id = '33333333-9900-0000-0000-000000000001';
  assert v_antes = 3, format('debían quedar 3 movimientos, hay %s', v_antes);
end $$;

\i :raiz/supabase/migrations/20260921010000_deuda_tc_derivada.sql

do $$
declare v_ofensas int; v_saldo bigint;
begin
  select count(*) into v_ofensas
    from verificar_reparto_tc('33333333-9900-0000-0000-000000000001');
  assert v_ofensas = 0, format('la segunda corrida dejó %s ofensas', v_ofensas);
  select deuda_actual into v_saldo
    from tarjetas_credito where id = '33333333-9900-0000-0000-000000000001';
  assert v_saldo = 86575 + 475408,
    format('la segunda corrida movió el saldo a %s', v_saldo);
end $$;

rollback;
