-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: cuentas en dólares
-- Archivo: supabase/migrations/20261014000000_cuentas_moneda.sql
--
-- Correr a mano en Supabase → SQL Editor → New query, con NADA seleccionado.
-- REQUIERE 20260926000000_atajo_por_categorizar.sql aplicada antes.
--
-- QUÉ HACE
--   · `cuentas.moneda` ('GTQ' por defecto, o 'USD'). Las cuentas existentes
--     quedan en GTQ: nada cambia hasta que la persona marque una en dólares.
--   · `profiles.tipo_cambio_usd` > 0 como check: ahora convierte cuentas.
--   · `registrar_pago_atajo` gana un 5.º parámetro, la moneda del importe, y
--     convierte si no es la de la cuenta destino. La versión de 4 parámetros
--     queda como envoltorio sin conversión (ver el comentario en schema.sql).
--
-- Aditiva e idempotente. `supabase/schema.sql` es el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

-- Moneda de la cuenta (migración 20261014000000_cuentas_moneda.sql). El saldo y
-- TODOS los movimientos de la cuenta están en esta moneda; el trigger de saldo
-- no la mira. Lo que suma entre cuentas convierte con profiles.tipo_cambio_usd
-- (finanzas.ts: calcTotalCuentas, txnsEnMonedaBase). Misma convención que
-- inversiones.moneda: 'GTQ' es la moneda del perfil.
alter table cuentas
  add column if not exists moneda text not null default 'GTQ';
do $$ begin
  alter table cuentas add constraint cuentas_moneda_check check (moneda in ('GTQ', 'USD'));
exception when duplicate_object then null; end $$;

-- El tipo de cambio divide y multiplica montos: con 0 o negativo `usdToGTQ`
-- lanza en el render del total de cuentas (y registrar_pago_atajo responde
-- `sin_tipo_cambio`). El cliente nunca lo escribe así; esto lo vuelve invariante.
do $$ begin
  alter table profiles add constraint profiles_tipo_cambio_positivo check (tipo_cambio_usd > 0);
exception when duplicate_object then null; end $$;

