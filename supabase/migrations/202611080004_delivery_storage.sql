create function public.mv_prepare_media(p_id uuid,p_kind text,p_target uuid,p_type text,p_size int) returns text language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();u uuid:=auth.uid();path text;
begin
 if f is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_kind='letter' then
  if not exists(select 1 from public.mv_letters where id=p_target and family_id=f and author_id=u and status in('draft','scheduled')) then raise exception 'LETTER_NOT_EDITABLE';end if;
 elsif p_kind='moment' then
  if not exists(select 1 from public.mv_moments where id=p_target and family_id=f and author_id=u) then raise exception 'FORBIDDEN';end if;
 elsif p_kind='session' then
  if not mv_private.target_visible('session',p_target,f) then raise exception 'FORBIDDEN';end if;
 elsif p_kind<>'avatar' then raise exception 'INVALID_MEDIA_KIND';end if;
 path:=f::text||'/'||u::text||'/'||p_id::text||case p_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.invalid' end;
 insert into public.mv_media(id,family_id,author_id,kind,target_id,object_path,content_type,byte_size) values(p_id,f,u,p_kind,p_target,path,p_type,p_size);
 return path;
end $$;
create function public.mv_register_device(p_id uuid,p_name text,p_subscription jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();u uuid:=auth.uid();url text:=p_subscription->>'endpoint';
begin
 if f is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 -- Never let a subscription turn the privileged dispatcher into an SSRF client.
 if url !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|web\.push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com)(:443)?/' or length(url)>2000 then raise exception 'INVALID_PUSH_ENDPOINT';end if;
 if coalesce(length(p_subscription->'keys'->>'p256dh'),0) not between 80 and 120 or coalesce(length(p_subscription->'keys'->>'auth'),0) not between 16 and 40 then raise exception 'INVALID_PUSH_KEYS';end if;
 if exists(select 1 from public.mv_devices where id=p_id and user_id<>u) then raise exception 'FORBIDDEN';end if;
 if (select count(*) from public.mv_devices where user_id=u and enabled)>9 then raise exception 'DEVICE_LIMIT';end if;
 insert into public.mv_devices(id,user_id,family_id,name,subscription) values(p_id,u,f,p_name,p_subscription)
 on conflict(id) do update set name=excluded.name,subscription=excluded.subscription,enabled=true,updated_at=now();
