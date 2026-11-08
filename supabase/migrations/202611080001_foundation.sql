-- Additive schema. Never touches the v1 IndexedDB database or unrelated tables.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists mv_private;
revoke all on schema mv_private from public, anon, authenticated;

create table public.mv_families (
 id uuid primary key default gen_random_uuid(), name text not null default 'Наша маленькая вселенная' check(length(name)<=100), created_at timestamptz not null default now()
);
create table public.mv_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 avatar_path text, welcome_seen_at timestamptz, onboarding_seen_at timestamptz,
 read_receipts boolean not null default false, timezone text not null default 'Europe/Moscow',
 notification_types jsonb not null default '{}', quiet_start time not null default '22:00', quiet_end time not null default '09:00',
 reminder_hours integer[] not null default '{24,1}', nudge_frequency integer not null default 0 check(nudge_frequency in(0,1,2)), letter_nudges boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.mv_members (
 family_id uuid not null references public.mv_families on delete cascade,
 user_id uuid primary key references public.mv_profiles on delete cascade,
 role text not null check(role in('anton','tanya')), joined_at timestamptz not null default now(),
 unique(family_id,role), unique(family_id,user_id)
);
-- Exactly two slots: UNIQUE(family,role) + a closed two-value role constraint.
create table mv_private.bootstrap (
 singleton boolean primary key default true check(singleton), owner_email text not null check(owner_email=lower(owner_email)), family_id uuid unique references public.mv_families,
 welcome_scenes jsonb not null default '[]', welcome_body text not null default ''
);
create table mv_private.invitations (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.mv_families,
 email text not null check(email=lower(email)), token_hash text not null unique,
 expires_at timestamptz not null, accepted_at timestamptz, created_at timestamptz not null default now()
);
create unique index mv_one_active_invitation on mv_private.invitations(family_id) where accepted_at is null;
create table public.mv_projects (
 id text primary key check(id ~ '^[a-z0-9-]{1,100}$'), title text not null, release_date date not null,
 kind text not null check(kind in('film','series','special')), section text not null,
 seasons jsonb not null default '[]'
);
create table public.mv_entries (
 family_id uuid not null references public.mv_families on delete cascade, project_id text not null references public.mv_projects,
 watched boolean not null default false, watched_date date, note text not null default '' check(length(note)<=20000),
 version bigint not null default 1, updated_by uuid not null references public.mv_profiles, updated_at timestamptz not null default now(),
 primary key(family_id,project_id)
);
create table public.mv_episodes (
 family_id uuid not null references public.mv_families on delete cascade, project_id text not null references public.mv_projects,
 season integer not null check(season>0), episode integer not null check(episode>0), watched boolean not null,
 version bigint not null default 1, updated_by uuid not null references public.mv_profiles, updated_at timestamptz not null default now(),
 primary key(family_id,project_id,season,episode)
);
create table public.mv_ratings (
 family_id uuid not null references public.mv_families on delete cascade, user_id uuid not null references public.mv_profiles,
 project_id text not null references public.mv_projects, season integer not null default 0 check(season>=0),
 score integer check(score between 1 and 10), favorite boolean not null default false,
 version bigint not null default 1, updated_at timestamptz not null default now(),
 primary key(user_id,project_id,season), foreign key(family_id,user_id) references public.mv_members(family_id,user_id)
);
create table public.mv_rating_history (
 id bigint generated always as identity primary key, family_id uuid not null references public.mv_families on delete cascade,
 user_id uuid not null references public.mv_profiles, project_id text not null, season integer not null,
 old_score integer, new_score integer, changed_at timestamptz not null default now()
);
create table public.mv_operations (
 id uuid not null, user_id uuid not null references public.mv_profiles on delete cascade,
 family_id uuid not null references public.mv_families on delete cascade, result jsonb not null, created_at timestamptz not null default now(),primary key(user_id,id)
);
create table public.mv_legacy_ratings (
 family_id uuid not null references public.mv_families on delete cascade, role text not null check(role in('anton','tanya')),
 project_id text not null references public.mv_projects, score integer not null check(score between 1 and 10), claimed_by uuid references public.mv_profiles,
 imported_by uuid not null references public.mv_profiles, imported_at timestamptz not null default now(),primary key(family_id,role,project_id)
);
create table public.mv_welcome (
 family_id uuid primary key references public.mv_families on delete cascade, scenes jsonb not null, body text not null
);