create or replace function registrar_pago_atajo(
  p_clave_hash text,
  p_centavos   bigint,
  p_comercio   text,
  p_tarjeta    text,
  -- La moneda del importe como la leyó /api/atajo del texto ("Q45.00" →
  -- 'GTQ', "US$45.00" → 'USD', "L45.00" → 'HNL'), '$' si traía un "$" a secas
  -- (ambiguo: lo resuelve el perfil), o null si no traía símbolo. SIN default:
  -- un default haría ambigua la versión de 4 parámetros de abajo.
  p_moneda     text
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
  v_centavos   bigint := p_centavos;   -- el monto ya en la moneda del destino
  v_moneda_dest text;                  -- la columna: 'GTQ' (= la del perfil) o 'USD'
  v_iso_dest   text;                   -- la misma, como código ISO
  v_moneda_imp text;                   -- la del importe, como código ISO (o null)
  v_convertido boolean := false;
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

  select moneda, locale, zona_horaria, tipo_cambio_usd into v_perfil from profiles where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'sin_perfil');
  end if;
  v_hoy := (now() at time zone v_perfil.zona_horaria)::date;

  if v_tarjeta = '' then
    return jsonb_build_object('ok', false, 'codigo', 'sin_tarjeta');
  end if;

  select m.cuenta_id, m.tarjeta_id, c.nombre as cuenta, c.activa as cuenta_activa, c.moneda as cuenta_moneda,
         t.nombre as tc, t.activa as tc_activa, t.dia_cierre, t.dia_pago, t.moneda as tc_moneda
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

  -- El importe viene en la moneda del pago; el movimiento va en la de la
  -- cuenta (o tarjeta) destino. Si difieren, se convierte con el tipo de
  -- cambio del perfil — el mismo que usa la app para sumar.
  v_moneda_dest := coalesce(case when v_map.cuenta_id is not null then v_map.cuenta_moneda else v_map.tc_moneda end, 'GTQ');
  v_iso_dest := case when v_moneda_dest = 'USD' then 'USD' else v_perfil.moneda end;
  -- Un "$" a secas es dólares, salvo en un perfil cuya moneda también se
  -- escribe así (MONEDAS_SOPORTADAS): en México "$45.00" son pesos.
  v_moneda_imp := case when p_moneda = '$'
                       then case when v_perfil.moneda in ('MXN', 'DOP') then v_perfil.moneda else 'USD' end
                       else nullif(upper(btrim(p_moneda)), '') end;
  -- Solo se convierte entre el dólar y la moneda del perfil: es el único tipo
  -- de cambio que hay. Otra moneda (un pago en euros) se registra tal cual y
  -- la respuesta lo dice (`moneda_importe`), para que el atajo avise.
  if v_moneda_imp in ('USD', v_perfil.moneda) and v_moneda_imp <> v_iso_dest then
    if coalesce(v_perfil.tipo_cambio_usd, 0) <= 0 then
      return jsonb_build_object('ok', false, 'codigo', 'sin_tipo_cambio');
    end if;
    v_centavos := case when v_moneda_imp = 'USD'
                       then round(p_centavos * v_perfil.tipo_cambio_usd / 100.0)
                       else round(p_centavos * 100.0 / v_perfil.tipo_cambio_usd) end;
    v_convertido := true;
    if v_centavos <= 0 then
      return jsonb_build_object('ok', false, 'codigo', 'monto_invalido');
    end if;
  end if;

  -- El atajo reintentó (o se disparó dos veces): no se duplica.
  if exists (
    select 1 from transacciones
     where user_id = v_uid
       and descripcion = v_comercio
       and cantidad = -v_centavos
       and (cuenta_id = v_map.cuenta_id or tarjeta_id = v_map.tarjeta_id)
       and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'codigo', 'duplicado', 'centavos', v_centavos,
      'moneda', v_iso_dest,
      'locale', v_perfil.locale, 'destino', v_destino);
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
    values (v_uid, v_map.cuenta_id, v_hoy, -v_centavos, v_comercio, v_categoria, 'gasto',
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
    values (v_uid, v_map.tarjeta_id, v_ciclo, v_hoy, -v_centavos, v_comercio, v_categoria, 'gasto_tc',
            'Apple Pay · ' || v_tarjeta)
    returning id into v_txn;
  end if;

  -- La persona elige la categoría en la app (la sugerida ya quedó puesta).
  insert into pagos_por_categorizar (transaccion_id, user_id) values (v_txn, v_uid);

  return jsonb_build_object('ok', true, 'codigo', 'registrado', 'centavos', v_centavos,
    'moneda', v_iso_dest,
    'locale', v_perfil.locale,
    'categoria', v_categoria, 'destino', v_destino, 'por_categorizar', true,
    -- En qué moneda vino el importe (null si sin símbolo): si no es la del
    -- destino y no se pudo convertir, el atajo avisa que quedó tal cual.
    'moneda_importe', v_moneda_imp)
    -- Si hubo conversión, también lo que se pagó, para que el atajo lo muestre.
    || case when v_convertido
            then jsonb_build_object('centavos_original', p_centavos, 'moneda_original', v_moneda_imp)
            else '{}'::jsonb end;
end;
$$;

-- La versión de 4 parámetros, sin moneda: la que llamaba /api/atajo antes de
-- las cuentas en dólares. Se conserva como envoltorio (sin conversión) para que
-- el orden en que se apliquen la migración y el código no importe, y para que
-- volver a correr 20260925 / 20260926 —que la crean— no deje dos versiones
-- ambiguas: la nueva no tiene default, así que 4 argumentos van siempre acá.
create or replace function registrar_pago_atajo(
  p_clave_hash text, p_centavos bigint, p_comercio text, p_tarjeta text
)
returns jsonb
language sql
set search_path = public, pg_temp
as $$
  select registrar_pago_atajo(p_clave_hash, p_centavos, p_comercio, p_tarjeta, null::text)
$$;

revoke all on function registrar_pago_atajo(text, bigint, text, text) from public;
revoke execute on function registrar_pago_atajo(text, bigint, text, text) from authenticated;
grant execute on function registrar_pago_atajo(text, bigint, text, text) to anon;
revoke all on function registrar_pago_atajo(text, bigint, text, text, text) from public;
revoke execute on function registrar_pago_atajo(text, bigint, text, text, text) from authenticated;
grant execute on function registrar_pago_atajo(text, bigint, text, text, text) to anon;
