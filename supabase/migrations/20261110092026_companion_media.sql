-- 2.1: keep existing rows and APIs; publish new photos only with their parent.
alter table public.mv_sessions add column season integer, add column episode integer;
alter table public.mv_sessions add constraint mv_session_episode_pair check ((season is null and episode is null) or (season is not null and episode is not null and season>0 and episode>0));
alter table public.mv_media add column source_sha256 text check(source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$');
alter table public.mv_media drop constraint mv_media_kind_check;
alter table public.mv_media add constraint mv_media_kind_check check(kind in('letter','moment','avatar','session','staged'));
alter table public.mv_messages drop constraint mv_messages_body_check;
alter table public.mv_messages add constraint mv_messages_body_check check(length(body) between 0 and 4000);
create table public.mv_media_links (
 media_id uuid not null references public.mv_media on delete cascade,
 family_id uuid not null references public.mv_families on delete cascade,
 kind text not null check(kind in('message','moment')), target_id uuid not null,
 author_id uuid not null references public.mv_profiles, created_at timestamptz not null default now(),
 primary key(media_id,kind,target_id),
 foreign key(family_id,author_id) references public.mv_members(family_id,user_id)
);
create index mv_media_links_target on public.mv_media_links(family_id,kind,target_id);
create index mv_media_links_author on public.mv_media_links(author_id);
alter table public.mv_media_links enable row level security;
create policy media_links_read on public.mv_media_links for select to authenticated using(mv_private.target_visible(kind,target_id,family_id));
grant select on public.mv_media_links to authenticated;
grant all on public.mv_media_links to service_role;

create or replace function mv_private.media_visible(m public.mv_media) returns boolean language sql stable security definer set search_path='' as $$
 select mv_private.member(m.family_id) and (m.author_id=auth.uid() or (m.ready and (
 m.kind='avatar' or mv_private.target_visible(m.kind,m.target_id,m.family_id) or exists(
 select 1 from public.mv_media_links l where l.media_id=m.id and l.family_id=m.family_id and mv_private.target_visible(l.kind,l.target_id,l.family_id)))))
$$;

create or replace function public.mv_prepare_media(p_id uuid,p_kind text,p_target uuid,p_type text,p_size int) returns text language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();u uuid:=auth.uid();path text;m public.mv_media;
begin
 if f is null or u is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_type not in('image/jpeg','image/png','image/webp') or p_size not between 1 and 3145728 then raise exception 'INVALID_IMAGE';end if;
 perform pg_advisory_xact_lock(hashtextextended('media:'||p_id::text,0));
 select * into m from public.mv_media where id=p_id for update;
 if found then
  if m.author_id<>u or m.family_id<>f or m.kind<>p_kind or m.target_id is distinct from p_target or m.content_type<>p_type then raise exception 'MEDIA_ID_REUSED' using errcode='42501';end if;
  -- byte_size becomes the sanitized size after completion; retries reuse the ID.
  if not m.ready and m.byte_size<>p_size then raise exception 'MEDIA_ID_REUSED';end if;
  return m.object_path;
 end if;
 if p_kind='letter' then
  if not exists(select 1 from public.mv_letters where id=p_target and family_id=f and author_id=u and status in('draft','scheduled')) then raise exception 'LETTER_NOT_EDITABLE';end if;
 elsif p_kind='moment' then
  if not mv_private.target_visible('moment',p_target,f) then raise exception 'FORBIDDEN';end if;
 elsif p_kind='session' then
  if not mv_private.target_visible('session',p_target,f) then raise exception 'FORBIDDEN';end if;
 elsif p_kind='staged' then
  if p_target is not null or p_type<>'image/jpeg' then raise exception 'INVALID_MEDIA_TARGET';end if;
 elsif p_kind<>'avatar' then raise exception 'INVALID_MEDIA_KIND';end if;
 path:=f::text||'/'||u::text||'/'||p_id::text||case p_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.invalid' end;
 insert into public.mv_media(id,family_id,author_id,kind,target_id,object_path,content_type,byte_size) values(p_id,f,u,p_kind,p_target,path,p_type,p_size);
 return path;
end $$;

-- Only the validating Edge Function binds the source hash. A lost response may
-- be retried with the same bytes, but cannot replace an existing private file.
create function public.mv_bind_media_upload(p_id uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare m public.mv_media;
begin
 if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_HASH';end if;
 select * into m from public.mv_media where id=p_id for update;
 if not found then raise exception 'MEDIA_NOT_FOUND';end if;
 if m.source_sha256 is not null and m.source_sha256<>p_hash then raise exception 'MEDIA_ID_REUSED';end if;
 if m.ready and m.source_sha256 is null then raise exception 'MEDIA_ALREADY_COMPLETE';end if;
 update public.mv_media set source_sha256=p_hash where id=p_id and source_sha256 is null;
end $$;
revoke all on function public.mv_bind_media_upload(uuid,text) from public,anon,authenticated;
grant execute on function public.mv_bind_media_upload(uuid,text) to service_role;

-- Validate/lock every attachment before the parent is inserted. No draft parent
-- is visible to the partner if a connection fails during upload/publication.
create function mv_private.attach_media(f uuid,u uuid,k text,t uuid,ids jsonb) returns void language plpgsql security definer set search_path='' as $$
declare mid uuid;m public.mv_media;allow_reuse boolean;
begin
 if ids is null or jsonb_typeof(ids)<>'array' or jsonb_array_length(ids) not between 1 and 12 then raise exception 'INVALID_ATTACHMENTS';end if;
 if not mv_private.target_visible(k,t,f) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if k='message' and not exists(select 1 from public.mv_messages where id=t and family_id=f and author_id=u and deleted_at is null) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 for mid in select distinct value::uuid from jsonb_array_elements_text(ids) loop
  select * into m from public.mv_media where id=mid for update;
  if not found or m.family_id<>f or not m.ready then raise exception 'MEDIA_NOT_READY';end if;
  allow_reuse:=k='moment' and (m.kind in('session','moment') and mv_private.target_visible(m.kind,m.target_id,f) or exists(select 1 from public.mv_media_links l where l.media_id=m.id and l.family_id=f and mv_private.target_visible(l.kind,l.target_id,f)));
  if not allow_reuse and not(m.kind='staged' and m.author_id=u and (not exists(select 1 from public.mv_media_links where media_id=mid) or exists(select 1 from public.mv_media_links where media_id=mid and kind=k and target_id=t))) then raise exception 'MEDIA_NOT_ATTACHABLE' using errcode='42501';end if;
  insert into public.mv_media_links(media_id,family_id,kind,target_id,author_id) values(mid,f,k,t,m.author_id) on conflict do nothing;
 end loop;
end $$;
revoke all on function mv_private.attach_media(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;

-- Preserve the existing watch-confirmation wrapper and CAS core.
alter function public.mv_apply(uuid,text,text,jsonb,bigint) set schema mv_private;
alter function mv_private.mv_apply(uuid,text,text,jsonb,bigint) rename to apply_v20;
revoke all on function mv_private.apply_v20(uuid,text,text,jsonb,bigint) from public,anon,authenticated;
create function public.mv_apply(p_id uuid,p_kind text,p_target text,p_payload jsonb,p_expected bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f uuid:=mv_private.family();result jsonb;rid uuid;ss public.mv_sessions;v bigint;project public.mv_projects;rt public.mv_ratings;season_number int;sc int;was_new boolean;
begin
 if u is null or f is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if octet_length(p_payload::text)>100000 then raise exception 'PAYLOAD_TOO_LARGE';end if;
 if p_payload ?| array['user_id','family_id','author_id','role'] then raise exception 'IDENTITY_IS_SERVER_ASSIGNED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_id::text,0));
 select o.result into result from public.mv_operations o where o.user_id=u and o.id=p_id;
 if found then return result;end if;
 if p_kind='session' then
  -- Serialize starts and join/finish updates for one family. Keep the existing
  -- unique active-session index as an additional database invariant.
  perform pg_advisory_xact_lock(hashtextextended('session:'||f::text,0));
  rid:=p_target::uuid;select * into ss from public.mv_sessions where id=rid for update;
  if found and ss.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if ss.id is null then
   select * into ss from public.mv_sessions where family_id=f and status='active' for update;
   if ss.id is not null then
    rid:=ss.id;
    if not(u=any(ss.participants)) then update public.mv_sessions set participants=array_append(participants,u),version=version+1 where id=rid returning * into ss;end if;
    result:=jsonb_build_object('id',rid,'ok',true,'version',ss.version,'existing',true);
   else
    select * into project from public.mv_projects where id=p_payload->>'project_id' and section<>'future' and release_date<=current_date;
    if not found then raise exception 'PROJECT_NOT_RELEASED';end if;
    if p_payload->>'season' is not null or p_payload->>'episode' is not null then
     if project.kind<>'series' or not mv_private.valid_episode(project.id,(p_payload->>'season')::int,(p_payload->>'episode')::int) then raise exception 'EPISODE_NOT_RELEASED';end if;
    end if;
    insert into public.mv_sessions(id,family_id,project_id,author_id,participants,season,episode) values(rid,f,project.id,u,array[u],(p_payload->>'season')::int,(p_payload->>'episode')::int) returning * into ss;
    perform mv_private.notify_partner(f,'session','Начинаем совместный просмотр ❤️','/sessions/'||rid,'session:'||rid);
    result:=jsonb_build_object('id',rid,'ok',true,'version',ss.version);
   end if;
  else
   if ss.status='finished' then
    if p_payload->>'status' is distinct from 'finished' then raise exception 'SESSION_FINISHED';end if;
   else
    -- Independent join and finish intents commute; minute edits keep CAS.
    if p_payload ? 'film_minute' then perform mv_private.check_version(ss.version,p_expected);end if;
    update public.mv_sessions set status=coalesce(p_payload->>'status',status),film_minute=coalesce((p_payload->>'film_minute')::int,film_minute),participants=case when not(u=any(participants)) then array_append(participants,u) else participants end,finished_at=case when p_payload->>'status'='finished' then now() else finished_at end,version=version+1 where id=rid returning * into ss;
   end if;
   result:=jsonb_build_object('id',rid,'ok',true,'version',ss.version);
  end if;
 elsif p_kind='rating' and exists(select 1 from public.mv_sessions where family_id=f and project_id=p_target and status='finished' and u=any(participants) and (coalesce((p_payload->>'season')::int,0)=0 or season=(p_payload->>'season')::int)) then
  -- Rating one's completed evening is independent of shared watched approval.
  select * into project from public.mv_projects where id=p_target and section<>'future' and release_date<=current_date;
  if not found then raise exception 'PROJECT_NOT_RELEASED';end if;
  season_number:=coalesce((p_payload->>'season')::int,0);
  if season_number<0 or (season_number>0 and not exists(select 1 from jsonb_array_elements(project.seasons) j where (j->>'number')::int=season_number)) then raise exception 'INVALID_SEASON';end if;
  select * into rt from public.mv_ratings where user_id=u and project_id=p_target and season=season_number for update;
  perform mv_private.check_version(rt.version,p_expected);
  insert into public.mv_ratings(family_id,user_id,project_id,season,score,favorite) values(f,u,p_target,season_number,(p_payload->>'score')::int,coalesce((p_payload->>'favorite')::boolean,false))
  on conflict(user_id,project_id,season) do update set score=case when p_payload ? 'score' then excluded.score else mv_ratings.score end,favorite=case when p_payload ? 'favorite' then excluded.favorite else mv_ratings.favorite end,version=mv_ratings.version+1,updated_at=now() returning version,score into v,sc;
  if rt.score is distinct from sc then
   insert into public.mv_rating_history(family_id,user_id,project_id,season,old_score,new_score) values(f,u,p_target,season_number,rt.score,sc);
   perform mv_private.notify_partner(f,'rating','У нас новая оценка','/project/'||p_target,'rating:'||p_id);
  end if;
  result:=jsonb_build_object('id',p_target,'ok',true,'version',v);
 elsif p_kind='moment_attach' then
  rid:=p_target::uuid;
  perform pg_advisory_xact_lock(hashtextextended('moment:'||rid::text,0));
  if not mv_private.target_visible('moment',rid,f) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.attach_media(f,u,'moment',rid,p_payload->'media_ids');
  perform mv_private.notify_partner(f,'photo','Новое воспоминание в нашей вселенной ❤️','/moments/'||rid,'photo-link:'||p_id);
  result:=jsonb_build_object('id',rid,'ok',true,'version',(select version from public.mv_moments where id=rid));
 else
  if p_kind in('message','moment') and p_payload ? 'media_ids' then
   if p_payload->'media_ids'='null'::jsonb or jsonb_typeof(p_payload->'media_ids')<>'array' or jsonb_array_length(p_payload->'media_ids') not between 1 and 12 then raise exception 'INVALID_ATTACHMENTS';end if;
   rid:=p_target::uuid;
   perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||rid::text,0));
   result:=mv_private.apply_v20(p_id,p_kind,p_target,p_payload,p_expected);
   -- Everything, including the parent and notification, rolls back on failure.
   perform mv_private.attach_media(f,u,p_kind,rid,p_payload->'media_ids');
   if p_kind='moment' then perform mv_private.notify_partner(f,'photo','Новое воспоминание в нашей вселенной ❤️','/moments/'||rid,'photo-link:'||p_id);end if;
   return result;
  end if;
  if p_kind='message' and length(btrim(coalesce(p_payload->>'body','')))=0 and not exists(select 1 from public.mv_media_links where kind='message' and target_id=p_target::uuid and family_id=f) then raise exception 'EMPTY_MESSAGE';end if;
  return mv_private.apply_v20(p_id,p_kind,p_target,p_payload,p_expected);
 end if;
 insert into public.mv_operations(id,user_id,family_id,result) values(p_id,u,f,result);
 return result;
end $$;
revoke all on function public.mv_apply(uuid,text,text,jsonb,bigint) from public,anon;
grant execute on function public.mv_apply(uuid,text,text,jsonb,bigint) to authenticated;

create function mv_private.remove_media_links() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.mv_media_links where kind=case tg_table_name when 'mv_messages' then 'message' else 'moment' end and target_id=old.id;return old;end $$;
revoke all on function mv_private.remove_media_links() from public,anon,authenticated;
create trigger mv_message_links_cleanup after delete on public.mv_messages for each row execute function mv_private.remove_media_links();
create trigger mv_moment_links_cleanup after delete on public.mv_moments for each row execute function mv_private.remove_media_links();

-- Export through invoker RLS, retaining all previous keys and backup version.
alter function public.mv_export() rename to mv_export_v20;
create function public.mv_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.mv_export_v20()||jsonb_build_object('mediaLinks',coalesce((select jsonb_agg(l) from public.mv_media_links l),'[]'))
$$;
revoke all on function public.mv_export() from public,anon;
grant execute on function public.mv_export() to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mv_media_links') then alter publication supabase_realtime add table public.mv_media_links;end if;
end $$;
