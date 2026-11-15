#!/usr/bin/env bash
set -euo pipefail
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
# Only the dedicated synthetic load database in the isolated local container.
c=kino-beta-sql
docker exec "$c" pg_dump -U postgres -Fc -f /tmp/kino-load-backup.dump kino_load_test
docker exec "$c" dropdb -U postgres --if-exists kino_restore_test
docker exec "$c" createdb -U postgres kino_restore_test
docker exec "$c" pg_restore -U postgres --no-owner -d kino_restore_test /tmp/kino-load-backup.dump
for db in kino_load_test kino_restore_test;do
 docker exec "$c" psql -U postgres -d "$db" -Atc "select md5(jsonb_build_object('awards',(select jsonb_agg(to_jsonb(a) order by family_id,achievement_id) from public.mv_achievements a),'members',(select jsonb_agg(to_jsonb(m) order by user_id) from public.mv_members m),'ratings',(select jsonb_agg(to_jsonb(r) order by user_id,project_id,season) from public.mv_ratings r))::text);" > "/tmp/$db-digest"
done
cmp /tmp/kino_load_test-digest /tmp/kino_restore_test-digest
docker exec "$c" psql -U postgres -d kino_restore_test -v ON_ERROR_STOP=1 -c "do \$\$begin if (select count(*) from public.mv_families)<>100 or exists(select 1 from pg_tables where schemaname='public' and tablename like 'mv_%' and not rowsecurity) then raise exception 'Restore verification failed';end if;raise notice 'PASS: restored 100 pairs with exact award IDs, dates, XP, membership, ratings and RLS';end\$\$;"
