-- PUBLIC COPY ONLY. Never apply this release to the original family project.
begin;
do $$begin
 if exists(select 1 from mv_private.bootstrap) or exists(select 1 from public.mv_families) then
  raise exception 'PUBLIC_EMPTY_DATABASE_REQUIRED';
 end if;
end$$;
alter table public.mv_families add column partner_linked_once boolean not null default false;
alter table public.mv_members add column display_name text not null default 'Участник' check(char_length(display_name) between 1 and 40 and display_name !~ '[[:cntrl:]]');
alter table public.mv_profiles add column display_name text not null default 'Участник' check(char_length(display_name) between 1 and 40 and display_name !~ '[[:cntrl:]]');
alter table public.mv_media add column thumbnail_path text, add column thumbnail_bytes integer not null default 0 check(thumbnail_bytes between 0 and 65536);
create table mv_private.beta_config(singleton boolean primary key default true check(singleton),accepting_families boolean not null default false,max_families integer not null default 20 check(max_families between 1 and 100),photo_limit integer not null default 10 check(photo_limit between 1 and 10),byte_limit bigint not null default 8388608 check(byte_limit between 1 and 8388608));
insert into mv_private.beta_config default values;
create table mv_private.beta_enrollments(email text primary key check(email=lower(email)),can_create boolean not null default true,expires_at timestamptz not null default now()+interval '14 days');
create table mv_private.pair_invitations(id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mv_families on delete cascade,author_id uuid not null references public.mv_profiles,email text not null,token_hash text not null unique,code_hash text not null unique,expires_at timestamptz not null default now()+interval '15 minutes',consumed_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now());
create index pair_invites_email on mv_private.pair_invitations(email,expires_at);
create unique index pair_invite_open on mv_private.pair_invitations(family_id) where consumed_at is null and revoked_at is null;
create table mv_private.beta_attempts(user_id uuid not null references auth.users on delete cascade,scope text not null,bucket timestamptz not null,hits integer not null,primary key(user_id,scope,bucket));
create table public.kv_deletion_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.mv_profiles,family_id uuid not null references public.mv_families,kind text not null check(kind in('account','family','disconnect')),created_at timestamptz not null default now(),resolved_at timestamptz);
create unique index deletion_request_open on public.kv_deletion_requests(user_id,kind) where resolved_at is null;
alter table public.kv_deletion_requests enable row level security;
create policy own_request on public.kv_deletion_requests for select to authenticated using(user_id=(select auth.uid()));
grant select on public.kv_deletion_requests to authenticated;
revoke insert,update,delete on public.kv_deletion_requests from anon,authenticated;
do $$declare t text;begin foreach t in array array['beta_config','beta_enrollments','pair_invitations','beta_attempts'] loop execute format('alter table mv_private.%I enable row level security',t);execute format('revoke all on mv_private.%I from public,anon,authenticated',t);end loop;end$$;
create function mv_private.beta_identity() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid;begin select id into u from auth.users where id=auth.uid() and email_confirmed_at is not null;if u is null then raise exception 'EMAIL_NOT_CONFIRMED' using errcode='42501';end if;return u;end$$;
revoke all on function mv_private.beta_identity() from public,anon,authenticated;
-- Closed registration is enforced in the database, even if Auth signup is accidentally enabled.
create function mv_private.beta_auth_gate() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.email is null or not (exists(select 1 from mv_private.beta_enrollments where email=lower(new.email) and expires_at>now()) or exists(select 1 from mv_private.pair_invitations where email=lower(new.email) and expires_at>now() and consumed_at is null and revoked_at is null)) then raise exception 'CLOSED_BETA_REGISTRATION' using errcode='42501';end if;
 return new;
end$$;
revoke all on function mv_private.beta_auth_gate() from public,anon,authenticated;
create trigger kv_closed_beta before insert on auth.users for each row execute function mv_private.beta_auth_gate();
create function mv_private.beta_rate(k text,cap integer) returns boolean language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into mv_private.beta_attempts values(auth.uid(),k,date_trunc('minute',now()),1) on conflict(user_id,scope,bucket) do update set hits=beta_attempts.hits+1 returning hits into n;
 return n<=cap;
