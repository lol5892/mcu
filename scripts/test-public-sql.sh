#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
container=kino-beta-sql
kv_database=${KV_SQL_DATABASE:-kino_public_test}
case "$kv_database" in kino_public_test|kino_load_test) ;; *) echo "Isolated local test database required";exit 1;;esac
if ! docker inspect "$container" >/dev/null 2>&1;then docker run -d --name "$container" -e POSTGRES_PASSWORD=local-public-beta-only postgres:17-alpine >/dev/null;fi
docker start "$container" >/dev/null
for attempt in {1..30};do docker exec "$container" pg_isready -U postgres >/dev/null && break;sleep 1;done
docker exec "$container" dropdb -U postgres --if-exists "$kv_database"
docker exec "$container" createdb -U postgres "$kv_database"
psql=(docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$kv_database")
python3 - <<'PY' | "${psql[@]}" >/dev/null
from pathlib import Path
import re
s=Path('supabase/tests/bootstrap.sql').read_text()
s=re.sub(r'create role (\w+) ([^;]+);',lambda m:"do $$begin if not exists(select 1 from pg_roles where rolname='"+m[1]+"') then create role "+m[1]+" "+m[2]+";end if;end$$;",s)
print(s)
PY
for f in supabase/migrations/*.sql;do "${psql[@]}" < "$f" >/dev/null;done
node scripts/catalog-sql.mjs | "${psql[@]}" >/dev/null
for f in supabase/public-migrations/*.sql;do "${psql[@]}" < "$f" >/dev/null;done
if [[ "${KV_SCHEMA_ONLY:-0}" == 1 ]];then exit 0;fi
"${psql[@]}" < supabase/tests/public-beta.sql
# Same authenticated user sends two simultaneous accept requests; only one succeeds.
accept_sql="set role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000012',false);select public.kv_pair_invitation((select invite->>'token' from public.beta_test_fixture where b=auth.uid()),true,'Второй');"
"${psql[@]}" -Atc "$accept_sql" > /tmp/kv-accept-a.log &
first=$!
"${psql[@]}" -Atc "$accept_sql" > /tmp/kv-accept-b.log &
second=$!
wait "$first";wait "$second"
[[ $(cat /tmp/kv-accept-a.log /tmp/kv-accept-b.log | grep -c '"ok": true') == 1 ]]
"${psql[@]}" -c "select public.beta_assert((select count(*)=2 from public.mv_members where family_id=(select family_id from public.beta_test_fixture where a='10000000-0000-4000-8000-000000000011')),'concurrent accepts consume one invitation and fill exactly two slots');"
# Race the last available upload slot using the two real member roles.
"${psql[@]}" -c "set role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);do \$\$begin for n in 1..8 loop perform public.mv_prepare_media(gen_random_uuid(),'staged',null,'image/jpeg',300000);end loop;end\$\$;" >/dev/null
upload_pids=()
for user in 10000000-0000-4000-8000-000000000003 10000000-0000-4000-8000-000000000004;do
 "${psql[@]}" -c "set role authenticated;select set_config('request.jwt.claim.sub','$user',false);do \$\$begin perform public.mv_prepare_media(gen_random_uuid(),'staged',null,'image/jpeg',300000);exception when raise_exception then if sqlerrm<>'FAMILY_PHOTO_QUOTA' then raise;end if;end\$\$;" > "/tmp/kv-upload-$user.log" 2>&1 &
 upload_pids+=("$!")
done
for upload_pid in "${upload_pids[@]}";do wait "$upload_pid";done
"${psql[@]}" -c "select public.beta_assert((select count(*)=10 from public.mv_media where family_id=(select family_id from public.beta_test_fixture where a='10000000-0000-4000-8000-000000000003')),'concurrent uploads cannot exceed ten server photos');"
