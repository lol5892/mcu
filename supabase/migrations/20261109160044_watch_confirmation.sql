-- Joint confirmation is enabled for the family; legacy mode remains available
-- for backwards-compatible imports and isolated regression tests.
alter table public.mv_families add column watch_confirmation boolean not null default false;
alter table public.mv_families alter column watch_confirmation set default true;
create table public.mv_watch_requests (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.mv_families on delete cascade,
 project_id text not null references public.mv_projects, season integer not null default 0, episode integer not null default 0,
 requested_by uuid not null references public.mv_profiles, confirmed_by uuid references public.mv_profiles,
 status text not null check(status in('pending','confirmed','rejected','cancelled')),
 proposed_date date, requested_at timestamptz not null default now(), responded_at timestamptz,
 base_version bigint not null default 0, version bigint not null default 1,
 check((season=0 and episode=0) or (season>0 and episode>0)),
 unique(family_id,project_id,season,episode),
 foreign key(family_id,requested_by) references public.mv_members(family_id,user_id),
 foreign key(family_id,confirmed_by) references public.mv_members(family_id,user_id)
);
alter table public.mv_watch_requests enable row level security;
create policy watch_requests_read on public.mv_watch_requests for select to authenticated using(mv_private.member(family_id));
revoke all on public.mv_watch_requests from public,anon,authenticated;
grant select on public.mv_watch_requests to authenticated;
grant all on public.mv_watch_requests to service_role;
create index mv_watch_pending on public.mv_watch_requests(family_id,status,requested_at);

-- Keep the existing, tested operations implementation private. Every client,
-- including old cached versions, goes through the new wrapper.
alter function public.mv_apply(uuid,text,text,jsonb,bigint) set schema mv_private;
alter function mv_private.mv_apply(uuid,text,text,jsonb,bigint) rename to apply_core;
revoke all on function mv_private.apply_core(uuid,text,text,jsonb,bigint) from public,anon,authenticated;

