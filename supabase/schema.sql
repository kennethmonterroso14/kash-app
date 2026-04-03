-- ─────────────────────────────────────────────
-- KASH — Schema inicial
-- Ejecutar en: Supabase → SQL Editor → New query
-- ─────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── PERFILES ────────────────────────────────
create table profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  nombre text not null,
  moneda text default 'GTQ' not null,
  created_at timestamptz default now() not null
);

-- ─── CUENTAS ─────────────────────────────────
create type tipo_cuenta as enum (
  'corriente', 'ahorro', 'efectivo', 'inversion', 'otro'
);

create table cuentas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre text not null,
  tipo tipo_cuenta not null default 'corriente',
  saldo bigint not null default 0,
  color text not null default '#c8f564',
  activa boolean not null default true,
  created_at timestamptz default now() not null
);

-- ─── TRANSACCIONES ───────────────────────────
create type tipo_transaccion as enum ('ingreso', 'gasto', 'ajuste');

create table transacciones (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  cuenta_id uuid references cuentas(id) on delete restrict not null,
  fecha date not null,
  cantidad bigint not null,
  descripcion varchar(200) not null,
  categoria varchar(50) not null,
  tipo tipo_transaccion not null,
  notas text,
  created_at timestamptz default now() not null,

  constraint cantidad_no_cero check (cantidad != 0),
  constraint ingreso_positivo check (
    not (tipo = 'ingreso' and cantidad < 0)
  ),
  constraint gasto_negativo check (
    not (tipo = 'gasto' and cantidad > 0)
  )
);

-- ─── PRESUPUESTOS ────────────────────────────
create table presupuestos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  categoria varchar(50) not null,
  monto_limite bigint not null,
  mes date not null,
  activo boolean not null default true,
  created_at timestamptz default now() not null,

  constraint limite_positivo check (monto_limite > 0),
  unique(user_id, categoria, mes)
);

-- ─── METAS DE AHORRO ─────────────────────────
create table metas_ahorro (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre text not null,
  monto_objetivo bigint not null,
  monto_actual bigint not null default 0,
  fecha_objetivo date,
  completada boolean not null default false,
  created_at timestamptz default now() not null,

  constraint objetivo_positivo check (monto_objetivo > 0),
  constraint actual_no_negativo check (monto_actual >= 0)
);

-- ─── ÍNDICES ─────────────────────────────────
create index idx_transacciones_user_fecha
  on transacciones(user_id, fecha desc);

create index idx_transacciones_user_categoria
  on transacciones(user_id, categoria);

create index idx_cuentas_user
  on cuentas(user_id);

-- ─── ROW LEVEL SECURITY ──────────────────────
alter table profiles enable row level security;
alter table cuentas enable row level security;
alter table transacciones enable row level security;
alter table presupuestos enable row level security;
alter table metas_ahorro enable row level security;

create policy "profiles_own" on profiles
  for all using (auth.uid() = user_id);

create policy "cuentas_own" on cuentas
  for all using (auth.uid() = user_id);

create policy "transacciones_own" on transacciones
  for all using (auth.uid() = user_id);

create policy "presupuestos_own" on presupuestos
  for all using (auth.uid() = user_id);

create policy "metas_own" on metas_ahorro
  for all using (auth.uid() = user_id);

-- ─── TRIGGER: actualizar saldo al registrar transacción ──────
create or replace function actualizar_saldo_cuenta()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update cuentas set saldo = saldo + NEW.cantidad
    where id = NEW.cuenta_id;
  elsif TG_OP = 'DELETE' then
    update cuentas set saldo = saldo - OLD.cantidad
    where id = OLD.cuenta_id;
  elsif TG_OP = 'UPDATE' then
    update cuentas set saldo = saldo - OLD.cantidad + NEW.cantidad
    where id = NEW.cuenta_id;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_saldo_transaccion
  after insert or update or delete on transacciones
  for each row execute function actualizar_saldo_cuenta();