end $$;
create function public.mv_disable_device(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin update public.mv_devices set enabled=false where id=p_id and user_id=auth.uid();end $$;
create function public.mv_test_push() returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid:=gen_random_uuid();f uuid:=mv_private.family();
begin
 if f is null then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.mv_notifications where recipient_id=auth.uid() and type='test' and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMITED';end if;
 perform mv_private.notify(f,auth.uid(),'test','Проверка уведомлений «Наш Marvel»','/settings',id::text);return id;
end $$;

-- Only service_role can call dispatcher functions. A cron tick creates events;
-- the Edge Function claims device jobs under leases and acknowledges individually.
create function public.mv_tick() returns void language plpgsql security definer set search_path='' as $$
declare l public.mv_letters;e public.mv_events;p public.mv_profiles;m public.mv_members;h int;week_key text;freq int;
begin
 for l in select * from public.mv_letters where status='scheduled' and scheduled_at<=now() for update skip locked loop
  update public.mv_letters set status='delivered',delivered_at=now(),updated_at=now(),version=version+1 where id=l.id;
  perform mv_private.notify(l.family_id,l.recipient_id,'letter','Тебе пришло письмо от любимого человека ❤️','/letters/'||l.id,'letter:'||l.id);
 end loop;
 for e in select * from public.mv_events where status not in('cancelled','proposed') and starts_at>now() and starts_at<now()+interval '7 days' loop
  for p in select pr.* from public.mv_profiles pr join public.mv_members me on me.user_id=pr.id where me.family_id=e.family_id loop
   foreach h in array p.reminder_hours loop
    if e.starts_at-make_interval(hours=>h)<=now() then
     perform mv_private.notify(e.family_id,p.id,'reminder','Скоро наш киновечер ❤️','/events/'||e.id,'reminder:'||e.id||':'||e.version||':'||p.id||':'||h);
    end if;
   end loop;
  end loop;
 end loop;
 for p in select * from public.mv_profiles where nudge_frequency>0 or letter_nudges loop
  select * into m from public.mv_members where user_id=p.id;
  if m.user_id is null or mv_private.quiet(p,now()) then continue;end if;
  -- The family must have been inactive and have no upcoming evening.
  if exists(select 1 from public.mv_entries where family_id=m.family_id and updated_at>now()-interval '7 days') or exists(select 1 from public.mv_sessions where family_id=m.family_id and created_at>now()-interval '7 days') or exists(select 1 from public.mv_events where family_id=m.family_id and status<>'cancelled' and starts_at>now()) then continue;end if;
  freq:=case when p.nudge_frequency=2 then 4 else 7 end;
  if p.nudge_frequency>0 and not exists(select 1 from public.mv_notifications where recipient_id=p.id and type='nudge' and created_at>now()-make_interval(days=>freq)) then
   week_key:=to_char(now() at time zone p.timezone,'YYYY-MM-DD');
   perform mv_private.notify(m.family_id,p.id,'nudge','Давно не смотрели Marvel вместе. Может, устроим киновечер? ❤️','/events','nudge:'||p.id||':'||week_key);
  end if;
  if p.letter_nudges and not exists(select 1 from public.mv_notifications where recipient_id=p.id and type='letter_nudge' and created_at>now()-interval '30 days') then perform mv_private.notify(m.family_id,p.id,'letter_nudge','Можно написать друг другу что-то тёплое ❤️','/letters','letter-nudge:'||p.id||':'||to_char(now(),'YYYY-MM'));end if;
 end loop;
end $$;
create function public.mv_claim_push(p_limit int default 30) returns table(job_id uuid,device_id uuid,subscription jsonb,notification_id uuid,title text,route text,attempt int) language plpgsql security definer set search_path='' as $$
begin
 return query
 with due as (
 select j.id from mv_private.push_jobs j join public.mv_devices d on d.id=j.device_id join public.mv_notifications n on n.id=j.notification_id join public.mv_profiles p on p.id=n.recipient_id
 where (j.status='queued' or (j.status='sending' and j.leased_until<now())) and j.available_at<=now() and j.attempts<8 and d.enabled
 and (p.notification_types->>'enabled')::boolean=true and coalesce((p.notification_types->>n.type)::boolean,true)
 and not mv_private.quiet(p,now())
 -- Do not deliver stale reminders after event cancellation/time change.
 and (n.type<>'reminder' or exists(select 1 from public.mv_events e where n.route='/events/'||e.id and e.status<>'cancelled' and e.starts_at>now() and n.dedupe_key like 'reminder:'||e.id||':'||e.version||':%'))
 order by j.available_at for update of j skip locked limit least(greatest(p_limit,1),50)
 ), claimed as (
 update mv_private.push_jobs j set status='sending',leased_until=now()+interval '2 minutes',attempts=j.attempts+1 where j.id in(select id from due) returning j.*
 )
 select c.id,d.id,d.subscription,n.id,n.title,n.route,c.attempts from claimed c join public.mv_devices d on d.id=c.device_id join public.mv_notifications n on n.id=c.notification_id;
end $$;
create function public.mv_ack_push(p_job uuid,p_attempt int,p_ok boolean,p_gone boolean default false,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update mv_private.push_jobs set status=case when p_ok then 'sent' when p_gone or attempts>=8 then 'failed' else 'queued' end,sent_at=case when p_ok then now() else null end,available_at=now()+make_interval(secs=>least(3600,power(2,p_attempt)::int*30)),leased_until=null,last_error=left(p_error,200)
 where id=p_job and status='sending' and attempts=p_attempt;
 if found and p_gone then update public.mv_devices set enabled=false where id=(select device_id from mv_private.push_jobs where id=p_job);end if;
end $$;
create function public.mv_push_status(p_notification uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('queued',count(*) filter(where j.status in('queued','sending')),'accepted_by_push_service',count(*) filter(where j.status='sent'),'failed',count(*) filter(where j.status='failed')) from mv_private.push_jobs j join public.mv_notifications n on n.id=j.notification_id where n.id=p_notification and n.recipient_id=auth.uid()
$$;
-- Accepting by Apple's push service is not proof that an iPhone displayed it.
revoke execute on function public.mv_prepare_media(uuid,text,uuid,text,int),public.mv_register_device(uuid,text,jsonb),public.mv_disable_device(uuid),public.mv_test_push(),public.mv_push_status(uuid),public.mv_tick(),public.mv_claim_push(int),public.mv_ack_push(uuid,int,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.mv_prepare_media(uuid,text,uuid,text,int),public.mv_register_device(uuid,text,jsonb),public.mv_disable_device(uuid),public.mv_test_push(),public.mv_push_status(uuid) to authenticated;
grant execute on function public.mv_tick(),public.mv_claim_push(int),public.mv_ack_push(uuid,int,boolean,boolean,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('marvel-private','marvel-private',false,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=excluded.allowed_mime_types;
create policy mv_storage_read on storage.objects for select to authenticated using(bucket_id='marvel-private' and exists(select 1 from public.mv_media m where m.object_path=name and mv_private.media_visible(m)));
-- No authenticated INSERT/UPDATE/DELETE policy: only the validating media Edge
-- Function writes using its server credential. Guessing an object path is useless.

-- Revoke only our objects, not functions or tables belonging to other projects.
do $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'mv\_%' escape '\' loop
 execute format('revoke all on public.%I from anon,authenticated',t.tablename);
 execute format('grant select on public.%I to authenticated',t.tablename);
 execute format('grant all on public.%I to service_role',t.tablename);
 end loop;
 for t in select tablename from pg_tables where schemaname='mv_private' loop execute format('alter table mv_private.%I enable row level security',t.tablename);end loop;
end $$;
grant select on public.mv_projects to anon;
-- Supabase Realtime must apply the SELECT RLS policies; keep DEFAULT replica
-- identity, especially for letters, so DELETE events never expose private bodies.
do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['mv_members','mv_entries','mv_episodes','mv_ratings','mv_letters','mv_messages','mv_reactions','mv_sessions','mv_moments','mv_events','mv_notifications','mv_media'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;end if;
end $$;
