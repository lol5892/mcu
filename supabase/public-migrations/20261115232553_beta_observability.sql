-- Administrative totals only: no impression text, personal names or photo content.
begin;
create or replace function mv_private.beta_admin_report() returns jsonb language sql stable security definer set search_path='' as $$
 with m as (select
  pg_database_size(current_database()) db_bytes,
  (select count(*) from public.mv_families) pairs,
  (select count(*) from auth.users) accounts,
  (select coalesce(sum(byte_size+thumbnail_bytes),0) from public.mv_media) tracked_bytes,
  (select sum((to_jsonb(o)->'metadata'->>'size')::bigint) from storage.objects o where bucket_id='marvel-private') physical_object_bytes,
  (select count(*) from public.mv_media) files,
  (select count(distinct user_id) from public.mv_operations where created_at>now()-interval '7 days') active_writers_7d),
 cfg as (select * from mv_private.beta_config where singleton)
 select jsonb_build_object('pairs',m.pairs,'accounts',m.accounts,'database_bytes',m.db_bytes,'tracked_file_bytes',m.tracked_bytes,'storage_object_bytes',m.physical_object_bytes,'files',m.files,'accounts_with_writes_7d',m.active_writers_7d,
 'queued_push',(select count(*) from mv_private.push_jobs where status='queued'),'failed_push',(select count(*) from mv_private.push_jobs where status='failed'),'deletion_requests',(select count(*) from public.kv_deletion_requests where resolved_at is null),
 'accepting_families',cfg.accepting_families,'pair_limit',cfg.max_families,'provider_egress_bytes',null,'provider_realtime_peak',null,
 'warnings',(select coalesce(jsonb_agg(w),'[]') from (values
  (case when m.db_bytes>=350000000 then 'DATABASE_ABOVE_70_PERCENT' end),
  (case when greatest(m.tracked_bytes,coalesce(m.physical_object_bytes,0))>=700000000 then 'STORAGE_ABOVE_70_PERCENT' end),
  (case when m.pairs>=cfg.max_families then 'BETA_CAPACITY_REACHED' end)
 )v(w) where w is not null)) from m,cfg;
$$;
revoke all on function mv_private.beta_admin_report() from public,anon,authenticated;
commit;
