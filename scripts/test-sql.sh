#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Only the dedicated disposable integration container/database is touched.
docker_args=(--host=unix:///var/run/docker.sock)
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
if ! docker "${docker_args[@]}" inspect kino-beta-sql >/dev/null 2>&1; then
 docker "${docker_args[@]}" run -d --name kino-beta-sql -e POSTGRES_PASSWORD=local-integration-only postgres:17-alpine
fi
docker "${docker_args[@]}" start kino-beta-sql >/dev/null
for attempt in {1..30}; do docker "${docker_args[@]}" exec kino-beta-sql pg_isready -U postgres >/dev/null && break; sleep 1; done
docker "${docker_args[@]}" exec kino-beta-sql dropdb -U postgres --if-exists kino_legacy_test
docker "${docker_args[@]}" exec kino-beta-sql createdb -U postgres kino_legacy_test
# Roles are cluster-wide, so bootstrap roles conditionally on repeated runs.
python - <<'PY' | docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test
from pathlib import Path
s=Path('supabase/tests/bootstrap.sql').read_text()
import re
s=re.sub(r'create role (\w+) ([^;]+);',lambda m:"do $$begin if not exists(select 1 from pg_roles where rolname='"+m[1]+"') then create role "+m[1]+" "+m[2]+";end if;end$$;",s)
print(s)
PY
for file in supabase/migrations/*.sql;do
 if [[ "$file" == *_fair_xp.sql ]];then
  docker "${docker_args[@]}" exec kino-beta-sql dropdb -U postgres --if-exists kino_legacy_xp_upgrade
  docker "${docker_args[@]}" exec kino-beta-sql createdb -U postgres -T kino_legacy_test kino_legacy_xp_upgrade
 fi
 docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test < "$file"
done
node scripts/catalog-sql.mjs | docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test
docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test < supabase/tests/security.sql
docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test < supabase/tests/ux21.sql
docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test < supabase/tests/legend23.sql
docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test < supabase/tests/after24.sql
docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test < supabase/tests/trophy252.sql
trophy_pids=()
# Concurrent independent scores use separate database sessions and existing per-family locks.
for actor in 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222; do
 docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test -c "begin;set local role authenticated;select set_config('request.jwt.claim.sub','$actor',true);select public.mv_apply(gen_random_uuid(),'rating','eternals','{\"score\":10}',0);commit;" > "/tmp/marvel-trophy-$actor.log" 2>&1 &
 trophy_pids+=("$!")
done
for trophy_pid in "${trophy_pids[@]}";do wait "$trophy_pid";done
docker "${docker_args[@]}" exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d kino_legacy_test -c "select public.test_assert((select count(*)=2 from public.mv_notifications where route='/legend/couple-double101'),'concurrent scores produce one shared event per recipient');select public.test_assert((select count(*)=1 from public.mv_achievements where achievement_id='couple-double101'),'concurrent writes award shared XP only once');"

bash scripts/test-xp-upgrade.sh
