# Tests de SQL

Prueban los **triggers y RPCs** contra un PostgreSQL de verdad. Un mock del
cliente de Supabase no sirve para esto: lo que hay que verificar es lo que hace
Postgres, y el reparto de deuda de TC es la lógica más delicada de la app —
de ahí salieron los tres defectos críticos de la auditoría.

## Correr

Con un PostgreSQL 16 local (el contenedor de desarrollo lo trae):

```bash
D=/var/lib/postgresql/vorta-test
su postgres -c "/usr/lib/postgresql/16/bin/initdb -U vorta -A trust -D $D"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D -l $D/log -o '-p 5499' start"

psql -p 5499 -h 127.0.0.1 -U vorta -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_stub_auth.sql \
  -f supabase/schema.sql \
  -f supabase/tests/reparto_deuda_tc.sql
```

Cada aserción usa `assert`, así que **el script falla con error si algo no
cuadra** y `ON_ERROR_STOP=1` corta ahí. Sin salida de error = todo pasó.

## Archivos

- `00_stub_auth.sql` — el `auth.users` y el `auth.uid()` que Supabase provee y
  un Postgres pelado no. Solo para el test; nunca se aplica a producción.
- `reparto_deuda_tc.sql` — el trigger `trg_deuda_tc` y el RPC
  `cerrar_ciclo_tc`: insert, delete y el reparto de un pago entre los dos
  buckets, incluida la reversión exacta.
