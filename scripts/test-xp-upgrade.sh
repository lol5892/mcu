#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
xp_db=kino_legacy_xp_upgrade
xp_migration=$(printf '%s\n' supabase/migrations/*_fair_xp.sql)
xp_psql=(docker --host=unix:///var/run/docker.sock exec -i kino-beta-sql psql -v ON_ERROR_STOP=1 -U postgres -d "$xp_db")
node scripts/catalog-sql.mjs | "${xp_psql[@]}" >/dev/null
"${xp_psql[@]}" < supabase/tests/xp253-before.sql
# Guard an already claimed message: no partial update may occur.
"${xp_psql[@]}" -c "update mv_private.push_jobs set status='sending' where notification_id='eeeeeeee-1111-4111-8111-111111111111';" >/dev/null
if "${xp_psql[@]}" < "$xp_migration" > /tmp/xp-busy.log 2>&1;then echo 'Expected busy delivery guard';exit 1;fi
grep -q 'XP_REBASE_DELIVERY_BUSY' /tmp/xp-busy.log
"${xp_psql[@]}" -c "select public.xp_test((select jsonb_agg(to_jsonb(a) order by family_id,achievement_id) from public.mv_achievements a)=(select awards from mv_private.xp_test_snapshot),'busy sender leaves every award untouched');update mv_private.push_jobs set status='queued' where notification_id='eeeeeeee-1111-4111-8111-111111111111';"
# Reject an unmapped legacy row instead of silently assigning zero XP.
"${xp_psql[@]}" -c "insert into mv_private.legend_catalog(id,definition) values('unmapped-test',jsonb_build_object('id','unmapped-test','owner','family','rarity','common','metric','watched','projects','[]'::jsonb,'threshold',999));insert into public.mv_achievements(family_id,achievement_id,owner,xp) values('aaaaaaaa-1111-4111-8111-111111111111','unmapped-test','family',10);" >/dev/null
if "${xp_psql[@]}" < "$xp_migration" > /tmp/xp-unmapped.log 2>&1;then echo 'Expected unmapped award guard';exit 1;fi
grep -q 'XP_REBASE_UNMAPPED_AWARD' /tmp/xp-unmapped.log
"${xp_psql[@]}" -c "select public.xp_test(to_regclass('mv_private.trophy_xp_scale') is null,'unmapped award aborts before changes');delete from public.mv_achievements where achievement_id='unmapped-test';delete from mv_private.legend_catalog where id='unmapped-test';"
# Fail after UPDATE has started; PostgreSQL must roll back schema, functions and XP.
"${xp_psql[@]}" -c "create function public.xp_fault() returns trigger language plpgsql as \$\$begin raise exception 'XP253_INJECTED_FAILURE';end\$\$;create trigger xp_fault after update of xp on public.mv_achievements for each row execute function public.xp_fault();" >/dev/null
if "${xp_psql[@]}" < "$xp_migration" > /tmp/xp-fault.log 2>&1;then echo 'Expected transactional failure';exit 1;fi
grep -q 'XP253_INJECTED_FAILURE' /tmp/xp-fault.log
"${xp_psql[@]}" -c "select public.xp_test(to_regclass('mv_private.trophy_xp_scale') is null,'late failure rolls back new schema too');select public.xp_test((select jsonb_agg(to_jsonb(a) order by family_id,achievement_id) from public.mv_achievements a)=(select awards from mv_private.xp_test_snapshot),'late failure leaves all historic awards byte-identical');drop trigger xp_fault on public.mv_achievements;drop function public.xp_fault();"
"${xp_psql[@]}" < "$xp_migration"
"${xp_psql[@]}" < supabase/tests/xp253-after.sql
"${xp_psql[@]}" < "$xp_migration"
"${xp_psql[@]}" -c "select public.xp_test((select count(*)=82 from mv_private.xp_award_revisions where version='2.5.3'),'repeat does not expand original audit');select public.xp_test(not exists(select 1 from public.mv_achievements a join mv_private.trophy_presentation p on p.id=a.achievement_id join mv_private.trophy_xp_scale s on s.tier=p.tier where a.xp<>s.xp),'all history and future awards remain canonical after repeat');"

"${xp_psql[@]}" < scripts/rollback-fair-xp.sql
"${xp_psql[@]}" -c "select public.xp_test((select jsonb_agg(to_jsonb(a) order by family_id,achievement_id) from public.mv_achievements a where family_id='aaaaaaaa-1111-4111-8111-111111111111')=(select awards from mv_private.xp_test_snapshot),'administrative rollback restores every original award exactly');"
"${xp_psql[@]}" < "$xp_migration"
"${xp_psql[@]}" -c "select public.xp_test((select tgenabled='O' from pg_trigger where tgname='canonical_trophy_xp'),'reapply restores canonical guard after rollback');select public.xp_test(not exists(select 1 from public.mv_achievements a join mv_private.trophy_presentation p on p.id=a.achievement_id join mv_private.trophy_xp_scale s on s.tier=p.tier where a.xp<>s.xp),'reapply after rollback returns all history and new awards to fair XP');"

# A concurrent legacy writer waits behind the migration lock, then gets canonical XP.
"${xp_psql[@]}" -c "insert into auth.users values('55555555-5555-4555-8555-555555555555','race@example.test',now());insert into public.mv_profiles(id) values('55555555-5555-4555-8555-555555555555') on conflict do nothing;insert into public.mv_families(id) values('cccccccc-1111-4111-8111-111111111111');insert into public.mv_members(family_id,user_id,role) values('cccccccc-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','anton');" >/dev/null
{ echo "set application_name='xp253-upgrade-lock-test';begin;";cat "$xp_migration";echo 'select pg_sleep(3);commit;'; } | "${xp_psql[@]}" > /tmp/xp-concurrent-migration.log 2>&1 &
xp_migration_pid=$!
xp_lock_ready=false
for xp_iteration in {1..50};do
 if [[ $("${xp_psql[@]}" -Atc "select count(*) from pg_stat_activity where application_name='xp253-upgrade-lock-test' and wait_event='PgSleep'") == 1 ]];then xp_lock_ready=true;break;fi
 sleep .05
done
[[ "$xp_lock_ready" == true ]]
"${xp_psql[@]}" -c "set application_name='xp253-award-lock-test';insert into public.mv_achievements(family_id,achievement_id,owner,xp) values('cccccccc-1111-4111-8111-111111111111','films-1','family',25);" > /tmp/xp-concurrent-award.log 2>&1 &
xp_award_pid=$!
xp_writer_blocked=false
for xp_iteration in {1..30};do
 if [[ $("${xp_psql[@]}" -Atc "select count(*) from pg_stat_activity where application_name='xp253-award-lock-test' and wait_event_type='Lock'") == 1 ]];then xp_writer_blocked=true;break;fi
 sleep .05
done
wait "$xp_migration_pid";wait "$xp_award_pid"
[[ "$xp_writer_blocked" == true ]]
"${xp_psql[@]}" -c "select public.xp_test((select xp=10 from public.mv_achievements where family_id='cccccccc-1111-4111-8111-111111111111' and achievement_id='films-1'),'concurrent legacy writer waits and receives new XP exactly once');"
