#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Only the dedicated disposable integration container/database is touched.
docker_args=(--host=unix:///var/run/docker.sock)
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
if ! docker "${docker_args[@]}" inspect our-marvel-sql-test >/dev/null 2>&1; then
 docker "${docker_args[@]}" run -d --name our-marvel-sql-test -e POSTGRES_PASSWORD=local-integration-only postgres:17-alpine
fi
docker "${docker_args[@]}" start our-marvel-sql-test >/dev/null
for attempt in {1..30}; do docker "${docker_args[@]}" exec our-marvel-sql-test pg_isready -U postgres >/dev/null && break; sleep 1; done
docker "${docker_args[@]}" exec our-marvel-sql-test dropdb -U postgres --if-exists marvel_test
docker "${docker_args[@]}" exec our-marvel-sql-test createdb -U postgres marvel_test
# Roles are cluster-wide, so bootstrap roles conditionally on repeated runs.
python - <<'PY' | docker "${docker_args[@]}" exec -i our-marvel-sql-test psql -v ON_ERROR_STOP=1 -U postgres -d marvel_test
from pathlib import Path
s=Path('supabase/tests/bootstrap.sql').read_text()
import re
s=re.sub(r'create role (\w+) ([^;]+);',lambda m:"do $$begin if not exists(select 1 from pg_roles where rolname='"+m[1]+"') then create role "+m[1]+" "+m[2]+";end if;end$$;",s)
print(s)
PY
for file in supabase/migrations/*.sql;do docker "${docker_args[@]}" exec -i our-marvel-sql-test psql -v ON_ERROR_STOP=1 -U postgres -d marvel_test < "$file";done
node scripts/catalog-sql.mjs | docker "${docker_args[@]}" exec -i our-marvel-sql-test psql -v ON_ERROR_STOP=1 -U postgres -d marvel_test
docker "${docker_args[@]}" exec -i our-marvel-sql-test psql -v ON_ERROR_STOP=1 -U postgres -d marvel_test < supabase/tests/security.sql
docker "${docker_args[@]}" exec -i our-marvel-sql-test psql -v ON_ERROR_STOP=1 -U postgres -d marvel_test < supabase/tests/ux21.sql
docker "${docker_args[@]}" exec -i our-marvel-sql-test psql -v ON_ERROR_STOP=1 -U postgres -d marvel_test < supabase/tests/legend23.sql
