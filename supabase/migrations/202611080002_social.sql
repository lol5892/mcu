create table public.mv_letters (
 id uuid primary key, family_id uuid not null references public.mv_families on delete cascade,
 author_id uuid not null references public.mv_profiles, recipient_id uuid not null references public.mv_profiles,
 title text not null check(length(title) between 1 and 120), body text not null check(length(body) between 1 and 20000),
 style text not null default 'romantic' check(style in('romantic','cosmic','minimal','surprise')),
 status text not null default 'draft' check(status in('draft','scheduled','delivered','cancelled')),
 scheduled_at timestamptz, delivered_at timestamptz, read_at timestamptz, reply_to uuid references public.mv_letters,
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(author_id<>recipient_id), check((status='delivered')=(delivered_at is not null)),
 foreign key(family_id,author_id) references public.mv_members(family_id,user_id),foreign key(family_id,recipient_id) references public.mv_members(family_id,user_id)
);
create table public.mv_sessions (
 id uuid primary key, family_id uuid not null references public.mv_families on delete cascade,
 project_id text not null references public.mv_projects, author_id uuid not null references public.mv_profiles,
 status text not null default 'active' check(status in('active','finished')), film_minute integer not null default 0 check(film_minute between 0 and 1440),
 participants uuid[] not null default '{}', version bigint not null default 1, created_at timestamptz not null default now(), finished_at timestamptz
);
create unique index mv_one_active_session on public.mv_sessions(family_id) where status='active';
create table public.mv_events (
 id uuid primary key, family_id uuid not null references public.mv_families on delete cascade, project_id text not null references public.mv_projects,
 author_id uuid not null references public.mv_profiles, starts_at timestamptz not null, timezone text not null,
 season integer, episode integer, location text not null default '' check(length(location)<=300), note text not null default '' check(length(note)<=2000),
 status text not null default 'invited' check(status in('invited','confirmed','proposed','cancelled')),
 proposed_at timestamptz, proposed_by uuid references public.mv_profiles, confirmed_by uuid references public.mv_profiles, version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.mv_moments (
 id uuid primary key, family_id uuid not null references public.mv_families on delete cascade, author_id uuid not null references public.mv_profiles,
 project_id text references public.mv_projects, session_id uuid references public.mv_sessions,
 caption text not null default '' check(length(caption)<=2000), moment_date date not null default current_date,
 created_at timestamptz not null default now(),version bigint not null default 1
);
create table public.mv_messages (
 id uuid primary key, family_id uuid not null references public.mv_families on delete cascade, author_id uuid not null references public.mv_profiles,
 scope text not null check(scope in('chat','project','session','moment')), target text not null default '',
 body text not null check(length(body) between 1 and 4000), spoiler boolean not null default false,
 reply_to uuid references public.mv_messages, edited_at timestamptz, deleted_at timestamptz,
 version bigint not null default 1, created_at timestamptz not null default now()
);
create table public.mv_reactions (
 family_id uuid not null references public.mv_families on delete cascade, user_id uuid not null references public.mv_profiles,
 kind text not null check(kind in('message','letter','moment','session')), target_id uuid not null,
 emoji text not null check(emoji in('❤️','😂','😱','🔥','🥹')),created_at timestamptz not null default now(),
 primary key(user_id,kind,target_id,emoji)
);
create table public.mv_letter_favorites (
 user_id uuid not null references public.mv_profiles on delete cascade, letter_id uuid not null references public.mv_letters on delete cascade, primary key(user_id,letter_id)
);
create table public.mv_media (
 id uuid primary key, family_id uuid not null references public.mv_families on delete cascade, author_id uuid not null references public.mv_profiles,
 kind text not null check(kind in('letter','moment','avatar','session')), target_id uuid,
 object_path text not null unique, content_type text not null check(content_type in('image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 3145728), ready boolean not null default false, created_at timestamptz not null default now()
);
create table public.mv_devices (
 id uuid primary key, user_id uuid not null references public.mv_profiles on delete cascade, family_id uuid not null references public.mv_families on delete cascade,
 name text not null check(length(name)<=80), subscription jsonb not null, enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index mv_push_endpoint on public.mv_devices((subscription->>'endpoint'));
create table public.mv_notifications (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.mv_families on delete cascade,
 recipient_id uuid not null references public.mv_profiles, type text not null, title text not null,
 route text not null check(route ~ '^/(letters|chat|project|moments|events|sessions|settings)(/[a-zA-Z0-9-]+)?$'),
 dedupe_key text not null unique, read_at timestamptz, created_at timestamptz not null default now()
);
create table mv_private.push_jobs (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.mv_notifications on delete cascade,
 device_id uuid not null references public.mv_devices on delete cascade, status text not null default 'queued' check(status in('queued','sending','sent','failed')),
 available_at timestamptz not null default now(), leased_until timestamptz, attempts int not null default 0,
 sent_at timestamptz, last_error text,unique(notification_id,device_id)
);
create table mv_private.push_attempts (id uuid primary key, job_id uuid not null references mv_private.push_jobs on delete cascade,created_at timestamptz not null default now());

create function mv_private.letter_visible(l public.mv_letters) returns boolean language sql stable security definer set search_path='' as $$
 select mv_private.member(l.family_id) and (l.author_id=auth.uid() or (l.recipient_id=auth.uid() and l.status='delivered' and l.delivered_at<=now()))
$$;
create function mv_private.target_visible(k text,t uuid,f uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not mv_private.member(f) then return false; end if;
 if k='letter' then return exists(select 1 from public.mv_letters l where l.id=t and l.family_id=f and mv_private.letter_visible(l));end if;
 if k='message' then return exists(select 1 from public.mv_messages where id=t and family_id=f and deleted_at is null);end if;
 if k='moment' then return exists(select 1 from public.mv_moments where id=t and family_id=f);end if;
 if k='session' then return exists(select 1 from public.mv_sessions where id=t and family_id=f);end if;
 return false;
end $$;
create function mv_private.media_visible(m public.mv_media) returns boolean language sql stable security definer set search_path='' as $$
 select mv_private.member(m.family_id) and (m.author_id=auth.uid() or (m.ready and (m.kind='avatar' or mv_private.target_visible(m.kind,m.target_id,m.family_id))))
$$;
create function mv_private.quiet(p public.mv_profiles,at_time timestamptz) returns boolean language sql stable set search_path='' as $$
 select case when p.quiet_start=p.quiet_end then false when p.quiet_start<p.quiet_end then (at_time at time zone p.timezone)::time>=p.quiet_start and (at_time at time zone p.timezone)::time<p.quiet_end else (at_time at time zone p.timezone)::time>=p.quiet_start or (at_time at time zone p.timezone)::time<p.quiet_end end
$$;
create function mv_private.notify(f uuid,recipient uuid,k text,t text,r text,d text) returns void language plpgsql security definer set search_path='' as $$
declare n uuid;
begin
 if not exists(select 1 from public.mv_members where family_id=f and user_id=recipient) then return;end if;
 insert into public.mv_notifications(family_id,recipient_id,type,title,route,dedupe_key) values(f,recipient,k,t,r,d) on conflict(dedupe_key) do nothing returning id into n;
 if n is not null then
 insert into mv_private.push_jobs(notification_id,device_id) select n,id from public.mv_devices where user_id=recipient and enabled on conflict do nothing;
 end if;
end $$;
create function mv_private.notify_partner(f uuid,k text,t text,r text,d text) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin select user_id into recipient from public.mv_members where family_id=f and user_id<>auth.uid();if recipient is not null then perform mv_private.notify(f,recipient,k,t,r,d);end if;end $$;

alter table public.mv_letters enable row level security;
alter table public.mv_sessions enable row level security;
alter table public.mv_events enable row level security;
alter table public.mv_moments enable row level security;
alter table public.mv_messages enable row level security;
alter table public.mv_reactions enable row level security;
alter table public.mv_letter_favorites enable row level security;
alter table public.mv_media enable row level security;
alter table public.mv_devices enable row level security;
alter table public.mv_notifications enable row level security;
create policy letters_read on public.mv_letters for select to authenticated using(mv_private.letter_visible(mv_letters));
create policy sessions_read on public.mv_sessions for select to authenticated using(mv_private.member(family_id));
create policy events_read on public.mv_events for select to authenticated using(mv_private.member(family_id));
create policy moments_read on public.mv_moments for select to authenticated using(mv_private.member(family_id));
create policy messages_read on public.mv_messages for select to authenticated using(mv_private.member(family_id));
create policy reactions_read on public.mv_reactions for select to authenticated using(mv_private.target_visible(kind,target_id,family_id));
create policy letter_favorites_read on public.mv_letter_favorites for select to authenticated using(user_id=auth.uid());
create policy media_read on public.mv_media for select to authenticated using(mv_private.media_visible(mv_media));
create policy devices_read on public.mv_devices for select to authenticated using(user_id=auth.uid());
create policy notifications_read on public.mv_notifications for select to authenticated using(recipient_id=auth.uid());
grant select on public.mv_letters,public.mv_sessions,public.mv_events,public.mv_moments,public.mv_messages,public.mv_reactions,public.mv_letter_favorites,public.mv_media,public.mv_devices,public.mv_notifications to authenticated;
revoke execute on function mv_private.letter_visible(public.mv_letters),mv_private.target_visible(text,uuid,uuid),mv_private.media_visible(public.mv_media),mv_private.quiet(public.mv_profiles,timestamptz),mv_private.notify(uuid,uuid,text,text,text,text),mv_private.notify_partner(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function mv_private.letter_visible(public.mv_letters),mv_private.target_visible(text,uuid,uuid),mv_private.media_visible(public.mv_media) to authenticated;
create index mv_messages_scope on public.mv_messages(family_id,scope,target,created_at);
create index mv_letters_due on public.mv_letters(scheduled_at) where status='scheduled';
create index mv_events_due on public.mv_events(starts_at) where status<>'cancelled';
create index mv_jobs_due on mv_private.push_jobs(available_at) where status in('queued','sending');
