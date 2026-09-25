-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: los pagos de Apple Pay quedan "por categorizar"
-- Archivo: supabase/migrations/20260926000000_atajo_por_categorizar.sql
--
-- Correr a mano en Supabase → SQL Editor → New query, con NADA seleccionado.
-- REQUIERE 20260925000000_atajo_apple_pay.sql.
--
-- QUÉ HACE
--   Cada pago del atajo se sigue registrando al instante, pero además queda
--   marcado en `pagos_por_categorizar` para que la persona elija la categoría
--   en la app. `categorizar_pago()` cambia solo la categoría sin tocar el
--   reparto de deuda. `registrar_pago_atajo` se recrea igual que en schema.sql.
--
-- Aditiva e idempotente. `supabase/schema.sql` es el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

-- `pagos_por_categorizar`: pagos que llegaron por el atajo y esperan que la
-- persona elija la categoría. Es una marca FUERA del ledger: el movimiento ya
-- está registrado (con la categoría sugerida) y ya movió saldo o deuda; borrar
-- el movimiento borra la marca.
create table if not exists pagos_por_categorizar (
  transaccion_id  uuid primary key references transacciones(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade not null,
  created_at      timestamptz not null default now()
);
create index if not exists pagos_por_categorizar_user on pagos_por_categorizar(user_id, created_at);

alter table pagos_por_categorizar enable row level security;
drop policy if exists pagos_por_categorizar_own on pagos_por_categorizar;
create policy pagos_por_categorizar_own on pagos_por_categorizar
  for all using ((select auth.uid()) = user_id);

do $$ begin
  execute 'drop policy if exists pagos_por_categorizar_ia_update on public.pagos_por_categorizar';
  execute 'create policy pagos_por_categorizar_ia_update on public.pagos_por_categorizar as restrictive for update using ((select public.ia_puede_modificar()))';
  execute 'drop policy if exists pagos_por_categorizar_ia_delete on public.pagos_por_categorizar';
  execute 'create policy pagos_por_categorizar_ia_delete on public.pagos_por_categorizar as restrictive for delete using ((select public.ia_puede_modificar()))';
end $$;

create or replace function registrar_pago_atajo(
  p_clave_hash text,
  p_centavos   bigint,
  p_comercio   text,
  p_tarjeta    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid;
  v_perfil     record;
  v_hoy        date;
  v_comercio   text := left(coalesce(nullif(btrim(p_comercio), ''), 'Apple Pay'), 200);
  v_tarjeta    text := left(btrim(coalesce(p_tarjeta, '')), 80);
  v_map        record;
  v_destino    text;
  v_categoria  text;
  v_tc         record;
  v_ciclo      uuid;
  v_ultimo     date;
  v_inicio     date;
  v_cierre     date;
  v_pago       date;
  v_txn        uuid;
begin
  if p_centavos is null or p_centavos <= 0 or p_centavos > 1000000000000 then
    return jsonb_build_object('ok', false, 'codigo', 'monto_invalido');
  end if;

  update atajo_claves set ultimo_uso = now()
   where clave_hash = p_clave_hash
  returning user_id into v_uid;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'codigo', 'clave_invalida');
  end if;

  select moneda, locale, zona_horaria into v_perfil from profiles where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'sin_perfil');
  end if;
  v_hoy := (now() at time zone v_perfil.zona_horaria)::date;

  if v_tarjeta = '' then
    return jsonb_build_object('ok', false, 'codigo', 'sin_tarjeta');
  end if;

  select m.cuenta_id, m.tarjeta_id, c.nombre as cuenta, c.activa as cuenta_activa,
         t.nombre as tc, t.activa as tc_activa, t.dia_cierre, t.dia_pago
    into v_map
    from atajo_tarjetas m
    left join cuentas c on c.id = m.cuenta_id
    left join tarjetas_credito t on t.id = m.tarjeta_id
   where m.user_id = v_uid and lower(m.nombre_wallet) = lower(v_tarjeta);
  if not found then
    insert into atajo_tarjetas (user_id, nombre_wallet) values (v_uid, v_tarjeta)
      on conflict do nothing;
    return jsonb_build_object('ok', false, 'codigo', 'tarjeta_sin_asignar', 'tarjeta', v_tarjeta);
  end if;
  if v_map.cuenta_id is null and v_map.tarjeta_id is null then
    return jsonb_build_object('ok', false, 'codigo', 'tarjeta_sin_asignar', 'tarjeta', v_tarjeta);
  end if;
  if (v_map.cuenta_id is not null and not v_map.cuenta_activa)
     or (v_map.tarjeta_id is not null and not v_map.tc_activa) then
    return jsonb_build_object('ok', false, 'codigo', 'destino_inactivo', 'tarjeta', v_tarjeta);
  end if;
  v_destino := coalesce(v_map.cuenta, v_map.tc);

  -- El atajo reintentó (o se disparó dos veces): no se duplica.
  if exists (
    select 1 from transacciones
     where user_id = v_uid
       and descripcion = v_comercio
       and cantidad = -p_centavos
       and (cuenta_id = v_map.cuenta_id or tarjeta_id = v_map.tarjeta_id)
       and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'codigo', 'duplicado', 'centavos', p_centavos,
      'moneda', v_perfil.moneda, 'locale', v_perfil.locale, 'destino', v_destino);
  end if;

  select categoria into v_categoria
    from transacciones
   where user_id = v_uid
     and tipo in ('gasto', 'gasto_tc')
     and lower(descripcion) = lower(v_comercio)
   order by created_at desc
   limit 1;
  v_categoria := coalesce(v_categoria, 'Otros');

  if v_map.cuenta_id is not null then
    insert into transacciones (user_id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas)
    values (v_uid, v_map.cuenta_id, v_hoy, -p_centavos, v_comercio, v_categoria, 'gasto',
            'Apple Pay · ' || v_tarjeta)
    returning id into v_txn;
  else
    select id into v_ciclo
      from ciclos_tc
     where tarjeta_id = v_map.tarjeta_id and user_id = v_uid and estado = 'abierto'
     order by fecha_inicio desc
     limit 1;

    if v_ciclo is null then
      -- Mismo sucesor que cerrar_ciclo_tc: contiguo al último cierre, o desde hoy.
      select max(fecha_cierre) into v_ultimo
        from ciclos_tc where tarjeta_id = v_map.tarjeta_id and user_id = v_uid;
      v_inicio := coalesce(v_ultimo + 1, v_hoy);
      v_cierre := dia_del_mes_clamp(v_inicio, v_map.dia_cierre);
      if v_cierre <= v_inicio then
        v_cierre := dia_del_mes_clamp(
          (date_trunc('month', v_inicio::timestamp) + interval '1 month')::date, v_map.dia_cierre);
      end if;
      if v_map.dia_pago > v_map.dia_cierre then
        v_pago := dia_del_mes_clamp(v_cierre, v_map.dia_pago);
      else
        v_pago := dia_del_mes_clamp(
          (date_trunc('month', v_cierre::timestamp) + interval '1 month')::date, v_map.dia_pago);
      end if;
      insert into ciclos_tc (tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
      values (v_map.tarjeta_id, v_uid, v_inicio, v_cierre, v_pago, 'abierto')
      on conflict (tarjeta_id, fecha_inicio) do nothing;

      select id into v_ciclo
        from ciclos_tc
       where tarjeta_id = v_map.tarjeta_id and user_id = v_uid and estado = 'abierto'
       order by fecha_inicio desc
       limit 1;
      if v_ciclo is null then
        raise exception 'No se pudo abrir un ciclo para la tarjeta %', v_map.tarjeta_id;
      end if;
    end if;

    insert into transacciones (user_id, tarjeta_id, ciclo_id, fecha, cantidad, descripcion, categoria, tipo, notas)
    values (v_uid, v_map.tarjeta_id, v_ciclo, v_hoy, -p_centavos, v_comercio, v_categoria, 'gasto_tc',
            'Apple Pay · ' || v_tarjeta)
    returning id into v_txn;
  end if;

  -- La persona elige la categoría en la app (la sugerida ya quedó puesta).
  insert into pagos_por_categorizar (transaccion_id, user_id) values (v_txn, v_uid);

  return jsonb_build_object('ok', true, 'codigo', 'registrado', 'centavos', p_centavos,
    'moneda', v_perfil.moneda, 'locale', v_perfil.locale,
    'categoria', v_categoria, 'destino', v_destino, 'por_categorizar', true);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 14. RPC: elegir la categoría de un pago que llegó por el atajo
--
--     Cambia SOLO la categoría, con `vorta.reparto_manual` encendido. Un
--     UPDATE normal de un `gasto_tc` dispara trg_deuda_tc, que revierte el
--     reparto guardado y vuelve a aplicar el cargo contra deuda_actual — mal
--     si el ciclo ya cerró (es la razón por la que la UI no edita movimientos
--     de tarjeta). Con el monto intacto no hay deuda que recalcular, y el
--     trigger de saldo de cuentas deja el saldo igual (−OLD + NEW = 0).
--
--     Invoker: corre con el RLS de quien llama. Un asistente de IA sin
--     permiso de modificar no puede (sección 4b).
-- ══════════════════════════════════════════════════════════════════════

create or replace function categorizar_pago(p_transaccion_id uuid, p_categoria text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas int;
begin
  if coalesce(btrim(p_categoria), '') = '' or length(btrim(p_categoria)) > 50 then
    raise exception 'Categoría inválida';
  end if;

  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones
     set categoria = btrim(p_categoria)
   where id = p_transaccion_id
     and user_id = auth.uid()
     and tipo in ('gasto', 'gasto_tc');
  get diagnostics v_filas = row_count;
  perform set_config('vorta.reparto_manual', 'off', true);

  if v_filas = 1 then
    delete from pagos_por_categorizar
     where transaccion_id = p_transaccion_id and user_id = auth.uid();
  end if;
  return v_filas = 1;
end;
$$;

revoke all on function categorizar_pago(uuid, text) from public;
revoke execute on function categorizar_pago(uuid, text) from anon;
grant execute on function categorizar_pago(uuid, text) to authenticated;