end$$;
revoke all on function mv_private.beta_rate(text,integer) from public,anon,authenticated;
create function public.kv_create_pair(p_name text,p_family_name text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=mv_private.beta_identity();f uuid;cfg mv_private.beta_config;nm text:=btrim(p_name);fn text:=btrim(p_family_name);begin
 perform pg_advisory_xact_lock(hashtextextended('beta-user:'||u,0));
 select family_id into f from public.mv_members where user_id=u;if found then return f;end if;
 if nm is null or char_length(nm) not between 1 and 40 or nm ~ '[[:cntrl:]]' or char_length(fn)>100 then raise exception 'INVALID_NAME';end if;
 if not exists(select 1 from mv_private.beta_enrollments e join auth.users a on lower(a.email)=e.email where a.id=u and e.can_create and e.expires_at>now()) then raise exception 'BETA_INVITATION_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('beta-capacity',0));select * into cfg from mv_private.beta_config where singleton;
 if not cfg.accepting_families or (select count(*) from public.mv_families)>=cfg.max_families then raise exception 'BETA_CAPACITY';end if;
 insert into public.mv_profiles(id,display_name) values(u,nm) on conflict(id) do update set display_name=excluded.display_name;
 insert into public.mv_families(name) values(coalesce(nullif(fn,''),'Наша киновселенная')) returning id into f;
 insert into public.mv_members(family_id,user_id,role,display_name) values(f,u,'anton',nm);
 return f;
end$$;
create function public.kv_set_name(p_name text) returns void language plpgsql security definer set search_path='' as $$declare u uuid:=mv_private.beta_identity();nm text:=btrim(p_name);begin
 if mv_private.family() is null then raise exception 'FORBIDDEN';end if;
 if nm is null or char_length(nm) not between 1 and 40 or nm ~ '[[:cntrl:]]' then raise exception 'INVALID_NAME';end if;
 update public.mv_profiles set display_name=nm,updated_at=now() where id=u;update public.mv_members set display_name=nm where user_id=u;
end$$;
create function public.kv_invite(p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=mv_private.beta_identity();f uuid:=mv_private.family();e text:=lower(btrim(p_email));t text;c text;i mv_private.pair_invitations;begin
 if f is null or mv_private.role()<>'anton' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if e is null or length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or e=(select lower(email) from auth.users where id=u) then raise exception 'INVALID_EMAIL';end if;
 perform 1 from public.mv_families where id=f for update;
 if (select count(*) from public.mv_members where family_id=f)>=2 then raise exception 'FAMILY_FULL';end if;
 if (select partner_linked_once from public.mv_families where id=f) then raise exception 'NEW_UNIVERSE_REQUIRED';end if;
 if (select count(*) from mv_private.pair_invitations where author_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'RATE_LIMITED';end if;
 update mv_private.pair_invitations set revoked_at=now() where family_id=f and consumed_at is null and revoked_at is null;
 t:=encode(extensions.gen_random_bytes(32),'hex');c:=upper(encode(extensions.gen_random_bytes(6),'hex'));
 insert into mv_private.pair_invitations(family_id,author_id,email,token_hash,code_hash) values(f,u,e,encode(extensions.digest(t,'sha256'),'hex'),encode(extensions.digest(c,'sha256'),'hex')) returning * into i;
 return jsonb_build_object('id',i.id,'token',t,'code',c,'expires_at',i.expires_at);
end$$;
create function public.kv_revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform mv_private.beta_identity();update mv_private.pair_invitations set revoked_at=now() where id=p_id and family_id=mv_private.family() and author_id=auth.uid() and consumed_at is null;
end$$;
create function public.kv_pair_invitation(p_secret text,p_accept boolean default false,p_name text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=mv_private.beta_identity();i mv_private.pair_invitations;nm text:=btrim(p_name);secret text:=replace(upper(btrim(p_secret)),'-','');begin
 -- Return failures, rather than raising, so failed attempt counters commit.
 if not mv_private.beta_rate(case when p_accept then 'accept' else 'preview' end,10) then return jsonb_build_object('ok',false,'error','RATE_LIMITED');end if;
 if p_secret is null or char_length(p_secret)>100 then return jsonb_build_object('ok',false,'error','INVITATION_INVALID');end if;
 perform pg_advisory_xact_lock(hashtextextended('beta-user:'||u,0));
 select * into i from mv_private.pair_invitations where token_hash=encode(extensions.digest(btrim(p_secret),'sha256'),'hex') or code_hash=encode(extensions.digest(secret,'sha256'),'hex') for update;
 if not found or i.expires_at<=now() or i.consumed_at is not null or i.revoked_at is not null or i.email is distinct from (select lower(email) from auth.users where id=u) then return jsonb_build_object('ok',false,'error','INVITATION_INVALID');end if;
 if not p_accept then return jsonb_build_object('ok',true,'inviter',(select display_name from public.mv_members where user_id=i.author_id),'family_name',(select name from public.mv_families where id=i.family_id),'expires_at',i.expires_at);end if;
 if nm is null or char_length(nm) not between 1 and 40 or nm ~ '[[:cntrl:]]' then return jsonb_build_object('ok',false,'error','INVALID_NAME');end if;
 perform 1 from public.mv_families where id=i.family_id for update;
 if exists(select 1 from public.mv_members where user_id=u) or (select count(*) from public.mv_members where family_id=i.family_id)>=2 or (select partner_linked_once from public.mv_families where id=i.family_id) then return jsonb_build_object('ok',false,'error','FAMILY_FULL');end if;
 insert into public.mv_profiles(id,display_name) values(u,nm) on conflict(id) do update set display_name=excluded.display_name;
 insert into public.mv_members(family_id,user_id,role,display_name) values(i.family_id,u,'tanya',nm);
 update public.mv_families set partner_linked_once=true where id=i.family_id;
 update mv_private.pair_invitations set consumed_at=now() where id=i.id;
 return jsonb_build_object('ok',true,'family_id',i.family_id);
end$$;
-- Retain audited operations, expose only the supported non-messaging intents.
alter function public.mv_apply(uuid,text,text,jsonb,bigint) rename to beta_apply_inner;
alter function public.beta_apply_inner(uuid,text,text,jsonb,bigint) set schema mv_private;
revoke all on function mv_private.beta_apply_inner(uuid,text,text,jsonb,bigint) from public,anon,authenticated;
create function public.mv_apply(p_id uuid,p_kind text,p_target text,p_payload jsonb,p_expected bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform mv_private.beta_identity();
 if p_kind not in('entry','episode','rating','watch_confirm','watch_reject','watch_cancel','session','moment','moment_attach','moment_delete','event','notification_read','reaction') or (p_kind='reaction' and coalesce(p_payload->>'kind','') not in('moment','session')) then raise exception 'FEATURE_RETIRED';end if;
 return mv_private.beta_apply_inner(p_id,p_kind,p_target,p_payload,p_expected);
end$$;
-- The internal roles are slot IDs only. User-visible notifications use actual member names.
create or replace function mv_private.trophy_unlocked() returns trigger language plpgsql security definer set search_path='' as $$
declare m record;p mv_private.trophy_presentation;t text;actor text;begin
 if new.historical or exists(select 1 from mv_private.trophy_baseline b where b.family_id=new.family_id and b.achievement_id=new.achievement_id) then return new;end if;
 select * into p from mv_private.trophy_presentation where id=new.achievement_id;if not found then return new;end if;
 actor:=case when new.owner='family' then 'Ваша пара' else coalesce((select display_name from public.mv_members where family_id=new.family_id and role=new.owner),'Участник') end;
 for m in select user_id from public.mv_members where family_id=new.family_id and (new.owner='family' or role=new.owner) loop
 t:=actor||' · '||case p.tier when 'bronze' then 'БРОНЗА' when 'silver' then 'СЕРЕБРО' when 'gold' then 'ЗОЛОТО' else 'ПЛАТИНА' end||' — «'||p.title||'» · +'||new.xp||' XP';
 perform mv_private.notify(new.family_id,m.user_id,'achievement',t,'/legend/'||new.achievement_id,'trophy:'||new.family_id||':'||new.achievement_id||':'||m.user_id);
 end loop;return new;
end$$;
-- Serialize reservations per family so two phones cannot bypass the total quota.
alter function public.mv_prepare_media(uuid,text,uuid,text,integer) rename to beta_prepare_inner;
alter function public.beta_prepare_inner(uuid,text,uuid,text,integer) set schema mv_private;
revoke all on function mv_private.beta_prepare_inner(uuid,text,uuid,text,integer) from public,anon,authenticated;
create function public.mv_prepare_media(p_id uuid,p_kind text,p_target uuid,p_type text,p_size integer) returns text language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();cfg mv_private.beta_config;begin
 perform mv_private.beta_identity();if f is null then raise exception 'FORBIDDEN';end if;
 if p_kind not in('moment','session','avatar','staged') or p_type<>'image/jpeg' or p_size not between 32 and 524288 then raise exception 'INVALID_IMAGE';end if;
 perform pg_advisory_xact_lock(hashtextextended('beta-storage:'||f,0));select * into cfg from mv_private.beta_config where singleton;
 if not exists(select 1 from public.mv_media where id=p_id) and ((select count(*) from public.mv_media where family_id=f)>=cfg.photo_limit or (select coalesce(sum(case when ready then byte_size+thumbnail_bytes else 589824 end),0) from public.mv_media where family_id=f)+589824>cfg.byte_limit) then raise exception 'FAMILY_PHOTO_QUOTA';end if;
 return mv_private.beta_prepare_inner(p_id,p_kind,p_target,p_type,p_size);
end$$;
create function public.kv_media_thumbnail(p_id uuid,p_size integer) returns void language plpgsql security definer set search_path='' as $$begin
 if p_size not between 1 and 65536 then raise exception 'INVALID_IMAGE';end if;
 update public.mv_media set thumbnail_path=regexp_replace(object_path,'\.jpg$','.thumb.jpg'),thumbnail_bytes=p_size where id=p_id;
end$$;
revoke all on function public.kv_media_thumbnail(uuid,integer) from public,anon,authenticated;
grant execute on function public.kv_media_thumbnail(uuid,integer) to service_role;
create policy beta_thumbnail_read on storage.objects for select to authenticated using(bucket_id='marvel-private' and exists(select 1 from public.mv_media m where m.thumbnail_path=name and mv_private.media_visible(m)));
create function public.kv_storage_usage() returns jsonb language plpgsql stable security definer set search_path='' as $$declare f uuid:=mv_private.family();begin
 if f is null then raise exception 'FORBIDDEN';end if;
 return (select jsonb_build_object('count',(select count(*) from public.mv_media where family_id=f),'bytes',(select coalesce(sum(case when ready then byte_size+thumbnail_bytes else 589824 end),0) from public.mv_media where family_id=f),'photo_limit',photo_limit,'byte_limit',byte_limit) from mv_private.beta_config where singleton);
end$$;
create function public.kv_deletion_request(p_kind text) returns uuid language plpgsql security definer set search_path='' as $$declare f uuid:=mv_private.family();r uuid;begin
 perform mv_private.beta_identity();if f is null or p_kind not in('account','family','disconnect') then raise exception 'FORBIDDEN';end if;
 insert into public.kv_deletion_requests(user_id,family_id,kind) values(auth.uid(),f,p_kind) on conflict(user_id,kind) where resolved_at is null do update set kind=excluded.kind returning id into r;return r;
end$$;
create or replace function public.mv_export() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('app','kino-vdvoem','version',3,'exported_at',now(),'members',(select coalesce(jsonb_agg(m),'[]') from public.mv_members m),'family',(select to_jsonb(f) from public.mv_families f),'entries',(select coalesce(jsonb_agg(e),'[]') from public.mv_entries e),'episodes',(select coalesce(jsonb_agg(e),'[]') from public.mv_episodes e),'ratings',(select coalesce(jsonb_agg(r),'[]') from public.mv_ratings r),'sessions',(select coalesce(jsonb_agg(s),'[]') from public.mv_sessions s),'events',(select coalesce(jsonb_agg(e),'[]') from public.mv_events e),'moments',(select coalesce(jsonb_agg(m),'[]') from public.mv_moments m),'media',(select coalesce(jsonb_agg(m),'[]') from public.mv_media m),'mediaLinks',(select coalesce(jsonb_agg(m),'[]') from public.mv_media_links m),'impressions',(select coalesce(jsonb_agg(i),'[]') from public.mv_impressions i),'achievements',(select coalesce(jsonb_agg(a),'[]') from public.mv_achievements a))
$$;
-- Default-deny obsolete public entry points, including old implementation wrappers.
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'mv_apply_v%' or proname like 'mv_import%' or proname in('mv_create_family','mv_invite','mv_accept_invite','mv_accept_email_invite','mv_join_status','mv_delete_my_data','mv_delete_my_content','mv_claim_legacy','mv_export_v20')) loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'kv_%' and proname<>'kv_media_thumbnail' or proname in('mv_apply','mv_prepare_media')) loop execute 'revoke all on function '||f.signature||' from public,anon';execute 'grant execute on function '||f.signature||' to authenticated';end loop;
end$$;
-- Never expose enrollment emails, tokens, attempt counters, usage reports or admin controls.
create function mv_private.beta_admin_report() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('pairs',(select count(*) from public.mv_families),'members',(select count(*) from public.mv_members),'database_bytes',pg_database_size(current_database()),'file_bytes',(select coalesce(sum(byte_size+thumbnail_bytes),0) from public.mv_media),'files',(select count(*) from public.mv_media),'queued_push',(select count(*) from mv_private.push_jobs where status='queued'),'failed_push',(select count(*) from mv_private.push_jobs where status='failed'),'active_users_7d',(select count(distinct user_id) from public.mv_operations where created_at>now()-interval '7 days'),'deletion_requests',(select count(*) from public.kv_deletion_requests where resolved_at is null),'capacity_reached',(select (select count(*) from public.mv_families)>=max_families from mv_private.beta_config where singleton))
$$;
revoke all on function mv_private.beta_admin_report() from public,anon,authenticated;
do $$declare d text;begin select pg_get_functiondef('public.mv_test_push()'::regprocedure) into d;d:=replace(d,'Наш Marvel','Кино вдвоём');execute d;end$$;
-- Family-scoped indexes support bounded snapshots and the isolation policies.
create index if not exists beta_members_family on public.mv_members(family_id);
create index if not exists beta_entries_family on public.mv_entries(family_id);
create index if not exists beta_episodes_family on public.mv_episodes(family_id);
create index if not exists beta_ratings_family on public.mv_ratings(family_id);
create index if not exists beta_notifications_recipient on public.mv_notifications(recipient_id,created_at desc);
create index if not exists beta_sessions_family on public.mv_sessions(family_id,created_at desc);
create index if not exists beta_moments_family on public.mv_moments(family_id,created_at desc);
create index if not exists beta_events_family on public.mv_events(family_id,starts_at);
update mv_private.trophy_presentation set title='Первый шаг Старка' where id='films-1';
update mv_private.trophy_presentation set title='Нас уже не остановить' where id='films-3';
update mv_private.trophy_presentation set title='Пятёрка супергероев' where id='films-5';
update mv_private.trophy_presentation set title='Фьюри нами гордится' where id='films-10';
update mv_private.trophy_presentation set title='Команда становится легендой' where id='films-15';
update mv_private.trophy_presentation set title='Два сердца. Двадцать историй' where id='films-20';
update mv_private.trophy_presentation set title='Мстители семейного масштаба' where id='films-25';
update mv_private.trophy_presentation set title='Наша собственная сага' where id='films-30';
update mv_private.trophy_presentation set title='Стражи киновселенной' where id='films-35';
update mv_private.trophy_presentation set title='Мы и есть Marvel' where id='all-films-v1';
update mv_private.trophy_presentation set title='Фьюри, мы собрали семью!' where id='phase-1-v1';
update mv_private.trophy_presentation set title='Щ.И.Т. хранит наш союз' where id='phase-2-v1';
update mv_private.trophy_presentation set title='Даже щелчок нас не разлучит' where id='phase-3-v1';
update mv_private.trophy_presentation set title='В каждой вселенной мы вместе' where id='phase-4-v1';
update mv_private.trophy_presentation set title='Семья сильнее мультивселенной' where id='phase-5-v1';
update mv_private.trophy_presentation set title='Наше наследие вечнее времени' where id='phase-6-v1';
update mv_private.trophy_presentation set title='Сердце из реактора' where id='hero-reactor';
update mv_private.trophy_presentation set title='Семья Старков' where id='hero-stark';
update mv_private.trophy_presentation set title='Достойны Мьёльнира' where id='hero-thor';
update mv_private.trophy_presentation set title='До конца пути — вместе' where id='hero-cap';
update mv_private.trophy_presentation set title='Мстители, наш общий сбор!' where id='hero-avengers';
update mv_private.trophy_presentation set title='Я люблю тебя в трёх тысячах вселенных' where id='hero-infinity';
update mv_private.trophy_presentation set title='Наш дружелюбный сосед' where id='hero-spider';
update mv_private.trophy_presentation set title='Мы — свои среди Стражей' where id='hero-guardians';
update mv_private.trophy_presentation set title='Вместе во всех реальностях' where id='hero-strange';
update mv_private.trophy_presentation set title='Большая любовь маленьких героев' where id='hero-ant';
update mv_private.trophy_presentation set title='Ваканда — наша семья' where id='hero-panther';
update mv_private.trophy_presentation set title='Выше звёзд' where id='hero-marvel';
update mv_private.trophy_presentation set title='Фантастическая семья' where id='hero-fantastic';
update mv_private.trophy_presentation set title='Хаос на двоих' where id='hero-deadpool';
update mv_private.trophy_presentation set title='Мы пережили Финал' where id='hero-endgame';
update mv_private.trophy_presentation set title='Первая серия нашей истории' where id='episodes-1';
update mv_private.trophy_presentation set title='Продолжение следует…' where id='episodes-10';
update mv_private.trophy_presentation set title='Ещё одну серию, и спать' where id='episodes-25';
update mv_private.trophy_presentation set title='Сериаломаньяки мультивселенной' where id='episodes-50';
update mv_private.trophy_presentation set title='100 серий вместе' where id='episodes-100';
update mv_private.trophy_presentation set title='Наш первый завершённый сериал' where id='series-1';
update mv_private.trophy_presentation set title='Сериальный союз' where id='series-3';
update mv_private.trophy_presentation set title='Не можем остановиться' where id='series-5';
update mv_private.trophy_presentation set title='Хранители малых экранов' where id='series-10';
update mv_private.trophy_presentation set title='Любовь сильнее магии хаоса' where id='serial-wandavision';
update mv_private.trophy_presentation set title='Семья вне времени' where id='serial-loki';
update mv_private.trophy_presentation set title='Наш собственный вариант мультивселенной' where id='serial-what-if';
update mv_private.trophy_presentation set title='Только мы знаем, что реально' where id='serial-wandavision-trilogy';
update mv_private.trophy_presentation set title='Друзья из Адской кухни' where id='serial-daredevil';
update mv_private.trophy_presentation set title='Щ.И.Т. сообщает: семья под защитой' where id='serial-shield';
update mv_private.trophy_presentation set title='Стрела попала в сердце' where id='serial-hawkeye';
update mv_private.trophy_presentation set title='Новые защитники семьи' where id='defenders-v1';
update mv_private.trophy_presentation set title='Первое мнение героя' where id='anton-ratings-1';
update mv_private.trophy_presentation set title='Пять звёзд от Старка' where id='anton-ratings-5';
update mv_private.trophy_presentation set title='Критик Щ.И.Т.' where id='anton-ratings-10';
update mv_private.trophy_presentation set title='Эксперт Мстителей' where id='anton-ratings-20';
update mv_private.trophy_presentation set title='Легенда кинорейтингов' where id='anton-ratings-30';
update mv_private.trophy_presentation set title='Идеальный кадр' where id='anton-perfect1';
update mv_private.trophy_presentation set title='Строгий судья Асгарда' where id='anton-strict1';
update mv_private.trophy_presentation set title='Знаток сериалов' where id='anton-rated-series5';
update mv_private.trophy_presentation set title='Легенда малого экрана' where id='anton-rated-series10';
update mv_private.trophy_presentation set title='Первое мнение героя' where id='tanya-ratings-1';
update mv_private.trophy_presentation set title='Пять звёзд от Старка' where id='tanya-ratings-5';
update mv_private.trophy_presentation set title='Критик Щ.И.Т.' where id='tanya-ratings-10';
update mv_private.trophy_presentation set title='Эксперт Мстителей' where id='tanya-ratings-20';
update mv_private.trophy_presentation set title='Легенда кинорейтингов' where id='tanya-ratings-30';
update mv_private.trophy_presentation set title='Идеальный кадр' where id='tanya-perfect1';
update mv_private.trophy_presentation set title='Строгий судья Асгарда' where id='tanya-strict1';
update mv_private.trophy_presentation set title='Знаток сериалов' where id='tanya-rated-series5';
update mv_private.trophy_presentation set title='Легенда малого экрана' where id='tanya-rated-series10';
update mv_private.trophy_presentation set title='Первый семейный вердикт' where id='couple-paired1';
update mv_private.trophy_presentation set title='На одной волне' where id='couple-equal1';
update mv_private.trophy_presentation set title='Гражданская война на диване' where id='couple-difference41';
update mv_private.trophy_presentation set title='Два сердца — один рейтинг' where id='couple-double101';
update mv_private.trophy_presentation set title='Наш киноконсилиум' where id='couple-paired5';
update mv_private.trophy_presentation set title='Семейные кинокритики Marvel' where id='couple-paired10';
update mv_private.trophy_presentation set title='Совет Мстителей' where id='couple-paired25';
update mv_private.trophy_presentation set title='Идеальная гармония' where id='couple-equal5';
update mv_private.trophy_presentation set title='Даже спорим как супергерои' where id='couple-difference33';
update mv_private.trophy_presentation set title='Вдвоём: Начало легенды' where id='family-beginning';
update mv_private.trophy_presentation set title='Ты — моя суперсила' where id='family-superpower';
update mv_private.trophy_presentation set title='Любовь, которую не отменит Танос' where id='family-thanos';
update mv_private.trophy_presentation set title='Наш союз крепче вибраниума' where id='family-vibranium';
update mv_private.trophy_presentation set title='Одна команда на всех планетах' where id='family-planets';
update mv_private.trophy_presentation set title='В любом из миров я выбираю тебя' where id='family-worlds';
update mv_private.trophy_presentation set title='Наше большое приключение' where id='family-adventure';
update mv_private.legend_catalog set definition=definition||'{"title": "Первый шаг Старка", "description": "Тони начал с пещеры и коробки деталей. Вы вдвоём — с дивана и одного фильма: бюджет скромнее, удовольствие сопоставимое.", "howTo": "Подтвердить совместный просмотр 1 фильма основного MCU из зафиксированной коллекции.", "displayTier": "bronze"}'::jsonb where id='films-1';
update mv_private.legend_catalog set definition=definition||'{"title": "Нас уже не остановить", "description": "Три фильма — и остановка уже не входит в планы. Похоже, Фьюри незаметно подписал вас на продолжение.", "howTo": "Подтвердить совместный просмотр 3 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "bronze"}'::jsonb where id='films-3';
update mv_private.legend_catalog set definition=definition||'{"title": "Пятёрка супергероев", "description": "Пять историй в коллекции. Супергеройской команде пора выбрать позывные — «Кто забрал попкорн?» пока лидирует.", "howTo": "Подтвердить совместный просмотр 5 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "silver"}'::jsonb where id='films-5';
update mv_private.legend_catalog set definition=definition||'{"title": "Фьюри нами гордится", "description": "Десять фильмов позади. Фьюри готов предложить контракт, если удастся согласовать график с партнёром.", "howTo": "Подтвердить совместный просмотр 10 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "silver"}'::jsonb where id='films-10';
update mv_private.legend_catalog set definition=definition||'{"title": "Команда становится легендой", "description": "Пятнадцать приключений — серьёзная заявка на легенду. Даже костюм Тони успел бы несколько раз обновиться за этот марафон.", "howTo": "Подтвердить совместный просмотр 15 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "gold"}'::jsonb where id='films-15';
update mv_private.legend_catalog set definition=definition||'{"title": "Два сердца. Двадцать историй", "description": "Двадцать историй, а любимый напарник всё тот же. Мультивселенная велика, но место рядом на диване уже занято.", "howTo": "Подтвердить совместный просмотр 20 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "gold"}'::jsonb where id='films-20';
update mv_private.legend_catalog set definition=definition||'{"title": "Мстители семейного масштаба", "description": "Двадцать пять фильмов — семейный штаб работает без выходных. Отряд попкорна просит подкрепление.", "howTo": "Подтвердить совместный просмотр 25 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "gold"}'::jsonb where id='films-25';
update mv_private.legend_catalog set definition=definition||'{"title": "Наша собственная сага", "description": "У Marvel есть продюсеры, у вашей саги — Вы вдвоём. Тридцать фильмов спустя титры всё ещё не хочется пропускать.", "howTo": "Подтвердить совместный просмотр 30 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "gold"}'::jsonb where id='films-30';
update mv_private.legend_catalog set definition=definition||'{"title": "Стражи киновселенной", "description": "Тридцать пять историй под защитой. Енот проверил коллекцию и настоятельно рекомендует новый запас закусок.", "howTo": "Подтвердить совместный просмотр 35 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "platinum"}'::jsonb where id='films-35';
update mv_private.legend_catalog set definition=definition||'{"title": "Мы и есть Marvel", "description": "Фильмы зафиксированной коллекции собраны. Фьюри признал вашу семью отдельной командой — кухню под штаб переделывать необязательно.", "howTo": "Подтвердить совместный просмотр всех 38 фильмов зафиксированной коллекции MCU. Новые проекты не меняют её состав.", "displayTier": "platinum"}'::jsonb where id='all-films-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Фьюри, мы собрали семью!", "description": "Фьюри собирал Мстителей годами. Вы вдвоём справились за шесть фильмов и несколько уютных вечеров.", "howTo": "Подтвердить просмотр всех 6 фильмов фазы 1 MCU. Сериалы и спецвыпуски не нужны.", "displayTier": "gold"}'::jsonb where id='phase-1-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Щ.И.Т. хранит наш союз", "description": "Альтрон хотел порядок во всём мире. Вашей паре хватило порядка в списке второй фазы — и это гораздо приятнее.", "howTo": "Подтвердить просмотр всех 6 фильмов фазы 2 MCU. Сериалы и спецвыпуски не нужны.", "displayTier": "gold"}'::jsonb where id='phase-2-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Даже щелчок нас не разлучит", "description": "Щелчок пережили, до Финала добрались. Танос недооценил силу семейного расписания и упрямого «смотрим дальше».", "howTo": "Подтвердить просмотр всех 11 фильмов фазы 3 MCU. Сериалы и спецвыпуски не нужны.", "displayTier": "gold"}'::jsonb where id='phase-3-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "В каждой вселенной мы вместе", "description": "Стрэндж открывает всё новые реальности. В вашей четвёртой фазе действует один закон: лучшее место — рядом друг с другом.", "howTo": "Подтвердить просмотр всех 7 фильмов фазы 4 MCU. Сериалы и спецвыпуски не нужны.", "displayTier": "gold"}'::jsonb where id='phase-4-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Семья сильнее мультивселенной", "description": "Новые герои меняют правила игры, но семейная команда остаётся прежней. Мультивселенной придётся подстроиться под ваш киновечер.", "howTo": "Подтвердить просмотр всех 6 фильмов фазы 5 MCU. Сериалы и спецвыпуски не нужны.", "displayTier": "gold"}'::jsonb where id='phase-5-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Наше наследие вечнее времени", "description": "Будущие битвы ещё ждут своего часа. Когда шестая фаза соберётся целиком, у вашего семейного наследия появится особенно эффектная глава.", "howTo": "Подтвердить просмотр всех 4 фильмов фазы 6 MCU. Сериалы и спецвыпуски не нужны. Награда ждёт выхода всех четырёх фильмов, включая «Судный день» и «Секретные войны».", "displayTier": "gold"}'::jsonb where id='phase-6-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Сердце из реактора", "description": "Реактор загорелся — и обычный вечер стал началом большой истории. Только не пытайтесь повторить сборку брони на кухне.", "howTo": "Подтвердить полный совместный просмотр: «Железный человек».", "displayTier": "bronze"}'::jsonb where id='hero-reactor';
update mv_private.legend_catalog set definition=definition||'{"title": "Семья Старков", "description": "Три фильма, несколько костюмов и нескончаемые проблемы Тони. Хорошо, что у вашей пары ремонт обычно обходится без взрывов.", "howTo": "Подтвердить полный совместный просмотр: «Железный человек»; «Железный человек 2»; «Железный человек 3».", "displayTier": "silver"}'::jsonb where id='hero-stark';
update mv_private.legend_catalog set definition=definition||'{"title": "Достойны Мьёльнира", "description": "После четырёх приключений Тора молот обязан признать вас достойными. Главное — не проверять это рядом с телевизором.", "howTo": "Подтвердить полный совместный просмотр: «Тор»; «Тор 2: Царство тьмы»; «Тор: Рагнарёк»; «Тор: Любовь и гром».", "displayTier": "silver"}'::jsonb where id='hero-thor';
update mv_private.legend_catalog set definition=definition||'{"title": "До конца пути — вместе", "description": "Щит меняет руки, обещание остаётся. Четыре истории Капитана Америки доказывают: хороший напарник важнее безупречного плана.", "howTo": "Подтвердить полный совместный просмотр: «Первый мститель»; «Первый мститель: Другая война»; «Первый мститель: Противостояние»; «Капитан Америка: Новый мир».", "displayTier": "silver"}'::jsonb where id='hero-cap';
update mv_private.legend_catalog set definition=definition||'{"title": "Мстители, наш общий сбор!", "description": "Самые громкие битвы Marvel прошли через ваш экран. Вы вдвоём, общий сбор — плед уже на боевой позиции.", "howTo": "Подтвердить полный совместный просмотр: «Мстители»; «Мстители: Эра Альтрона»; «Мстители: Война бесконечности»; «Мстители: Финал».", "displayTier": "silver"}'::jsonb where id='hero-avengers';
update mv_private.legend_catalog set definition=definition||'{"title": "Я люблю тебя в трёх тысячах вселенных", "description": "Две истории, после которых цифра три тысячи звучит совсем иначе. Некоторые обещания переживают даже финальные титры.", "howTo": "Подтвердить полный совместный просмотр: «Мстители: Война бесконечности»; «Мстители: Финал».", "displayTier": "silver"}'::jsonb where id='hero-infinity';
update mv_private.legend_catalog set definition=definition||'{"title": "Наш дружелюбный сосед", "description": "Паутина связала четыре паучьи истории. К счастью, для вашего маршрута по Нью-Йорку достаточно пульта.", "howTo": "Подтвердить полный совместный просмотр: «Человек-паук: Возвращение домой»; «Человек-паук: Вдали от дома»; «Человек-паук: Нет пути домой»; «Человек-паук: Совершенно новый день».", "displayTier": "silver"}'::jsonb where id='hero-spider';
update mv_private.legend_catalog set definition=definition||'{"title": "Мы — свои среди Стражей", "description": "Стражи нашли семью на другом конце галактики. Вы вдвоём — намного ближе, зато с не менее отличным саундтреком.", "howTo": "Подтвердить полный совместный просмотр: «Стражи Галактики»; «Стражи Галактики. Часть 2»; «Стражи Галактики. Часть 3».", "displayTier": "silver"}'::jsonb where id='hero-guardians';
update mv_private.legend_catalog set definition=definition||'{"title": "Вместе во всех реальностях", "description": "Два фильма, несколько сломанных реальностей и ни одной инструкции. Хорошо, что путь обратно на общий диван не требует заклинаний.", "howTo": "Подтвердить полный совместный просмотр: «Доктор Стрэндж»; «Доктор Стрэндж: В мультивселенной безумия».", "displayTier": "silver"}'::jsonb where id='hero-strange';
update mv_private.legend_catalog set definition=definition||'{"title": "Большая любовь маленьких героев", "description": "Маленькие герои устроили приключения огромного масштаба. Три фильма спустя даже крошка попкорна кажется отдельной вселенной.", "howTo": "Подтвердить полный совместный просмотр: «Человек-муравей»; «Человек-муравей и Оса»; «Человек-муравей и Оса: Квантомания».", "displayTier": "silver"}'::jsonb where id='hero-ant';
update mv_private.legend_catalog set definition=definition||'{"title": "Ваканда — наша семья", "description": "Ваканда умеет хранить наследие. В вашей семье две истории о Пантере тоже займут особое место — без испытания поединком.", "howTo": "Подтвердить полный совместный просмотр: «Чёрная пантера»; «Чёрная пантера: Ваканда навеки».", "displayTier": "silver"}'::jsonb where id='hero-panther';
update mv_private.legend_catalog set definition=definition||'{"title": "Выше звёзд", "description": "Две космические истории подняли планку выше звёзд. Заодно напомнили: лучший экипаж уже сидит рядом.", "howTo": "Подтвердить полный совместный просмотр: «Капитан Марвел»; «Капитан Марвел 2».", "displayTier": "silver"}'::jsonb where id='hero-marvel';
update mv_private.legend_catalog set definition=definition||'{"title": "Фантастическая семья", "description": "Четверо героев, один фантастический вечер. Суперспособность вашей пары — всегда находить время для своей команды.", "howTo": "Подтвердить полный совместный просмотр: «Фантастическая четвёрка: Первые шаги».", "displayTier": "bronze"}'::jsonb where id='hero-fantastic';
update mv_private.legend_catalog set definition=definition||'{"title": "Хаос на двоих", "description": "Дэдпул добавил хаоса, Росомаха — когтей. Хорошо, что вашему дивану досталась только роль зрителя.", "howTo": "Подтвердить полный совместный просмотр: «Дэдпул и Росомаха».", "displayTier": "bronze"}'::jsonb where id='hero-deadpool';
update mv_private.legend_catalog set definition=definition||'{"title": "Мы пережили Финал", "description": "Финал пережит. Теперь можно выдохнуть, обняться и признать: «ещё один фильм» иногда меняет целый вечер.", "howTo": "Подтвердить полный совместный просмотр: «Мстители: Финал».", "displayTier": "bronze"}'::jsonb where id='hero-endgame';
update mv_private.legend_catalog set definition=definition||'{"title": "Первая серия нашей истории", "description": "Первая серия включена — дверь в маленькие вселенные открыта. Выход там же, где и вход, но Локи уже переставил указатели.", "howTo": "Подтвердить просмотр 1 вышедшего эпизода зафиксированной коллекции сериалов.", "displayTier": "bronze"}'::jsonb where id='episodes-1';
update mv_private.legend_catalog set definition=definition||'{"title": "Продолжение следует…", "description": "Десять эпизодов позади, а заставка стала почти родной. Приложение вежливо воздержится от вопроса «и что дальше?».", "howTo": "Подтвердить просмотр 10 разных вышедших эпизодов зафиксированной коллекции сериалов.", "displayTier": "bronze"}'::jsonb where id='episodes-10';
update mv_private.legend_catalog set definition=definition||'{"title": "Ещё одну серию, и спать", "description": "«Ещё одну серию, и спать» прозвучало слишком убедительно. Даже Локи перестал верить этой версии событий.", "howTo": "Подтвердить просмотр 25 разных вышедших эпизодов зафиксированной коллекции сериалов.", "displayTier": "silver"}'::jsonb where id='episodes-25';
update mv_private.legend_catalog set definition=definition||'{"title": "Сериаломаньяки мультивселенной", "description": "Пятьдесят эпизодов — уже собственная телевизионная хронология. Пульт заслужил отпуск, но вряд ли его получит.", "howTo": "Подтвердить просмотр 50 разных вышедших эпизодов зафиксированной коллекции сериалов.", "displayTier": "gold"}'::jsonb where id='episodes-50';
update mv_private.legend_catalog set definition=definition||'{"title": "100 серий вместе", "description": "Сто серий и сто причин чуть позже лечь спать. Даже Вечные впечатлены вашей выдержкой.", "howTo": "Подтвердить просмотр 100 разных вышедших эпизодов зафиксированной коллекции сериалов.", "displayTier": "platinum"}'::jsonb where id='episodes-100';
update mv_private.legend_catalog set definition=definition||'{"title": "Наш первый завершённый сериал", "description": "Первый сериал завершён — редкий случай, когда все серии действительно посмотрены. Можно гордо закрыть вкладку и тут же выбрать следующую.", "howTo": "Полностью подтвердить просмотр 1 сериала из зафиксированной коллекции сезонов.", "displayTier": "silver"}'::jsonb where id='series-1';
update mv_private.legend_catalog set definition=definition||'{"title": "Сериальный союз", "description": "Три сериала связаны одним семейным маршрутом. Сценаристы ещё спорят о кроссовере, а у вас он уже состоялся.", "howTo": "Полностью подтвердить просмотр 3 сериалов из зафиксированной коллекции сезонов.", "displayTier": "gold"}'::jsonb where id='series-3';
update mv_private.legend_catalog set definition=definition||'{"title": "Не можем остановиться", "description": "Пять завершённых сериалов — остановиться непросто. Впрочем, Щ.И.Т. пока не запретил следующий сезон.", "howTo": "Полностью подтвердить просмотр 5 сериалов из зафиксированной коллекции сезонов.", "displayTier": "gold"}'::jsonb where id='series-5';
update mv_private.legend_catalog set definition=definition||'{"title": "Хранители малых экранов", "description": "Десять сериалов за спиной — малые экраны под надёжной защитой. Теперь даже телевизор знает, кто здесь хранители истории.", "howTo": "Полностью подтвердить просмотр 10 сериалов из зафиксированной коллекции сезонов.", "displayTier": "platinum"}'::jsonb where id='series-10';
update mv_private.legend_catalog set definition=definition||'{"title": "Любовь сильнее магии хаоса", "description": "Ванда меняла реальность ради любви. Вы вдвоём ограничились полным просмотром — заметно безопаснее для соседей.", "howTo": "Подтвердить полный совместный просмотр: «Ванда/Вижн». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "silver"}'::jsonb where id='serial-wandavision';
update mv_private.legend_catalog set definition=definition||'{"title": "Семья вне времени", "description": "Локи освоил время, а вы — оба сезона его приключений. Семейное «потом досмотрим» наконец получило счастливый конец.", "howTo": "Подтвердить полный совместный просмотр: «Локи». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "gold"}'::jsonb where id='serial-loki';
update mv_private.legend_catalog set definition=definition||'{"title": "Наш собственный вариант мультивселенной", "description": "Наблюдатель видел бесчисленные варианты событий. Ваш любимый — тот, где все обязательные серии уже просмотрены вместе.", "howTo": "Подтвердить полный совместный просмотр: «Что, если…?». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "gold"}'::jsonb where id='serial-what-if';
update mv_private.legend_catalog set definition=definition||'{"title": "Только мы знаем, что реально", "description": "Магия, тайны и новая реальность складываются не сразу. Когда все три истории станут доступны, ваша коллекция узнает, что было настоящим.", "howTo": "Подтвердить полный совместный просмотр: «Ванда/Вижн»; «Это всё Агата»; «ВижнКвест». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "gold"}'::jsonb where id='serial-wandavision-trilogy';
update mv_private.legend_catalog set definition=definition||'{"title": "Друзья из Адской кухни", "description": "Адская кухня пережила немало бессонных ночей. Ваш маршрут по двум историям Сорвиголовы тоже потребует выдержки — и хорошего пледа.", "howTo": "Подтвердить полный совместный просмотр: «Сорвиголова»; «Сорвиголова: Рождённый заново». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "platinum"}'::jsonb where id='serial-daredevil';
update mv_private.legend_catalog set definition=definition||'{"title": "Щ.И.Т. сообщает: семья под защитой", "description": "Пока агенты спасали мир сезон за сезоном, вы держали семейный тыл. Щ.И.Т. рекомендует выдать дивану официальный допуск.", "howTo": "Подтвердить полный совместный просмотр: «Агенты Щ.И.Т.». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "platinum"}'::jsonb where id='serial-shield';
update mv_private.legend_catalog set definition=definition||'{"title": "Стрела попала в сердце", "description": "Клинт умеет попадать точно в цель. Шесть эпизодов спустя ваша стрела тоже нашла адрес — уютный совместный вечер.", "howTo": "Подтвердить полный совместный просмотр: «Соколиный глаз». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "silver"}'::jsonb where id='serial-hawkeye';
update mv_private.legend_catalog set definition=definition||'{"title": "Новые защитники семьи", "description": "Защитники собирались непросто, зато ваш список серий наконец стал командой. Адская кухня может спать спокойно, даже если вы ещё нет.", "howTo": "Подтвердить полный совместный просмотр: «Сорвиголова»; «Джессика Джонс»; «Люк Кейдж»; «Железный кулак»; «Защитники»; «Каратель». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "platinum"}'::jsonb where id='defenders-v1';
update mv_private.legend_catalog set definition=definition||'{"title": "Первое мнение героя", "description": "Первый вердикт сохранён. Тони добавил бы к нему презентацию, но одной оценки вполне достаточно.", "howTo": "Сохранить первую личную оценку проекта или сезона.", "displayTier": "bronze"}'::jsonb where id='anton-ratings-1';
update mv_private.legend_catalog set definition=definition||'{"title": "Пять звёзд от Старка", "description": "Пять фильмов оценены — реактор критического мышления запущен. Джарвис пока не возражает против выставленных баллов.", "howTo": "Сохранить личные оценки 5 разных фильмов. Просмотр не обязателен.", "displayTier": "silver"}'::jsonb where id='anton-ratings-5';
update mv_private.legend_catalog set definition=definition||'{"title": "Критик Щ.И.Т.", "description": "Десять оценок заслужили отдельную папку Щ.И.Т. Гриф «секретно» не нужен: партнёр всё равно всё увидит.", "howTo": "Сохранить личные оценки 10 разных фильмов. Просмотр не обязателен.", "displayTier": "silver"}'::jsonb where id='anton-ratings-10';
update mv_private.legend_catalog set definition=definition||'{"title": "Эксперт Мстителей", "description": "Двадцать киновердиктов готовы. На следующем совете Мстителей вам предложат прокомментировать сценарий.", "howTo": "Сохранить личные оценки 20 разных фильмов. Просмотр не обязателен.", "displayTier": "gold"}'::jsonb where id='anton-ratings-20';
update mv_private.legend_catalog set definition=definition||'{"title": "Легенда кинорейтингов", "description": "Тридцать фильмов получили свой балл. Даже Тони придётся подготовиться перед спором с таким кинокритиком.", "howTo": "Сохранить личные оценки 30 разных фильмов. Просмотр не обязателен.", "displayTier": "gold"}'::jsonb where id='anton-ratings-30';
update mv_private.legend_catalog set definition=definition||'{"title": "Идеальный кадр", "description": "Та самая десятка нашлась. Никаких запасных реальностей — это впечатление уже сохранено.", "howTo": "Сохранить оценку 10/10 проекту или сезону.", "displayTier": "bronze"}'::jsonb where id='anton-perfect1';
update mv_private.legend_catalog set definition=definition||'{"title": "Строгий судья Асгарда", "description": "Три балла или меньше: Асгардский суд суров. Право пересмотреть решение остаётся за автором.", "howTo": "Сохранить оценку от 1 до 3 проекту или сезону.", "displayTier": "bronze"}'::jsonb where id='anton-strict1';
update mv_private.legend_catalog set definition=definition||'{"title": "Знаток сериалов", "description": "Пять сериалов прошли личную экспертизу. Теперь вы знаете, где финал, а где только обещание финала.", "howTo": "Оценить 5 разных сериалов; учитывается оценка сериала или его сезона.", "displayTier": "gold"}'::jsonb where id='anton-rated-series5';
update mv_private.legend_catalog set definition=definition||'{"title": "Легенда малого экрана", "description": "Десять сериалов получили вердикт. Пульт может заслуженно попросить отпуск, но оценка уже выставлена.", "howTo": "Оценить 10 разных сериалов; учитывается оценка сериала или его сезона.", "displayTier": "gold"}'::jsonb where id='anton-rated-series10';
update mv_private.legend_catalog set definition=definition||'{"title": "Первое мнение героя", "description": "Первое мнение прозвучало. Фьюри записал бы его в отчёт, а мы сохраним рядом с фильмом.", "howTo": "Сохранить первую личную оценку проекта или сезона.", "displayTier": "bronze"}'::jsonb where id='tanya-ratings-1';
update mv_private.legend_catalog set definition=definition||'{"title": "Пять звёзд от Старка", "description": "Пять фильмов обрели личный рейтинг. Старк уверяет, что вкусы — тоже суперспособность.", "howTo": "Сохранить личные оценки 5 разных фильмов. Просмотр не обязателен.", "displayTier": "silver"}'::jsonb where id='tanya-ratings-5';
update mv_private.legend_catalog set definition=definition||'{"title": "Критик Щ.И.Т.", "description": "Десять личных оценок: Щ.И.Т. начинает считаться с вашим мнением. Даже без пропуска в секретный бункер.", "howTo": "Сохранить личные оценки 10 разных фильмов. Просмотр не обязателен.", "displayTier": "silver"}'::jsonb where id='tanya-ratings-10';
update mv_private.legend_catalog set definition=definition||'{"title": "Эксперт Мстителей", "description": "Двадцать историй разобраны по впечатлениям. Мстители готовы выслушать ваш разбор после спасения мира.", "howTo": "Сохранить личные оценки 20 разных фильмов. Просмотр не обязателен.", "displayTier": "gold"}'::jsonb where id='tanya-ratings-20';
update mv_private.legend_catalog set definition=definition||'{"title": "Легенда кинорейтингов", "description": "Тридцать рейтингов — это уже критическая масса кинокритики. Реактор работает на собственном вкусе.", "howTo": "Сохранить личные оценки 30 разных фильмов. Просмотр не обязателен.", "displayTier": "gold"}'::jsonb where id='tanya-ratings-30';
update mv_private.legend_catalog set definition=definition||'{"title": "Идеальный кадр", "description": "Заслуженная десятка сияет ярче портала. Для этого восторга не понадобилась магия Стрэнджа.", "howTo": "Сохранить оценку 10/10 проекту или сезону.", "displayTier": "bronze"}'::jsonb where id='tanya-perfect1';
update mv_private.legend_catalog set definition=definition||'{"title": "Строгий судья Асгарда", "description": "Низкая оценка тоже честное мнение. Локи попробовал бы оспорить её, но авторское решение сильнее иллюзий.", "howTo": "Сохранить оценку от 1 до 3 проекту или сезону.", "displayTier": "bronze"}'::jsonb where id='tanya-strict1';
update mv_private.legend_catalog set definition=definition||'{"title": "Знаток сериалов", "description": "Пять сериалов получили личный балл. Отличать хорошую развязку от ловкого клиффхэнгера теперь проще.", "howTo": "Оценить 5 разных сериалов; учитывается оценка сериала или его сезона.", "displayTier": "gold"}'::jsonb where id='tanya-rated-series5';
update mv_private.legend_catalog set definition=definition||'{"title": "Легенда малого экрана", "description": "Десять сериалов оценены независимо. Для такой экспертизы агентам Щ.И.Т. пришлось бы отменить все совещания.", "howTo": "Оценить 10 разных сериалов; учитывается оценка сериала или его сезона.", "displayTier": "gold"}'::jsonb where id='tanya-rated-series10';
update mv_private.legend_catalog set definition=definition||'{"title": "Первый семейный вердикт", "description": "Первый общий вердикт готов: у каждого свой балл. Семейный совет работает без единогласия, и это прекрасная новость.", "howTo": "Вашей паре сохранить по личной оценке одного и того же фильма.", "displayTier": "bronze"}'::jsonb where id='couple-paired1';
update mv_private.legend_catalog set definition=definition||'{"title": "На одной волне", "description": "Два зрителя неожиданно настроились на одну частоту. Даже Джарвис не стал бы пересчитывать такое совпадение.", "howTo": "Поставить одному фильму одинаковые личные оценки вашей пары.", "displayTier": "bronze"}'::jsonb where id='couple-equal1';
update mv_private.legend_catalog set definition=definition||'{"title": "Гражданская война на диване", "description": "Капитан и Старк спорили о принципах. У вашей пары разница в четыре балла — диван срочно объявлен нейтральной территорией.", "howTo": "Поставить одному фильму две личные оценки с разницей не менее 4 баллов.", "displayTier": "bronze"}'::jsonb where id='couple-difference41';
update mv_private.legend_catalog set definition=definition||'{"title": "Два сердца — один рейтинг", "description": "Два зрителя, две десятки — абсолютная гармония. Даже Танос не нашёл бы повода для семейного спора об этом фильме.", "howTo": "Вашей паре поставить одному фильму по 10/10.", "displayTier": "silver"}'::jsonb where id='couple-double101';
update mv_private.legend_catalog set definition=definition||'{"title": "Наш киноконсилиум", "description": "Пять фильмов обсудили без обязательного единогласия. Консилиум постановил: две независимые оценки лучше одной навязанной.", "howTo": "Вашей паре оценить одни и те же 5 разных фильмов.", "displayTier": "silver"}'::jsonb where id='couple-paired5';
update mv_private.legend_catalog set definition=definition||'{"title": "Семейные кинокритики Marvel", "description": "Десять фильмов получили два личных вердикта. Щ.И.Т. завёл семейное досье, а попкорн потребовал указать его соавтором.", "howTo": "Вашей паре оценить одни и те же 10 разных фильмов.", "displayTier": "silver"}'::jsonb where id='couple-paired10';
update mv_private.legend_catalog set definition=definition||'{"title": "Совет Мстителей", "description": "Двадцать пять общих киновердиктов — полноценный Совет Мстителей. Правда, самые важные решения всё ещё принимаются на двоих.", "howTo": "Вашей паре оценить одни и те же 25 разных фильмов.", "displayTier": "gold"}'::jsonb where id='couple-paired25';
update mv_private.legend_catalog set definition=definition||'{"title": "Идеальная гармония", "description": "Пять совпадений — уже больше, чем случайный сигнал. Похоже, у вашей команды действительно общий внутренний саундтрек.", "howTo": "Поставить одинаковые личные оценки 5 разным фильмам. Нужны обе оценки проекта.", "displayTier": "silver"}'::jsonb where id='couple-equal5';
update mv_private.legend_catalog set definition=definition||'{"title": "Даже спорим как супергерои", "description": "Три фильма дали повод поспорить как супергерои. Хорошая новость: броню ремонтировать не придётся, а мнение можно изменить.", "howTo": "Поставить 3 разным фильмам две личные оценки с разницей не менее 3 баллов.", "displayTier": "silver"}'::jsonb where id='couple-difference33';
update mv_private.legend_catalog set definition=definition||'{"title": "Вдвоём: Начало легенды", "description": "У каждой легенды есть начало. У вашей — первый подтверждённый фильм и два лучших места рядом.", "howTo": "Подтвердить совместный просмотр 1 фильма основного MCU из зафиксированной коллекции.", "displayTier": "bronze"}'::jsonb where id='family-beginning';
update mv_private.legend_catalog set definition=definition||'{"title": "Ты — моя суперсила", "description": "Десять совместных фильмов доказали: главная суперсила не выдаётся с костюмом. Она просто садится рядом и спрашивает: «включаем?».", "howTo": "Подтвердить совместный просмотр 10 разных фильмов основного MCU из зафиксированной коллекции.", "displayTier": "silver"}'::jsonb where id='family-superpower';
update mv_private.legend_catalog set definition=definition||'{"title": "Любовь, которую не отменит Танос", "description": "Вся Сага бесконечности пройдена вместе. Танос может сколько угодно щёлкать — эти вечера уже стали вашей историей.", "howTo": "Подтвердить совместный просмотр всех 23 фильмов первых трёх фаз MCU. Сериалы и спецвыпуски не нужны.", "displayTier": "platinum"}'::jsonb where id='family-thanos';
update mv_private.legend_catalog set definition=definition||'{"title": "Наш союз крепче вибраниума", "description": "Шесть историй о долге, наследии и стойкости сложились в семейный сплав. Даже вибраниуму есть чему поучиться у вашего союза.", "howTo": "Подтвердить полный совместный просмотр: «Первый мститель»; «Первый мститель: Другая война»; «Первый мститель: Противостояние»; «Капитан Америка: Новый мир»; «Чёрная пантера»; «Чёрная пантера: Ваканда навеки».", "displayTier": "gold"}'::jsonb where id='family-vibranium';
update mv_private.legend_catalog set definition=definition||'{"title": "Одна команда на всех планетах", "description": "Асгард и далёкий космос пройдены одной командой. Где бы ни оказались Тор и Стражи, ваш экипаж остаётся прежним.", "howTo": "Подтвердить полный совместный просмотр: «Тор»; «Тор 2: Царство тьмы»; «Тор: Рагнарёк»; «Тор: Любовь и гром»; «Стражи Галактики»; «Стражи Галактики. Часть 2»; «Стражи Галактики. Часть 3».", "displayTier": "gold"}'::jsonb where id='family-planets';
update mv_private.legend_catalog set definition=definition||'{"title": "В любом из миров я выбираю тебя", "description": "Порталы, паутина и время предлагали множество маршрутов. В каждом из них Вы вдвоём снова выбирают друг друга.", "howTo": "Подтвердить полный совместный просмотр: «Доктор Стрэндж»; «Доктор Стрэндж: В мультивселенной безумия»; «Человек-паук: Нет пути домой»; «Локи». Для сериалов нужны все эпизоды фиксированных сезонов; недоступные проекты не завершают коллекцию.", "displayTier": "gold"}'::jsonb where id='family-worlds';
update mv_private.legend_catalog set definition=definition||'{"title": "Наше большое приключение", "description": "Тридцать фильмов и пять завершённых сериалов — это уже экспедиция. Лучший трофей по-прежнему тот, кто прошёл её рядом.", "howTo": "Подтвердить совместный просмотр 30 фильмов основного MCU и полностью завершить 5 сериалов.", "displayTier": "platinum"}'::jsonb where id='family-adventure';
commit;
