-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: registrar solos los pagos con Apple Pay (atajo)
-- Archivo: supabase/migrations/20260925000000_atajo_apple_pay.sql
--
-- Correr a mano en Supabase → SQL Editor → New query, con NADA seleccionado.
-- REQUIERE 20260924000000_acceso_ia.sql (usa `ia_puede_modificar()`).
--
-- QUÉ AGREGA
--   Dos tablas (`atajo_claves`, `atajo_tarjetas`) con su RLS y el RPC
--   `registrar_pago_atajo`, que llama /api/atajo. Ver docs/APPLE_PAY.md.
--   No toca ninguna tabla existente.
--
-- Aditiva e idempotente: se puede correr dos veces. `supabase/schema.sql` ya
-- la incluye y es el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

-- ─── ATAJO DE APPLE PAY ───────────────────────────────────────────────
-- La automatización "Transacción" de Atajos manda cada pago con Apple Pay a
-- /api/atajo (docs/APPLE_PAY.md). Estas dos tablas y el RPC
-- registrar_pago_atajo (sección 13) son todo lo que necesita.
--
-- `atajo_claves`: UNA clave por persona. Solo se guarda el SHA-256 (hex) de la
-- clave; la clave misma se muestra una vez al generarla y no vuelve a existir
-- en ningún lado. Regenerar = pisar el hash, y la anterior deja de servir.
create table if not exists atajo_claves (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  clave_hash  text not null unique,
  creada_at   timestamptz not null default now(),
  ultimo_uso  timestamptz,

  constraint atajo_claves_hash_sha256 check (clave_hash ~ '^[0-9a-f]{64}$')
);

-- `atajo_tarjetas`: el nombre que la tarjeta tiene en Wallet → adónde va el
-- gasto. A lo sumo un destino; SIN destino es una tarjeta que llegó en un pago
-- y todavía no se asignó (el pago no se registró y la app pide asignarla).
create table if not exists atajo_tarjetas (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references auth.users(id) on delete cascade not null,
  nombre_wallet  varchar(80) not null,
  cuenta_id      uuid references cuentas(id) on delete cascade,
  tarjeta_id     uuid references tarjetas_credito(id) on delete cascade,
  created_at     timestamptz not null default now(),

  constraint atajo_tarjetas_un_destino check (num_nonnulls(cuenta_id, tarjeta_id) <= 1)
);
create unique index if not exists atajo_tarjetas_nombre_unico
  on atajo_tarjetas(user_id, lower(nombre_wallet));
create index if not exists atajo_tarjetas_cuenta on atajo_tarjetas(cuenta_id);
create index if not exists atajo_tarjetas_tarjeta on atajo_tarjetas(tarjeta_id);

alter table atajo_claves   enable row level security;
alter table atajo_tarjetas enable row level security;

-- `(select auth.uid())` y no `auth.uid()` pelado: se evalúa una vez por
-- consulta (el linter de Supabase marca la otra forma en las tablas viejas).
drop policy if exists atajo_claves_own on atajo_claves;
create policy atajo_claves_own on atajo_claves
  for all using ((select auth.uid()) = user_id);
drop policy if exists atajo_tarjetas_own on atajo_tarjetas;
create policy atajo_tarjetas_own on atajo_tarjetas
  for all using ((select auth.uid()) = user_id);

-- Como toda tabla: un asistente de IA solo edita o borra con permiso
-- (schema.sql §4b).
do $$
declare t text;
begin
  foreach t in array array['atajo_claves', 'atajo_tarjetas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ia_update', t);
    execute format('create policy %I on public.%I as restrictive for update using ((select public.ia_puede_modificar()))',
                   t || '_ia_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_ia_delete', t);
    execute format('create policy %I on public.%I as restrictive for delete using ((select public.ia_puede_modificar()))',
                   t || '_ia_delete', t);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 13. RPC: un pago con Apple Pay, desde el atajo  (docs/APPLE_PAY.md)
--
--     Lo llama /api/atajo con la clave PÚBLICA (rol anon): el atajo del
--     iPhone no tiene sesión. Quién paga lo decide el hash de la clave
--     personal, así que la función es `security definer` y está scopeada a
--     ese user_id en cada consulta. Lo ÚNICO que hace es registrar un gasto
--     de esa persona: con la clave no se lee ni se borra nada.
--
--     El monto llega en centavos (la función de Vercel parsea "Q45.00"), y
--     el texto de la respuesta lo arma también ella a partir de `codigo`.
--
--     Reglas:
--       · tarjeta de Wallet sin asignar → no se registra; queda en la lista
--         para asignarla (única vez que un pago se pierde, y se avisa);
--       · a una tarjeta de crédito, SIEMPRE en su ciclo abierto — si no hay,
--         se abre como en cerrar_ciclo_tc: un cargo sin ciclo_id rompe el
--         reparto al cerrar (el cierre solo migra los cargos de su ciclo);
--       · categoría: la del último gasto con ese mismo comercio, o "Otros";
--       · el mismo pago dos veces en 2 minutos (el atajo reintentó) no duplica;
--       · fecha: hoy en la zona del perfil.
-- ══════════════════════════════════════════════════════════════════════

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
            'Apple Pay · ' || v_tarjeta);
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
            'Apple Pay · ' || v_tarjeta);
  end if;

  return jsonb_build_object('ok', true, 'codigo', 'registrado', 'centavos', p_centavos,
    'moneda', v_perfil.moneda, 'locale', v_perfil.locale,
    'categoria', v_categoria, 'destino', v_destino);
end;
$$;

-- Solo `anon`: quien la llama es /api/atajo, sin sesión. La autorización es el
-- hash de la clave, no el rol. `authenticated` no la necesita (la app registra
-- gastos por su cuenta) y un asistente de IA no tiene por qué usarla.
revoke all on function registrar_pago_atajo(text, bigint, text, text) from public;
revoke execute on function registrar_pago_atajo(text, bigint, text, text) from authenticated;
grant execute on function registrar_pago_atajo(text, bigint, text, text) to anon;