create function mv_private.apply_watch(p_id uuid,p_kind text,p_target text,p_payload jsonb,p_expected bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f uuid:=mv_private.family();w public.mv_watch_requests;pr public.mv_projects;
 en public.mv_entries;ep public.mv_episodes;result jsonb;project text;s int:=0;e int:=0;v bigint:=0;base bigint:=0;
 desired boolean;action text;done boolean;requester uuid;partner uuid;request_version bigint;notification_key text;
begin
 if u is null or f is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if octet_length(p_payload::text)>100000 then raise exception 'PAYLOAD_TOO_LARGE';end if;
 if p_payload ? 'user_id' or p_payload ? 'family_id' or p_payload ? 'author_id' or p_payload ? 'role' then raise exception 'IDENTITY_IS_SERVER_ASSIGNED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_id::text,0));
 select o.result into result from public.mv_operations o where o.user_id=u and o.id=p_id;
 if found then return result;end if;
 if p_kind in('entry','episode') then
  project:=p_target;desired:=(p_payload->>'watched')::boolean;
  if desired is null then raise exception 'INVALID_WATCH_STATE';end if;
  if p_kind='episode' then s:=(p_payload->>'season')::int;e:=(p_payload->>'episode')::int;if s is null or e is null or s<=0 or e<=0 then raise exception 'EPISODE_NOT_RELEASED';end if;end if;
 else
  select * into w from public.mv_watch_requests where id=p_target::uuid and family_id=f;
  if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
  project:=w.project_id;s:=w.season;e:=w.episode;
 end if;
 select * into pr from public.mv_projects where id=project;
 if not found or pr.section='future' or pr.release_date>current_date then raise exception 'PROJECT_NOT_RELEASED';end if;
 if s>0 and not mv_private.valid_episode(project,s,e) then raise exception 'EPISODE_NOT_RELEASED';end if;
 perform pg_advisory_xact_lock(hashtextextended(f::text||project||':'||s||':'||e,0));
 if s=0 then
  select * into en from public.mv_entries where family_id=f and project_id=project for update;
  base:=coalesce(en.version,0);done:=coalesce(en.watched,false);
  if en.project_id is null then insert into public.mv_entries(family_id,project_id,watched,updated_by) values(f,project,false,u) returning * into en;end if;
  if p_payload ? 'note' and coalesce(p_payload->>'note','')<>en.note then
   perform mv_private.check_version(base,p_expected);
   update public.mv_entries set note=p_payload->>'note',version=version+1,updated_by=u,updated_at=now() where family_id=f and project_id=project returning * into en;
  end if;
  v:=en.version;
 else
  select * into ep from public.mv_episodes where family_id=f and project_id=project and season=s and episode=e for update;
  base:=coalesce(ep.version,0);done:=coalesce(ep.watched,false);
  if ep.project_id is null then insert into public.mv_episodes(family_id,project_id,season,episode,watched,updated_by) values(f,project,s,e,false,u) returning * into ep;end if;
  v:=ep.version;
 end if;
 select * into w from public.mv_watch_requests where family_id=f and project_id=project and season=s and episode=e for update;
 if p_kind not in('entry','episode') and w.id is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 action:=null;
 if p_kind in('entry','episode') then
  if desired and s=0 and pr.kind='series' then action:='series_progress';
  elsif not desired then
   -- An old unmark from before the partner confirmed cannot undo a new viewing.
   if w.status='confirmed' and p_expected<=w.base_version and not coalesce((p_payload->>'intent_at')::timestamptz>w.responded_at,false) then action:='obsolete';else action:='cancelled';end if;
  elsif done then action:='already_confirmed';
  elsif w.status in('cancelled','rejected') and p_expected<w.base_version and not coalesce((p_payload->>'intent_at')::timestamptz>w.responded_at,false) then action:='obsolete';
  elsif w.status='pending' then
   if w.requested_by<>u and p_expected>=w.base_version then action:='confirmed';else action:='pending';end if;
  else action:='new_request';end if;
 else
  if p_kind='watch_confirm' and w.requested_by=u then raise exception 'PARTNER_CONFIRMS';end if;
  if p_kind='watch_reject' and w.requested_by=u then raise exception 'PARTNER_CONFIRMS';end if;
  if p_kind='watch_cancel' and w.requested_by<>u then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if w.status<>'pending' or w.version<>p_expected then action:='obsolete';
  else action:=case p_kind when 'watch_confirm' then 'confirmed' when 'watch_reject' then 'rejected' when 'watch_cancel' then 'cancelled' else null end;end if;
  if action is null then raise exception 'UNKNOWN_OPERATION';end if;
 end if;
 if action in('new_request','pending','already_confirmed','series_progress') and v=base then
  if s=0 then update public.mv_entries set version=version+1,updated_by=u,updated_at=now() where family_id=f and project_id=project returning version into v;
  else update public.mv_episodes set version=version+1,updated_by=u where family_id=f and project_id=project and season=s and episode=e returning version into v;end if;
 end if;
 if action='new_request' then
  select user_id into partner from public.mv_members where family_id=f and user_id<>u;
  if partner is null then raise exception 'PARTNER_NOT_JOINED';end if;
  insert into public.mv_watch_requests(family_id,project_id,season,episode,requested_by,status,proposed_date,base_version)
  values(f,project,s,e,u,'pending',coalesce((p_payload->>'watched_date')::date,current_date),base)
  on conflict(family_id,project_id,season,episode) do update set requested_by=u,confirmed_by=null,status='pending',proposed_date=excluded.proposed_date,base_version=excluded.base_version,requested_at=now(),responded_at=null,version=mv_watch_requests.version+1 returning * into w;
  -- A season marked in one batch produces one push, not one per episode.
  notification_key:=case when s>0 then 'watch-series:'||f||':'||project||':'||s||':'||u||':'||to_char(now(),'YYYYMMDDHH24MI') else 'watch-request:'||w.id||':'||w.version end;
  perform mv_private.notify(f,partner,'watch_request','Подтвердим, что посмотрели вместе?','/project/'||project,notification_key);
 elsif action='confirmed' then
  requester:=w.requested_by;
  if s=0 then update public.mv_entries set watched=true,watched_date=coalesce(w.proposed_date,current_date),version=greatest(version,base+1),updated_by=u,updated_at=now() where family_id=f and project_id=project returning version into v;
  else update public.mv_episodes set watched=true,version=greatest(version,base+1),updated_by=u where family_id=f and project_id=project and season=s and episode=e returning version into v;end if;
  update public.mv_watch_requests set status='confirmed',confirmed_by=u,responded_at=now(),version=version+1 where id=w.id returning * into w;
  perform mv_private.notify(f,requester,'watch_confirmed','Просмотр подтверждён ❤️','/project/'||project,'watch-confirmed:'||w.id||':'||w.version);
 elsif action in('cancelled','rejected') then
  if s=0 then update public.mv_entries set watched=false,watched_date=null,version=greatest(version,base+1),updated_by=u,updated_at=now() where family_id=f and project_id=project returning version into v;
  else update public.mv_episodes set watched=false,version=greatest(version,base+1),updated_by=u where family_id=f and project_id=project and season=s and episode=e returning version into v;end if;
  insert into public.mv_watch_requests(family_id,project_id,season,episode,requested_by,status,base_version,responded_at)
  values(f,project,s,e,coalesce(w.requested_by,u),action,v,now())
  on conflict(family_id,project_id,season,episode) do update set status=excluded.status,base_version=v,responded_at=now(),version=mv_watch_requests.version+1 returning * into w;
  if action='rejected' then perform mv_private.notify(f,w.requested_by,'watch_confirmed','Пока оставим непросмотренным','/project/'||project,'watch-rejected:'||w.id||':'||w.version);end if;
 end if;
 result:=jsonb_build_object('id',p_target,'ok',true,'version',v,'watch_status',action,'request_id',w.id);
 insert into public.mv_operations(id,user_id,family_id,result) values(p_id,u,f,result);
 return result;
end $$;
revoke all on function mv_private.apply_watch(uuid,text,text,jsonb,bigint) from public,anon,authenticated;

create function public.mv_apply(p_id uuid,p_kind text,p_target text,p_payload jsonb,p_expected bigint default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce((select watch_confirmation from public.mv_families where id=mv_private.family()),false)
 and ((p_kind='entry' and p_payload ? 'watched') or p_kind='episode' or p_kind in('watch_confirm','watch_reject','watch_cancel'))
 then return mv_private.apply_watch(p_id,p_kind,p_target,p_payload,p_expected);end if;
 return mv_private.apply_core(p_id,p_kind,p_target,p_payload,p_expected);
end $$;
revoke all on function public.mv_apply(uuid,text,text,jsonb,bigint) from public,anon;
grant execute on function public.mv_apply(uuid,text,text,jsonb,bigint) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mv_watch_requests') then alter publication supabase_realtime add table public.mv_watch_requests;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mv_families') then alter publication supabase_realtime add table public.mv_families;end if;
 end if;
end$$;

create or replace function public.mv_export() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if mv_private.family() is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select jsonb_build_object('app','our-marvel-family','version',2,'exportedAt',now(),'userId',auth.uid(),'familyId',mv_private.family(),
 'entries',coalesce((select jsonb_agg(e) from public.mv_entries e),'[]'),
 'episodes',coalesce((select jsonb_agg(e) from public.mv_episodes e),'[]'),
 'ratings',coalesce((select jsonb_agg(r) from public.mv_ratings r),'[]'),
 'messages',coalesce((select jsonb_agg(m) from public.mv_messages m),'[]'),
 'letters',coalesce((select jsonb_agg(l) from public.mv_letters l),'[]'),
 'moments',coalesce((select jsonb_agg(m) from public.mv_moments m),'[]'),
 'events',coalesce((select jsonb_agg(e) from public.mv_events e),'[]'),
 'sessions',coalesce((select jsonb_agg(s) from public.mv_sessions s),'[]'),
 'reactions',coalesce((select jsonb_agg(r) from public.mv_reactions r),'[]'),
 'photoMetadata',coalesce((select jsonb_agg(m) from public.mv_media m),'[]'),
 'favorites',coalesce((select jsonb_agg(f) from public.mv_letter_favorites f),'[]'),
 'ratingHistory',coalesce((select jsonb_agg(h) from public.mv_rating_history h),'[]'),
 'watchRequests',coalesce((select jsonb_agg(w) from public.mv_watch_requests w),'[]')) into result;
 return result;
end $$;

create or replace function public.mv_claim_push(p_limit int default 30) returns table(job_id uuid,device_id uuid,subscription jsonb,notification_id uuid,title text,route text,attempt int) language plpgsql security definer set search_path='' as $$
begin
 return query
 with due as (
 select j.id from mv_private.push_jobs j join public.mv_devices d on d.id=j.device_id join public.mv_notifications n on n.id=j.notification_id join public.mv_profiles p on p.id=n.recipient_id
 where (j.status='queued' or (j.status='sending' and j.leased_until<now())) and j.available_at<=now() and j.attempts<8 and d.enabled
 and (p.notification_types->>'enabled')::boolean=true and coalesce((p.notification_types->>n.type)::boolean,true)
 and not mv_private.quiet(p,now())
 -- Do not deliver stale reminders after event cancellation/time change.
 and (n.type<>'reminder' or exists(select 1 from public.mv_events e where n.route='/events/'||e.id and e.status<>'cancelled' and e.starts_at>now() and n.dedupe_key like 'reminder:'||e.id||':'||e.version||':%'))
 and (n.type<>'watch_request' or exists(select 1 from public.mv_watch_requests w where w.family_id=n.family_id and w.status='pending' and w.requested_by<>n.recipient_id and n.route='/project/'||w.project_id and (n.dedupe_key like 'watch-series:%' or n.dedupe_key='watch-request:'||w.id||':'||w.version)))
 order by j.available_at for update of j skip locked limit least(greatest(p_limit,1),50)
 ), claimed as (
 update mv_private.push_jobs j set status='sending',leased_until=now()+interval '2 minutes',attempts=j.attempts+1 where j.id in(select id from due) returning j.*
 )
 select c.id,d.id,d.subscription,n.id,n.title,n.route,c.attempts from claimed c join public.mv_devices d on d.id=c.device_id join public.mv_notifications n on n.id=c.notification_id;
end $$;


-- Wake the existing, authenticated dispatcher immediately after commit.
-- The minute scheduler remains a retry fallback; no browser receives secrets.
create function mv_private.kick_push() returns trigger language plpgsql security definer set search_path='' as $$
declare app_url text; secret text;
begin
 if to_regnamespace('net') is null then return new;end if;
 if not exists(select 1 from public.mv_devices d join public.mv_profiles p on p.id=d.user_id join public.mv_notifications n on n.id=new.notification_id
 where d.id=new.device_id and d.enabled and (p.notification_types->>'enabled')::boolean=true and coalesce((p.notification_types->>n.type)::boolean,true) and not mv_private.quiet(p,now())) then return new;end if;
 select decrypted_secret into app_url from vault.decrypted_secrets where name='mv_app_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='mv_cron_secret';
 if app_url is null or secret is null then return new;end if;
 perform net.http_post(url:=app_url||'/functions/v1/push-dispatch',headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=55000);
 return new;
exception when others then
 -- Preserve the saved action and queued notification. Cron retries delivery.
 raise warning 'Push wake-up deferred to scheduler';return new;
end $$;
revoke all on function mv_private.kick_push() from public,anon,authenticated;
create trigger mv_push_wakeup after insert on mv_private.push_jobs for each row execute function mv_private.kick_push();
