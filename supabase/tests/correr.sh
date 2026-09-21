#!/usr/bin/env bash
# Corre los tests de SQL contra un PostgreSQL local, levantándolo si hace falta.
#
# No es parte de `npm test`: necesita un Postgres instalado, y eso no se puede
# asumir en cualquier máquina. El contenedor de desarrollo lo trae.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-5499}"
# En el home de postgres y no en /tmp: el usuario `postgres` tiene que poder
# recorrer el path, y los directorios temporales del agente son solo de root.
PGDATA="${PGDATA:-/var/lib/postgresql/vorta-test}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"

[ -x "$PGBIN/initdb" ] || { echo "No encontré PostgreSQL en $PGBIN. Instalalo o exportá PGBIN."; exit 1; }

# `su postgres` solo si corremos como root; si no, se asume que el usuario
# actual es dueño del cluster.
como_postgres() { if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi }

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "→ initdb en $PGDATA"
  [ "$(id -u)" = 0 ] && { mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"; }
  como_postgres "$PGBIN/initdb -U vorta -A trust -D $PGDATA" >/dev/null
fi

if ! "$PGBIN/pg_isready" -p "$PGPORT" >/dev/null 2>&1; then
  echo "→ arrancando el cluster en el puerto $PGPORT"
  como_postgres "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/log -o '-p $PGPORT' start" >/dev/null
  sleep 2
fi

# Base limpia en cada corrida: el schema es idempotente, pero los tests no
# deben ver filas de una corrida anterior.
psql -p "$PGPORT" -h 127.0.0.1 -U vorta -d postgres -q \
  -c 'drop schema if exists public cascade; create schema public;' \
  -c 'drop schema if exists auth cascade;'

echo "→ cargando el stub y el esquema"
psql -p "$PGPORT" -h 127.0.0.1 -U vorta -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$RAIZ/supabase/tests/00_stub_auth.sql" \
  -f "$RAIZ/supabase/schema.sql" >/dev/null

echo "→ corriendo los tests"
for f in "$RAIZ"/supabase/tests/*.sql; do
  case "$(basename "$f")" in 00_*) continue ;; esac
  echo "   $(basename "$f")"
  psql -p "$PGPORT" -h 127.0.0.1 -U vorta -d postgres -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "✓ todos los tests de SQL pasaron"