create function mv_private.family() returns uuid language sql stable security definer set search_path='' as $$ select family_id from public.mv_members where user_id=auth.uid() $$;
create function mv_private.member(f uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.mv_members where user_id=auth.uid() and family_id=f) $$;
create function mv_private.role() returns text language sql stable security definer set search_path='' as $$ select role from public.mv_members where user_id=auth.uid() $$;
-- Policies need EXECUTE, not table access to this schema.
grant usage on schema mv_private to authenticated;
grant execute on function mv_private.family(),mv_private.member(uuid),mv_private.role() to authenticated;

create function public.mv_create_family() returns uuid language plpgsql security definer set search_path='' as $$
declare b mv_private.bootstrap; u auth.users; f uuid;
begin
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'EMAIL_NOT_CONFIRMED'; end if;
 select * into b from mv_private.bootstrap where singleton for update;
 if not found or lower(u.email)<>b.owner_email then raise exception 'OWNER_NOT_ALLOWED' using errcode='42501'; end if;
 if b.family_id is not null then return b.family_id; end if;
 if length(b.welcome_body)=0 or jsonb_typeof(b.welcome_scenes)<>'array' or jsonb_array_length(b.welcome_scenes)<>3 then raise exception 'WELCOME_NOT_PROVISIONED';end if;
 insert into public.mv_profiles(id) values(u.id) on conflict do nothing;
 insert into public.mv_families default values returning id into f;
 insert into public.mv_members values(f,u.id,'anton',now());
 update mv_private.bootstrap set family_id=f where singleton;
 insert into public.mv_welcome values(f,b.welcome_scenes,b.welcome_body);
 return f;
end $$;
create function public.mv_invite(p_email text) returns text language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family(); t text;
begin
 if mv_private.role()<>'anton' or f is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 then raise exception 'INVALID_EMAIL'; end if;
 if exists(select 1 from public.mv_members where family_id=f and role='tanya') then raise exception 'FAMILY_FULL'; end if;
 if lower(p_email)=(select lower(email) from auth.users where id=auth.uid()) then raise exception 'DIFFERENT_ACCOUNT_REQUIRED'; end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 update mv_private.invitations set accepted_at=now() where family_id=f and accepted_at is null;
 insert into mv_private.invitations(family_id,email,token_hash,expires_at) values(f,lower(trim(p_email)),encode(extensions.digest(t,'sha256'),'hex'),now()+interval '7 days');
 return t;
end $$;
create function public.mv_accept_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i mv_private.invitations; u auth.users;
begin
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'EMAIL_NOT_CONFIRMED'; end if;
 select * into i from mv_private.invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found or i.expires_at<=now() or i.accepted_at is not null or lower(u.email)<>i.email then raise exception 'INVITATION_INVALID' using errcode='42501'; end if;
 perform 1 from public.mv_families where id=i.family_id for update;
 if exists(select 1 from public.mv_members where user_id=u.id) then raise exception 'ALREADY_MEMBER'; end if;
 insert into public.mv_profiles(id) values(u.id) on conflict do nothing;
 insert into public.mv_members values(i.family_id,u.id,'tanya',now());
 update mv_private.invitations set accepted_at=now() where id=i.id;
 return i.family_id;
