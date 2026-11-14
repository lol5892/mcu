-- Emergency administrative rollback only; never run as part of normal deployment.
-- Restore the compatible 2.5.2 frontend together with this rollback.
do $rollback$
declare backup jsonb;before_meta jsonb;before_jobs jsonb;
begin
 lock table public.mv_achievements,public.mv_notifications,mv_private.push_jobs in share row exclusive mode;
 if exists(select 1 from mv_private.push_jobs j join public.mv_notifications n on n.id=j.notification_id where n.type='achievement' and j.status='sending') then raise exception 'XP_REBASE_DELIVERY_BUSY';end if;
 select r.backup into backup from mv_private.xp_releases r where version='2.5.3';
 if backup is null then raise exception 'NO_XP_BACKUP';end if;
 select jsonb_agg(to_jsonb(a)-'xp' order by family_id,achievement_id) into before_meta from public.mv_achievements a;
 select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') into before_jobs from mv_private.push_jobs j;
 alter table public.mv_achievements disable trigger canonical_trophy_xp;
 execute backup->>'refresh';execute backup->>'legend';
 update public.mv_achievements a set xp=coalesce((select r.old_xp from mv_private.xp_award_revisions r where r.version='2.5.3' and r.family_id=a.family_id and r.achievement_id=a.achievement_id),case c.definition->>'rarity' when 'common' then 10 when 'rare' then 25 when 'epic' then 50 else 100 end) from mv_private.legend_catalog c where c.id=a.achievement_id;
 update public.mv_notifications n set title=regexp_replace(n.title,' · \+[0-9]+ XP$',' · +'||a.xp||' XP') from public.mv_achievements a where n.type='achievement' and n.family_id=a.family_id and n.route='/legend/'||a.achievement_id;
 if before_meta is distinct from (select jsonb_agg(to_jsonb(a)-'xp' order by family_id,achievement_id) from public.mv_achievements a) then raise exception 'ROLLBACK_METADATA_CHANGED';end if;
 if before_jobs is distinct from (select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from mv_private.push_jobs j) then raise exception 'ROLLBACK_PUSH_QUEUE_CHANGED';end if;
 update mv_private.xp_releases set report=report||jsonb_build_object('last_rollback_at',now()) where version='2.5.3';
end$rollback$;
