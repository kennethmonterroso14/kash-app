-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Schema autoritativo (único archivo)
--
-- Ejecutar en: Supabase → SQL Editor → New query
--
-- Este archivo reemplaza al viejo "schema inicial" que solo cubría las 5
-- tablas originales (profiles, cuentas, transacciones, presupuestos,
-- metas_ahorro). Ahora contiene TODO el esquema que la app usa: tarjetas de
-- crédito, ciclos, inversiones, historial de inversiones, pagos recurrentes
-- y categorías de usuario, más las columnas, enums, índices, policies,
-- triggers y RPCs que se fueron agregando en las Fases 6-8.
--
-- ORDEN RECOMENDADO en una base YA DESPLEGADA:
--     1) supabase/migrations/20260917000000_fix_deuda_tc_y_cierre_ciclo.sql
--     2) este archivo
--   Los dos archivos traen el mismo backfill del reparto de TC, con el
--   trigger de deuda neutralizado, así que cualquiera de los dos órdenes
--   funciona y correr los dos dos veces tampoco hace daño. La migración
--   primero es lo recomendado solo porque imprime los NOTICE con el conteo de
--   pagos cuyo reparto se reconstruyó.
--   En un proyecto NUEVO alcanza con este archivo.
--
-- Propiedades:
--   • Corre de cero en un proyecto vacío.
--   • Es idempotente: se puede re-ejecutar sobre una base ya desplegada
--     (todo es `if not exists` / `create or replace` / `do $$ … exception`).
--     Los bloques SQL de docs/superpowers/plans/*.md quedan SUPERSEDIDOS por
--     este archivo; varios de ellos no corren como están escritos
--     (`create policy if not exists` no existe en PostgreSQL, un índice se
--     creaba antes que su columna, `create trigger` sin guard).
--
-- `inversiones`, `pagos_recurrentes` y `categorias_usuario` nunca tuvieron DDL
-- comiteado en ningún lado (ni acá ni en los planes). Se reconstruyeron del
-- código cliente y después se VERIFICARON contra la base real por
-- introspección de information_schema (columnas, tipos, nullability y
-- defaults). Lo que esa introspección no cubre y sigue sin confirmar:
--   • la longitud máxima de las columnas `character varying`
--   • qué check/unique constraints existen realmente
-- Para cerrar eso:
--     select tc.table_name, tc.constraint_name, tc.constraint_type,
--            cc.check_clause
--       from information_schema.table_constraints tc
--       left join information_schema.check_constraints cc
--              on cc.constraint_name = tc.constraint_name
--      where tc.table_schema = 'public'
--      order by tc.table_name;
-- Como están dentro de `create table if not exists`, las constraints de este
-- archivo NO se aplican a una tabla que ya existe: re-ejecutarlo sobre la base
-- desplegada no puede fallar por datos que no las cumplan (y por eso el
-- cliente no da por hecho que existan).
--
-- Money: SIEMPRE centavos enteros (bigint). Nunca quetzales, nunca float.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ══════════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ══════════════════════════════════════════════════════════════════════

do $$ begin
  create type tipo_cuenta as enum (
    'corriente', 'ahorro', 'efectivo', 'inversion', 'otro'
  );
exception when duplicate_object then null;
end $$;

-- 'gasto_tc' y 'pago_tc' se agregaron en la Fase 6.
do $$ begin
  create type tipo_transaccion as enum (
    'ingreso', 'gasto', 'ajuste', 'gasto_tc', 'pago_tc'
  );
exception when duplicate_object then null;
end $$;

-- Para una base que ya tenía el enum con solo 3 valores.
-- Nota: si el editor SQL se queja de ALTER TYPE dentro de una transacción,
-- correr estas dos líneas solas en su propia query.
alter type tipo_transaccion add value if not exists 'gasto_tc';
alter type tipo_transaccion add value if not exists 'pago_tc';

do $$ begin
  create type estado_ciclo_tc as enum ('abierto', 'cerrado', 'pagado');
exception when duplicate_object then null;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. TABLAS
-- ══════════════════════════════════════════════════════════════════════

-- ─── PERFILES ─────────────────────────────────────────────────────────
-- Esta tabla tiene su propio `id` y un `user_id` único hacia auth.users.
-- CONFIRMADO contra la base real: la relación con el usuario es `user_id`, y
-- todas las queries del cliente filtran por ahí. PerfilPage filtraba por `id`
-- (nunca coincidía, el nombre no cargaba) y quedó corregida.
create table if not exists profiles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  nombre      text not null,
  moneda      text not null default 'GTQ',
  created_at  timestamptz not null default now(),

  -- Fase 7: centavos GTQ por 1 USD (775 = Q7.75)
  tipo_cambio_usd            bigint not null default 775,
  tipo_cambio_actualizado_at timestamptz,

  -- Tarea 1.3.4: con `moneda` completan el trío que parametriza el formateo.
  -- Sin check de zona IANA: eso necesitaría `pg_timezone_names`, que no es
  -- inmutable y no se puede usar en un check. Valida el cliente.
  locale       text not null default 'es-GT',
  zona_horaria text not null default 'America/Guatemala'
);

-- Fase 7 sobre una base que ya tenía profiles.
alter table profiles
  add column if not exists tipo_cambio_usd bigint not null default 775,
  add column if not exists tipo_cambio_actualizado_at timestamptz;

-- Tarea 1.3.4 sobre una base que ya tenía profiles.
alter table profiles
  add column if not exists locale       text not null default 'es-GT',
  add column if not exists zona_horaria text not null default 'America/Guatemala';

-- ─── CUENTAS ──────────────────────────────────────────────────────────
-- `saldo` lo mantiene el trigger trigger_saldo_transaccion (deltas, no SUM).
-- Nunca escribirlo desde el cliente.
create table if not exists cuentas (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  nombre      text not null,
  tipo        tipo_cuenta not null default 'corriente',
  saldo       bigint not null default 0,
  color       text not null default '#c8f564',
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── TARJETAS DE CRÉDITO (Fase 6) ─────────────────────────────────────
-- `deuda_actual` y `deuda_ciclo_anterior` las mantiene el trigger
-- trg_deuda_tc y el RPC cerrar_ciclo_tc. Nunca escribirlas desde el cliente.
create table if not exists tarjetas_credito (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  nombre                text not null,
  banco                 text,
  ultimos_4             char(4),
  limite_credito        bigint not null,
  deuda_actual          bigint not null default 0,
  deuda_ciclo_anterior  bigint not null default 0,
  dia_cierre            smallint not null,
  dia_pago              smallint not null,
  moneda                text not null default 'GTQ',
  color                 text not null default '#7c6af7',
  activa                boolean not null default true,
  created_at            timestamptz not null default now(),

  constraint tc_limite_positivo   check (limite_credito > 0),
  constraint tc_deuda_no_negativa check (deuda_actual >= 0),
  constraint tc_dia_cierre_valido check (dia_cierre between 1 and 31),
  constraint tc_dia_pago_valido   check (dia_pago between 1 and 31)
);

-- ─── CICLOS DE TARJETA (Fase 6) ───────────────────────────────────────
-- Invariante: exactamente un ciclo 'abierto' por tarjeta activa.
-- La mantienen cerrar_ciclo_tc (crea el sucesor al cerrar) y
-- useTarjetas.obtenerCicloAbierto (lo crea si la tarjeta no tiene ninguno).
create table if not exists ciclos_tc (
  id            uuid primary key default uuid_generate_v4(),
  tarjeta_id    uuid references tarjetas_credito(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  fecha_inicio  date not null,
  fecha_cierre  date not null,
  fecha_pago    date not null,
  total_cargos  bigint not null default 0,
  total_pagos   bigint not null default 0,
  saldo_final   bigint not null default 0,
  estado        estado_ciclo_tc not null default 'abierto',
  created_at    timestamptz not null default now(),

  constraint ciclo_fechas_validas check (fecha_cierre > fecha_inicio),
  unique (tarjeta_id, fecha_inicio)
);
-- Nota: el bloque de la Fase 8 re-declara `estado` como text + check en vez
-- del enum. Corrió después del de la Fase 6, así que el `create table if not
-- exists` no hizo nada y la base real tiene el enum. Si en la base real
-- `estado` es text, este archivo no lo cambia (create if not exists).

-- ─── TRANSACCIONES ────────────────────────────────────────────────────
-- Ledger universal. Ver CLAUDE.md para la tabla de tipos.
--   ingreso  → cantidad > 0            gasto    → cantidad < 0
--   ajuste   → cualquiera              gasto_tc → cantidad < 0, cuenta_id NULL
--   pago_tc  → cantidad < 0 (debita cuenta_id y baja deuda de la tarjeta)
-- `cuenta_id` es NULLABLE desde la Fase 6: un gasto_tc no toca ninguna cuenta.
-- No hay constraint de signo para gasto_tc/pago_tc (solo se valida en el
-- cliente); no se agrega acá porque una base desplegada puede tener filas
-- pago_tc con signo invertido y el ALTER fallaría.
create table if not exists transacciones (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  cuenta_id    uuid references cuentas(id) on delete restrict,
  fecha        date not null,
  cantidad     bigint not null,
  descripcion  varchar(200) not null,
  categoria    varchar(50) not null,
  tipo         tipo_transaccion not null,
  notas        text,
  created_at   timestamptz not null default now(),

  -- Fase 6
  tarjeta_id   uuid references tarjetas_credito(id),
  ciclo_id     uuid references ciclos_tc(id),

  -- Reparto de deuda con el que este movimiento afectó a la tarjeta.
  -- Delta CON SIGNO aplicado a cada bucket (+ sube la deuda, − la baja), o
  -- NULL si el reparto nunca se registró (filas anteriores a la migración
  -- 20260917000000). Lo escribe trg_deuda_tc; sirve para que DELETE y UPDATE
  -- puedan revertir EXACTAMENTE lo que hizo el INSERT.
  aplicado_ciclo_anterior bigint,
  aplicado_actual         bigint,

  constraint cantidad_no_cero check (cantidad != 0),
  constraint ingreso_positivo check (not (tipo = 'ingreso' and cantidad < 0)),
  constraint gasto_negativo   check (not (tipo = 'gasto'   and cantidad > 0))
);

-- Para una base que ya tenía transacciones (orden importa: las columnas
-- ANTES de los índices que las usan).
alter table transacciones
  alter column cuenta_id drop not null;

alter table transacciones
  add column if not exists tarjeta_id uuid references tarjetas_credito(id),
  add column if not exists ciclo_id   uuid references ciclos_tc(id),
  add column if not exists aplicado_ciclo_anterior bigint,
  add column if not exists aplicado_actual         bigint;
-- En una base ya desplegada las filas viejas quedan con aplicado_* en NULL.
-- El backfill va acá mismo (y no solo en la migración) para que este archivo
-- cumpla de verdad lo que promete arriba: que se pueda re-ejecutar sobre una
-- base desplegada en cualquier orden. Si no estuviera, correr schema.sql
-- primero instalaría el trigger que rechaza las filas sin reparto y el
-- backfill de la migración ya no podría correr nunca: su propio UPDATE sobre
-- esas filas sería rechazado por el trigger y la migración abortaría.
--
-- Corre con el trigger deshabilitado. Con el trigger VIEJO (AFTER) puesto,
-- cada UPDATE de abajo le sumaría deuda inventada a las tarjetas: su rama
-- UPDATE hace `greatest(0, deuda_actual - abs(OLD))` y luego
-- `+ abs(NEW)` en dos statements, lo que con `cantidad` sin cambiar equivale
-- a `deuda_actual := max(deuda_actual, monto)` — neutro solo mientras
-- deuda_actual >= monto, y al alza en cualquier tarjeta ya pagada o con el
-- ciclo cerrado. Con el trigger NUEVO (BEFORE) el UPDATE sería rechazado o
--  recalcularía el reparto. Por eso se apaga en los dos casos.
do $$
declare
  v_tenia_trigger boolean;
  v_filas         bigint;
begin
  v_tenia_trigger := exists (
    select 1 from pg_trigger
     where tgname = 'trg_deuda_tc'
       and tgrelid = 'public.transacciones'::regclass
       and not tgisinternal
  );
  if v_tenia_trigger then
    alter table transacciones disable trigger trg_deuda_tc;
  end if;

  -- gasto_tc: exacto, un cargo siempre sumó su monto completo a deuda_actual.
  update transacciones
     set aplicado_ciclo_anterior = 0,
         aplicado_actual         = abs(cantidad)
   where tipo = 'gasto_tc'
     and tarjeta_id is not null
     and (aplicado_ciclo_anterior is null or aplicado_actual is null);

  -- Movimientos que no tocan deuda de TC: reparto vacío, también exacto.
  update transacciones
     set aplicado_ciclo_anterior = 0,
         aplicado_actual         = 0
   where (tarjeta_id is null or tipo not in ('gasto_tc', 'pago_tc'))
     and (aplicado_ciclo_anterior is null or aplicado_actual is null);

  -- pago_tc: NO es derivable del ledger (el reparto con clamp que hizo el
  -- INSERT no se guardó y los cierres de ciclo no registran cuándo
  -- ocurrieron). Se asume 100% contra deuda_ciclo_anterior, que es lo que el
  -- INSERT intentaba. El total de deuda se conserva; el bucket es el más
  -- probable, no un hecho. Ver PASO 2c de la migración.
  update transacciones
     set aplicado_ciclo_anterior = -abs(cantidad),
         aplicado_actual         = 0
   where tipo = 'pago_tc'
     and tarjeta_id is not null
     and (aplicado_ciclo_anterior is null or aplicado_actual is null);
  get diagnostics v_filas = row_count;
  if v_filas > 0 then
    raise notice 'Backfill pago_tc: % fila(s) con reparto RECONSTRUIDO (asumido 100%% contra deuda_ciclo_anterior). Revisar contra el estado de cuenta antes de eliminar/editar esos pagos.', v_filas;
  end if;

  if v_tenia_trigger then
    alter table transacciones enable trigger trg_deuda_tc;
  end if;
end $$;

-- ─── PRESUPUESTOS ─────────────────────────────────────────────────────
-- `mes` guarda el primero del mes ('YYYY-MM-01'). El unique es el que usa
-- el upsert de BudgetPage (onConflict: 'user_id,categoria,mes').
create table if not exists presupuestos (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  categoria     varchar(50) not null,
  monto_limite  bigint not null,
  mes           date not null,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint limite_positivo check (monto_limite > 0),
  unique (user_id, categoria, mes)
);

-- ─── METAS DE AHORRO ──────────────────────────────────────────────────
create table if not exists metas_ahorro (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  nombre          text not null,
  monto_objetivo  bigint not null,
  monto_actual    bigint not null default 0,
  fecha_objetivo  date,
  completada      boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint objetivo_positivo  check (monto_objetivo > 0),
  constraint actual_no_negativo check (monto_actual >= 0)
);

-- ─── PAGOS RECURRENTES ───── verificado contra la base real ───────────
-- Fuente: src/hooks/usePagosRecurrentes.ts (select/insert/update),
--         src/hooks/useAutoApplyPagos.ts, src/pages/PagosRecurrentesPage.tsx.
--   • `monto` se guarda POSITIVO: useAutoApplyPagos inserta `cantidad: -p.monto`.
--   • `dia_del_mes` 1-28 (el selector de la UI es Array.from({length: 28})).
--   • `activo` es borrado lógico: deletePago hace update({activo: false}).
--   • `ultima_aplicacion` es la idempotencia del auto-apply (date o NULL).
-- Verificada contra la base real por introspección (columnas y constraints).
-- Ojo: `created_at` es NULLABLE y `dia_del_mes` es `integer` en producción.
-- El check 1-28 SÍ existe (pagos_recurrentes_dia_del_mes_check); el cliente
-- igual recorta el día al último del mes, como defensa en profundidad.
create table if not exists pagos_recurrentes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade not null,
  nombre             text not null,
  monto              bigint not null,          -- centavos, positivo
  dia_del_mes        integer not null,
  cuenta_id          uuid references cuentas(id) on delete restrict not null,
  categoria          text not null,
  activo             boolean not null default true,
  ultima_aplicacion  date,
  created_at         timestamptz default now(),

  constraint pagos_recurrentes_monto_check       check (monto > 0),
  constraint pagos_recurrentes_dia_del_mes_check check (dia_del_mes between 1 and 28)
);

-- ─── CATEGORÍAS DE USUARIO ─ verificado contra la base real ───────────
-- Fuente: src/hooks/useCategorias.ts (select 'id, nombre, tipo, color'
--         ordenado por created_at; insert {user_id, nombre, tipo, color}),
--         src/pages/CategoriasPage.tsx (nombre maxLength 50).
-- Verificada contra la base real por introspección (information_schema).
-- `nombre` y `color` son character varying en producción (no se capturó su
-- longitud máxima); `tipo` tiene default 'gasto' y `color` no tiene default.
create table if not exists categorias_usuario (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  nombre      varchar(50) not null,
  tipo        text not null default 'gasto',   -- 'gasto' | 'ingreso' | 'ambos'
  color       varchar(50) not null,
  created_at  timestamptz not null default now(),

  -- Nombres de constraint iguales a los de la base real, para que una
  -- provisión nueva quede idéntica a producción.
  constraint categorias_usuario_tipo_check check (tipo in ('gasto', 'ingreso', 'ambos')),
  -- Existe en producción y no estaba declarado acá: useCategorias traduce el
  -- 23505 a "ya tienes una categoría llamada X".
  constraint categorias_usuario_user_id_nombre_key unique (user_id, nombre)
);

-- ─── INVERSIONES ─────────── verificado contra la base real ───────────
-- Fuente: src/hooks/useInversiones.ts (select/insert/update de todas las
--         columnas), src/lib/constants.ts TIPOS_INVERSION.
--   • Centavos en la MONEDA de la inversión (no convertidos a GTQ).
--   • `activa` es borrado lógico: archivarInversion hace update({activa:false}).
--   • `tipo` ∈ fondo|acciones|cdp|crypto|inmueble|otro (TIPOS_INVERSION).
--     Se deja como text sin check para no romper filas ya existentes.
-- Verificada contra la base real por introspección (information_schema):
-- coincide, salvo que en producción `valor_actual` no tiene default.
create table if not exists inversiones (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid references auth.users(id) on delete cascade not null,
  nombre               text not null,
  plataforma           text,
  tipo                 text not null,
  monto_invertido      bigint not null,        -- centavos, capital
  valor_actual         bigint not null default 0,
  moneda               text not null default 'GTQ',   -- 'GTQ' | 'USD'
  fecha_inicio         date not null,
  fecha_ultimo_update  date,
  notas                text,
  activa               boolean not null default true,
  created_at           timestamptz not null default now(),

  constraint inv_invertido_positivo check (monto_invertido > 0),
  constraint inv_valor_no_negativo  check (valor_actual >= 0)
);

-- ─── HISTORIAL DE INVERSIONES (Fase 7) ────────────────────────────────
-- Un punto por (inversion_id, fecha). Es la fuente de verdad del valor:
-- inversiones.valor_actual / fecha_ultimo_update son una proyección del
-- punto más reciente.
create table if not exists inversiones_historial (
  id            uuid primary key default uuid_generate_v4(),
  inversion_id  uuid references inversiones(id) on delete cascade not null,
  user_id       uuid references auth.users(id)  on delete cascade not null,
  valor         bigint not null,          -- centavos en la moneda de la inversión
  fecha         date not null,
  created_at    timestamptz not null default now(),

  constraint inv_hist_valor_no_negativo check (valor >= 0)
);

-- ══════════════════════════════════════════════════════════════════════
-- 3. ÍNDICES
-- ══════════════════════════════════════════════════════════════════════

create index if not exists idx_transacciones_user_fecha
  on transacciones(user_id, fecha desc);
create index if not exists idx_transacciones_user_categoria
  on transacciones(user_id, categoria);
create index if not exists idx_cuentas_user
  on cuentas(user_id);

-- Fase 6 / Fase 8
create index if not exists idx_tc_user
  on tarjetas_credito(user_id);
create index if not exists idx_ciclos_tarjeta
  on ciclos_tc(tarjeta_id, fecha_inicio desc);
create index if not exists idx_ciclos_tarjeta_estado
  on ciclos_tc(tarjeta_id, estado) where estado = 'abierto';
create index if not exists idx_tx_tarjeta
  on transacciones(tarjeta_id, fecha desc) where tarjeta_id is not null;
create index if not exists idx_tx_ciclo
  on transacciones(ciclo_id) where ciclo_id is not null;

-- Fase 7
create index if not exists idx_inv_hist_inversion
  on inversiones_historial(inversion_id, fecha desc);
create index if not exists idx_inv_hist_user
  on inversiones_historial(user_id);

-- Tablas reconstruidas (índices por user_id, que es como las lee la app)
create index if not exists idx_inversiones_user
  on inversiones(user_id);
create index if not exists idx_pagos_recurrentes_user
  on pagos_recurrentes(user_id);
create index if not exists idx_categorias_usuario_user
  on categorias_usuario(user_id);

-- CategoriasPage valida duplicados sin distinguir mayúsculas
-- (c.nombre.toLowerCase() === n.toLowerCase()), así que el índice único va
-- sobre lower(nombre). No es parte del esquema verificado: si la base real
-- ya tiene nombres que difieren solo en mayúsculas, el índice no se crea y
-- solo se avisa (el script no aborta).
do $$ begin
  create unique index if not exists idx_categorias_usuario_nombre
    on categorias_usuario(user_id, lower(nombre));
exception when unique_violation then
  raise notice 'categorias_usuario: hay nombres duplicados ignorando mayúsculas; índice único NO creado. Deduplicar y volver a correr.';
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
--    RLS es la ÚNICA capa de autorización de la app (no hay backend).
--    Una tabla con RLS habilitada y CERO policies devuelve 0 filas y
--    rechaza todo insert, sin error visible en la UI.
-- ══════════════════════════════════════════════════════════════════════

alter table profiles              enable row level security;
alter table cuentas               enable row level security;
alter table transacciones         enable row level security;
alter table presupuestos          enable row level security;
alter table metas_ahorro          enable row level security;
alter table tarjetas_credito      enable row level security;
alter table ciclos_tc             enable row level security;
alter table pagos_recurrentes     enable row level security;
alter table categorias_usuario    enable row level security;
alter table inversiones           enable row level security;
alter table inversiones_historial enable row level security;

-- `create policy` NO acepta IF NOT EXISTS en ninguna versión de PostgreSQL
-- (el bloque de la Fase 6 usa esa sintaxis y por eso nunca corrió). Se crea
-- la policy solo si la tabla no tiene ninguna, para no duplicar las que ya
-- existan con otro nombre (las Fases 6/7 las llamaron "own").
-- `for all using (...)` también aplica como with-check en insert/update.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'cuentas', 'transacciones', 'presupuestos', 'metas_ahorro',
    'tarjetas_credito', 'ciclos_tc', 'pagos_recurrentes',
    'categorias_usuario', 'inversiones', 'inversiones_historial'
  ]
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t
    ) then
      execute format(
        'create policy %I on public.%I for all using (auth.uid() = user_id)',
        t || '_own', t
      );
    end if;
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. TRIGGER: saldo de cuentas
--    Aplica deltas (+NEW.cantidad / −OLD.cantidad); no recalcula un SUM.
-- ══════════════════════════════════════════════════════════════════════

create or replace function actualizar_saldo_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    update cuentas set saldo = saldo + NEW.cantidad
     where id = NEW.cuenta_id;
  elsif TG_OP = 'DELETE' then
    update cuentas set saldo = saldo - OLD.cantidad
     where id = OLD.cuenta_id;
  elsif TG_OP = 'UPDATE' then
    -- Nota: si alguna vez se permite mover una transacción de cuenta, esto
    -- hay que partirlo en revertir-OLD.cuenta_id + aplicar-NEW.cuenta_id.
    -- Hoy updateTxn solo cambia cantidad/descripcion/categoria/fecha.
    update cuentas set saldo = saldo - OLD.cantidad + NEW.cantidad
     where id = NEW.cuenta_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trigger_saldo_transaccion on transacciones;
create trigger trigger_saldo_transaccion
  after insert or update or delete on transacciones
  for each row execute function actualizar_saldo_cuenta();

-- ══════════════════════════════════════════════════════════════════════
-- 6. TRIGGER: deuda de tarjetas de crédito
--
--    Es un trigger BEFORE (antes era AFTER) porque necesita GUARDAR en la
--    fila el reparto del movimiento entre los dos buckets de deuda
--    (aplicado_ciclo_anterior / aplicado_actual). Sin ese reparto persistido
--    un DELETE o un UPDATE no puede revertir lo que hizo el INSERT: la
--    versión anterior devolvía todo el pago a `deuda_actual` aunque hubiera
--    salido de `deuda_ciclo_anterior`, y un delete + "Deshacer" podía borrar
--    la deuda de la tarjeta por completo.
--
--    Las columnas guardan el DELTA CON SIGNO aplicado a cada bucket, así que
--    revertir es restar y aplicar es sumar. El excedente de un sobrepago
--    (abs(cantidad) − |aplicado_ciclo_anterior| − |aplicado_actual|) no toca
--    ningún bucket, y por eso tampoco se "revive" al eliminar el pago.
--
--    Alcance de esa reversibilidad: el reparto describe el bucket donde el
--    monto estaba AL MOMENTO del movimiento. Un cierre de ciclo lo mueve de
--    deuda_actual a deuda_ciclo_anterior, así que cerrar_ciclo_tc migra el
--    reparto de los cargos que arrastra (ver su cuerpo). Para una fila cuyo
--    reparto quedó viejo de todas formas, el paso 1 del trigger resta el
--    sobrante que no alcanza en deuda_actual contra deuda_ciclo_anterior, en
--    lugar de descartarlo con greatest(0, …) y dejar deuda fantasma.
--
--    Una fila con aplicado_* en NULL (anterior al backfill) se resuelve así:
--    para gasto_tc el reparto es derivable con certeza (todo el monto fue a
--    deuda_actual) y se usa; para pago_tc NO lo es, y el trigger rechaza la
--    operación en vez de adivinar y borrar deuda real.
--
--    La tarjeta se bloquea con `select … for update` antes de calcular el
--    reparto: dos pago_tc concurrentes no pueden leer el mismo saldo previo.
--    Se filtra también por user_id porque la función es SECURITY DEFINER y
--    RLS no la limita: sin ese filtro una transacción propia apuntando a la
--    tarjeta de otro usuario mutaría la deuda ajena.
-- ══════════════════════════════════════════════════════════════════════

create or replace function actualizar_deuda_tc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ant   bigint;   -- deuda_ciclo_anterior de la tarjeta (ya bloqueada)
  v_act   bigint;   -- deuda_actual de la tarjeta (ya bloqueada)
  v_monto bigint;   -- monto absoluto del movimiento
  v_d_ant bigint;   -- delta a aplicar sobre deuda_ciclo_anterior
  v_d_act bigint;   -- delta a aplicar sobre deuda_actual
begin
  -- Escape hatch para operaciones que reescriben el reparto a mano:
  -- cerrar_ciclo_tc migra el reparto de los cargos que arrastra de un bucket
  -- al otro, y sin esto el paso 2 lo recalcularía desde `cantidad` y volvería
  -- a aplicar el delta. `set_config(..., true)` es local a la transacción, así
  -- que no puede quedar encendido ni filtrarse a otra sesión.
  if coalesce(current_setting('vorta.reparto_manual', true), 'off') = 'on' then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  -- ── 1. Revertir el efecto de OLD (UPDATE y DELETE) ──────────────────
  if TG_OP in ('UPDATE', 'DELETE')
     and OLD.tarjeta_id is not null
     and OLD.tipo in ('gasto_tc', 'pago_tc') then

    if OLD.aplicado_ciclo_anterior is null or OLD.aplicado_actual is null then
      -- Fila anterior a la migración: el reparto no se guardó y adivinarlo
      -- puede borrar deuda real. Se rechaza en vez de corromper la tarjeta.
      raise exception
        'La transacción % no tiene reparto de deuda registrado (aplicado_ciclo_anterior / aplicado_actual). Corré el backfill de supabase/migrations/20260917000000_fix_deuda_tc_y_cierre_ciclo.sql antes de editarla o eliminarla.',
        OLD.id;
    end if;

    update tarjetas_credito
       set deuda_ciclo_anterior = greatest(0, deuda_ciclo_anterior - OLD.aplicado_ciclo_anterior),
           deuda_actual         = greatest(0, deuda_actual         - OLD.aplicado_actual)
     where id = OLD.tarjeta_id
       and user_id = OLD.user_id;
  end if;

  -- ── 2. Aplicar el efecto de NEW (INSERT y UPDATE) ───────────────────
  if TG_OP in ('INSERT', 'UPDATE') then
    if NEW.tarjeta_id is not null and NEW.tipo in ('gasto_tc', 'pago_tc') then
      v_monto := abs(NEW.cantidad);

      select deuda_ciclo_anterior, deuda_actual
        into v_ant, v_act
        from tarjetas_credito
       where id = NEW.tarjeta_id
         and user_id = NEW.user_id
         for update;
      if not found then
        raise exception 'La tarjeta % no existe o no pertenece al usuario %',
          NEW.tarjeta_id, NEW.user_id;
      end if;

      if NEW.tipo = 'gasto_tc' then
        -- Un cargo siempre engorda el ciclo abierto.
        v_d_ant := 0;
        v_d_act := v_monto;
      else
        -- Un pago liquida primero el estado de cuenta ya cerrado y el
        -- sobrante baja el ciclo abierto. v_d_ant / v_d_act son negativos.
        v_d_ant := - least(v_monto, v_ant);
        v_d_act := - least(v_monto + v_d_ant, v_act);
      end if;

      NEW.aplicado_ciclo_anterior := v_d_ant;
      NEW.aplicado_actual         := v_d_act;

      update tarjetas_credito
         set deuda_ciclo_anterior = greatest(0, deuda_ciclo_anterior + v_d_ant),
             deuda_actual         = greatest(0, deuda_actual         + v_d_act)
       where id = NEW.tarjeta_id
         and user_id = NEW.user_id;
    else
      -- Movimiento que no toca deuda de TC: reparto explícitamente vacío.
      NEW.aplicado_ciclo_anterior := 0;
      NEW.aplicado_actual         := 0;
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_deuda_tc on transacciones;
create trigger trg_deuda_tc
  before insert or update or delete on transacciones
  for each row execute function actualizar_deuda_tc();

-- ══════════════════════════════════════════════════════════════════════
-- 7. HELPER: día del mes recortado al último día real de ese mes
--    (una tarjeta con cierre 31 cierra el 28/29 en febrero y el 30 en los
--    meses de 30 días, igual que _diaClamp en src/lib/finanzas.ts).
-- ══════════════════════════════════════════════════════════════════════

create or replace function dia_del_mes_clamp(p_base date, p_dia int)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_base::timestamp)::date
         + (least(
              p_dia,
              extract(day from (
                date_trunc('month', p_base::timestamp) + interval '1 month' - interval '1 day'
              ))::int
            ) - 1);
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 8. RPC: cerrar ciclo de tarjeta
--
--    • Scoping por auth.uid(): la función es SECURITY DEFINER, o sea que
--      corre como owner y RLS no la frena. Sin el filtro por usuario
--      cualquier sesión autenticada podía cerrar el ciclo y mover la deuda
--      de la tarjeta de OTRO usuario pasando su uuid.
--    • Abre el ciclo SUCESOR en la misma transacción. Antes no lo hacía y la
--      tarjeta quedaba sin ciclo abierto: el siguiente cargo reconstruía las
--      fechas desde HOY, daba la misma fecha_inicio que el ciclo recién
--      cerrado y chocaba con unique(tarjeta_id, fecha_inicio).
--    • El sucesor se deriva del ciclo cerrado (fecha_cierre + 1 día), no de
--      hoy, así los ciclos quedan contiguos y no pueden colisionar. Si el
--      usuario cierra ANTES del día de cierre, el ciclo nuevo arranca en el
--      futuro (el día siguiente al cierre teórico); es el precio de mantener
--      la contigüidad y de que un cargo posterior tenga siempre dónde caer.
-- ══════════════════════════════════════════════════════════════════════

create or replace function cerrar_ciclo_tc(p_tarjeta_id uuid)
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

  update ciclos_tc
     set estado = 'cerrado',
         saldo_final = v_tc.deuda_actual
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
  -- está y al eliminar el cargo la reversión resta del bucket equivocado
  -- (era la vía por la que D1 seguía siendo alcanzable tras un cierre).
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

  -- Si la tarjeta no tenía ningún ciclo, se arranca hoy en calendario
  -- Guatemala (nunca en la zona del servidor).
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
