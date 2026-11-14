-- One DO statement is atomic even under autocommit. Reapplying is safe.
do $migration$
declare d text;old_formula text;before_meta jsonb;before_seen jsonb;before_jobs jsonb;before_notifications jsonb;changed_count integer;first_run boolean;
begin
 lock table public.mv_achievements,public.mv_notifications,mv_private.push_jobs in share row exclusive mode;
 -- Do not rewrite a message already held by a sender. Wait for normal ACK and retry.
 if exists(select 1 from mv_private.push_jobs j join public.mv_notifications n on n.id=j.notification_id where n.type='achievement' and j.status='sending') then raise exception 'XP_REBASE_DELIVERY_BUSY: wait for sender ACK before retrying';end if;
 if (select count(*) from mv_private.trophy_presentation)<>82 or exists(select 1 from public.mv_achievements a left join mv_private.trophy_presentation p on p.id=a.achievement_id where p.id is null or p.tier not in ('bronze','silver','gold','platinum')) then raise exception 'XP_REBASE_UNMAPPED_AWARD';end if;
 select coalesce(jsonb_agg(to_jsonb(a)-'xp' order by family_id,achievement_id),'[]') into before_meta from public.mv_achievements a;
 select coalesce(jsonb_agg(to_jsonb(s) order by user_id),'[]') into before_seen from public.mv_legend_seen s;
 select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') into before_jobs from mv_private.push_jobs j;
 select coalesce(jsonb_agg(to_jsonb(n)-'title' order by id),'[]') into before_notifications from public.mv_notifications n;
 create table if not exists mv_private.trophy_xp_scale(tier text primary key check(tier in ('bronze','silver','gold','platinum')),xp integer not null check(xp>0));
 alter table mv_private.trophy_xp_scale enable row level security;
 revoke all on mv_private.trophy_xp_scale from public,anon,authenticated;
 insert into mv_private.trophy_xp_scale values('bronze',10) on conflict(tier) do update set xp=excluded.xp;
 insert into mv_private.trophy_xp_scale values('silver',25) on conflict(tier) do update set xp=excluded.xp;
 insert into mv_private.trophy_xp_scale values('gold',50) on conflict(tier) do update set xp=excluded.xp;
 insert into mv_private.trophy_xp_scale values('platinum',100) on conflict(tier) do update set xp=excluded.xp;

 create table if not exists mv_private.xp_releases(version text primary key,applied_at timestamptz not null default now(),backup jsonb not null,report jsonb not null default '{}');
 create table if not exists mv_private.xp_award_revisions(version text not null references mv_private.xp_releases(version),family_id uuid not null,achievement_id text not null,owner text not null,unlocked_at timestamptz not null,historical boolean not null,old_xp integer not null,new_xp integer not null,primary key(version,family_id,achievement_id));
 create table if not exists mv_private.xp_notification_revisions(version text not null references mv_private.xp_releases(version),notification_id uuid not null,old_title text not null,new_title text not null,primary key(version,notification_id));
 alter table mv_private.xp_releases enable row level security;
 alter table mv_private.xp_award_revisions enable row level security;
 alter table mv_private.xp_notification_revisions enable row level security;
 revoke all on mv_private.xp_releases,mv_private.xp_award_revisions,mv_private.xp_notification_revisions from public,anon,authenticated;
 first_run:=not exists(select 1 from mv_private.xp_releases where version='2.5.3');
 if first_run then
 insert into mv_private.xp_releases(version,backup) values('2.5.3',jsonb_build_object('refresh',pg_get_functiondef('mv_private.legend_refresh(uuid,boolean)'::regprocedure),'legend',pg_get_functiondef('public.mv_legend(text[])'::regprocedure)));
 insert into mv_private.xp_award_revisions select '2.5.3',a.family_id,a.achievement_id,a.owner,a.unlocked_at,a.historical,a.xp,s.xp from public.mv_achievements a join mv_private.trophy_presentation p on p.id=a.achievement_id join mv_private.trophy_xp_scale s on s.tier=p.tier;
 end if;
 execute $ddl$create or replace function mv_private.trophy_xp(t text) returns integer language sql stable set search_path='' as $body$select xp from mv_private.trophy_xp_scale where tier=t$body$$ddl$;
 revoke all on function mv_private.trophy_xp(text) from public,anon,authenticated;
 execute $ddl$create or replace function mv_private.canonical_trophy_xp() returns trigger language plpgsql security definer set search_path='' as $body$
 declare correct integer;
 begin
 select s.xp into correct from mv_private.trophy_presentation p join mv_private.trophy_xp_scale s on s.tier=p.tier where p.id=new.achievement_id;
 if correct is null then raise exception 'UNKNOWN_TROPHY_XP';end if;
 new.xp:=correct;return new;
 end$body$$ddl$;
 revoke all on function mv_private.canonical_trophy_xp() from public,anon,authenticated;
 if not exists(select 1 from pg_trigger where tgname='canonical_trophy_xp' and tgrelid='public.mv_achievements'::regclass) then
 create trigger canonical_trophy_xp before insert or update of xp on public.mv_achievements for each row execute function mv_private.canonical_trophy_xp();
 end if;
 alter table public.mv_achievements enable trigger canonical_trophy_xp;
 select pg_get_functiondef('mv_private.legend_refresh(uuid,boolean)'::regprocedure) into d;
 old_formula:='case a->>''rarity'' when ''legendary'' then 100 when ''epic'' then 50 when ''rare'' then 25 else 10 end';
 if position(old_formula in d)>0 then
 d:=replace(d,old_formula,'mv_private.trophy_xp((select tier from mv_private.trophy_presentation where id=a->>''id''))');execute d;
 elsif position('mv_private.trophy_xp(' in d)=0 then raise exception 'UNEXPECTED_XP_ALLOCATOR';end if;
 select pg_get_functiondef('public.mv_legend(text[])'::regprocedure) into d;
 if position($needle$'xp_version','2.5.3'$needle$ in d)=0 then
 if position('jsonb_build_object(''initial'',initial,' in d)=0 then raise exception 'UNEXPECTED_LEGEND_RPC';end if;
 d:=replace(d,'jsonb_build_object(''initial'',initial,','jsonb_build_object(''xp_version'',''2.5.3'',''xp_scale'',(select jsonb_object_agg(tier,xp) from mv_private.trophy_xp_scale),''initial'',initial,');execute d;
 end if;
 update public.mv_achievements a set xp=s.xp from mv_private.trophy_presentation p join mv_private.trophy_xp_scale s on s.tier=p.tier where p.id=a.achievement_id and a.xp is distinct from s.xp;
 get diagnostics changed_count=row_count;
 -- Existing event text/history is repaired without reinsertion, requeue or read-state changes.
 if exists(select 1 from public.mv_notifications n where n.type='achievement' and n.title !~ ' · \+[0-9]+ XP$') then raise exception 'UNEXPECTED_PENDING_TROPHY_TEXT';end if;
 insert into mv_private.xp_notification_revisions
 select '2.5.3',n.id,n.title,regexp_replace(n.title,' · \+[0-9]+ XP$',' · +'||a.xp||' XP')
 from public.mv_notifications n join public.mv_achievements a on a.family_id=n.family_id and n.route='/legend/'||a.achievement_id
 where n.type='achievement' and n.title<>regexp_replace(n.title,' · \+[0-9]+ XP$',' · +'||a.xp||' XP') on conflict do nothing;
 update public.mv_notifications n set title=r.new_title from mv_private.xp_notification_revisions r where r.version='2.5.3' and r.notification_id=n.id and n.title=r.old_title;
 if before_meta is distinct from (select coalesce(jsonb_agg(to_jsonb(a)-'xp' order by family_id,achievement_id),'[]') from public.mv_achievements a) then raise exception 'AWARD_METADATA_CHANGED';end if;
 if before_seen is distinct from (select coalesce(jsonb_agg(to_jsonb(s) order by user_id),'[]') from public.mv_legend_seen s) then raise exception 'SEEN_STATE_CHANGED';end if;
 if before_jobs is distinct from (select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from mv_private.push_jobs j) then raise exception 'PUSH_QUEUE_CHANGED';end if;
 if before_notifications is distinct from (select coalesce(jsonb_agg(to_jsonb(n)-'title' order by id),'[]') from public.mv_notifications n) then raise exception 'NOTIFICATION_METADATA_CHANGED';end if;
 if first_run then
 update mv_private.xp_releases set report=jsonb_build_object('awards',(select count(*) from mv_private.xp_award_revisions where version='2.5.3'),'changed',changed_count,'notification_titles',(select count(*) from mv_private.xp_notification_revisions where version='2.5.3'),'owners',(select jsonb_agg(to_jsonb(q)) from (select family_id,owner,sum(old_xp) old_xp,sum(new_xp) new_xp,sum(new_xp-old_xp) difference from mv_private.xp_award_revisions where version='2.5.3' group by family_id,owner) q)) where version='2.5.3';
 end if;
end$migration$;