end $$;
create function public.mv_update_profile(p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if mv_private.family() is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p ? 'timezone' and not exists(select 1 from pg_timezone_names where name=p->>'timezone') then raise exception 'INVALID_TIMEZONE';end if;
 if p ? 'reminder_hours' and (jsonb_array_length(p->'reminder_hours')>4 or exists(select 1 from jsonb_array_elements_text(p->'reminder_hours') v where v::int not between 1 and 168)) then raise exception 'INVALID_REMINDERS';end if;
 update public.mv_profiles set
 timezone=coalesce(p->>'timezone',timezone), read_receipts=coalesce((p->>'read_receipts')::boolean,read_receipts),
 welcome_seen_at=case when p->>'welcome_seen'='true' then coalesce(welcome_seen_at,now()) else welcome_seen_at end,
 onboarding_seen_at=case when p->>'onboarding_seen'='true' then coalesce(onboarding_seen_at,now()) else onboarding_seen_at end,
 notification_types=coalesce(p->'notification_types',notification_types),quiet_start=coalesce((p->>'quiet_start')::time,quiet_start),quiet_end=coalesce((p->>'quiet_end')::time,quiet_end),
 reminder_hours=case when p ? 'reminder_hours' then array(select value::integer from jsonb_array_elements_text(p->'reminder_hours')) else reminder_hours end,
 nudge_frequency=coalesce((p->>'nudge_frequency')::int,nudge_frequency),letter_nudges=coalesce((p->>'letter_nudges')::boolean,letter_nudges),updated_at=now()
 where id=auth.uid();
end $$;

-- All client writes are RPCs: table grants are read-only even if an RLS policy
-- is accidentally broadened later. Catalog is public; private family rows aren't.
alter table public.mv_families enable row level security;
alter table public.mv_profiles enable row level security;
alter table public.mv_members enable row level security;
alter table public.mv_projects enable row level security;
alter table public.mv_entries enable row level security;
alter table public.mv_episodes enable row level security;
alter table public.mv_ratings enable row level security;
alter table public.mv_rating_history enable row level security;
alter table public.mv_operations enable row level security;
alter table public.mv_legacy_ratings enable row level security;
alter table public.mv_welcome enable row level security;
create policy family_read on public.mv_families for select to authenticated using(mv_private.member(id));
create policy profiles_read on public.mv_profiles for select to authenticated using(id=auth.uid());
-- Partner exposes only avatar through a dedicated safe RPC, not settings.
create policy members_read on public.mv_members for select to authenticated using(mv_private.member(family_id));
create policy catalog_read on public.mv_projects for select to anon,authenticated using(true);
create policy entries_read on public.mv_entries for select to authenticated using(mv_private.member(family_id));
create policy episodes_read on public.mv_episodes for select to authenticated using(mv_private.member(family_id));
create policy ratings_read on public.mv_ratings for select to authenticated using(mv_private.member(family_id));
create policy history_read on public.mv_rating_history for select to authenticated using(mv_private.member(family_id));
create policy operations_read on public.mv_operations for select to authenticated using(user_id=auth.uid());
create policy legacy_read on public.mv_legacy_ratings for select to authenticated using(mv_private.member(family_id) and role=mv_private.role());
create policy welcome_read on public.mv_welcome for select to authenticated using(mv_private.member(family_id) and mv_private.role()='tanya');
grant select on public.mv_projects to anon,authenticated;
grant select on public.mv_families,public.mv_profiles,public.mv_members,public.mv_entries,public.mv_episodes,public.mv_ratings,public.mv_rating_history,public.mv_operations,public.mv_legacy_ratings,public.mv_welcome to authenticated;
revoke all on all tables in schema mv_private from public,anon,authenticated;
-- Functions default to PUBLIC EXECUTE in Postgres: revoke it explicitly.
revoke execute on function public.mv_create_family(),public.mv_invite(text),public.mv_accept_invite(text),public.mv_update_profile(jsonb) from public,anon;
grant execute on function public.mv_create_family(),public.mv_invite(text),public.mv_accept_invite(text),public.mv_update_profile(jsonb) to authenticated;
