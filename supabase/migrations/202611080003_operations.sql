create function mv_private.check_version(actual bigint,expected bigint) returns void language plpgsql set search_path='' as $$begin if coalesce(actual,0)<>coalesce(expected,-1) then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;end$$;
create function mv_private.valid_episode(project text,s int,e int) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.mv_projects p,jsonb_array_elements(p.seasons) j where p.id=project and p.section<>'future' and p.release_date<=current_date and (j->>'number')::int=s and e between 1 and (j->>'episodes')::int and coalesce((j->'episodeDates'->>(e-1))::date,(j->>'date')::date)<=current_date)
$$;
create function public.mv_apply(p_id uuid,p_kind text,p_target text,p_payload jsonb,p_expected bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f uuid:=mv_private.family();result jsonb;v bigint;rid uuid;pr public.mv_projects;en public.mv_entries;ep public.mv_episodes;rt public.mv_ratings;lt public.mv_letters;msg public.mv_messages;ev public.mv_events;ss public.mv_sessions;mo public.mv_moments;rec uuid;k text;s int;e int;sc int;st text;dt timestamptz;
begin
 if f is null or u is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if octet_length(p_payload::text)>100000 then raise exception 'PAYLOAD_TOO_LARGE';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_id::text,0));
 select o.result into result from public.mv_operations o where o.user_id=u and o.id=p_id;
 if found then return result;end if;
 result:=jsonb_build_object('id',p_target,'ok',true);
 if p_kind in('entry','episode','rating') then
 select * into pr from public.mv_projects where id=p_target;
 if not found or pr.section='future' or pr.release_date>current_date then raise exception 'PROJECT_NOT_RELEASED';end if;
 end if;
 if p_payload ? 'user_id' or p_payload ? 'family_id' or p_payload ? 'author_id' or p_payload ? 'role' then raise exception 'IDENTITY_IS_SERVER_ASSIGNED' using errcode='42501';end if;
 case p_kind
 when 'entry' then
  select * into en from public.mv_entries where family_id=f and project_id=p_target for update;
  perform mv_private.check_version(en.version,p_expected);
  insert into public.mv_entries(family_id,project_id,watched,watched_date,note,updated_by)
  values(f,p_target,coalesce((p_payload->>'watched')::boolean,false),(p_payload->>'watched_date')::date,coalesce(p_payload->>'note',''),u)
  on conflict(family_id,project_id) do update set watched=case when p_payload ? 'watched' then excluded.watched else mv_entries.watched end,
  watched_date=case when p_payload ? 'watched_date' then excluded.watched_date else mv_entries.watched_date end,
  note=case when p_payload ? 'note' then excluded.note else mv_entries.note end,version=mv_entries.version+1,updated_by=u,updated_at=now() returning version into v;
 when 'episode' then
  s:=(p_payload->>'season')::int;e:=(p_payload->>'episode')::int;
  if not mv_private.valid_episode(p_target,s,e) then raise exception 'EPISODE_NOT_RELEASED';end if;
  select * into ep from public.mv_episodes where family_id=f and project_id=p_target and season=s and episode=e for update;
  perform mv_private.check_version(ep.version,p_expected);
  insert into public.mv_episodes(family_id,project_id,season,episode,watched,updated_by) values(f,p_target,s,e,(p_payload->>'watched')::boolean,u)
  on conflict(family_id,project_id,season,episode) do update set watched=excluded.watched,version=mv_episodes.version+1,updated_by=u,updated_at=now() returning version into v;
 when 'rating' then
  s:=coalesce((p_payload->>'season')::int,0);
  if s>0 and not exists(select 1 from jsonb_array_elements(pr.seasons) j where (j->>'number')::int=s) then raise exception 'INVALID_SEASON';end if;
  if p_payload->>'score' is not null and not (exists(select 1 from public.mv_entries where family_id=f and project_id=p_target and watched and pr.kind<>'series') or exists(select 1 from public.mv_episodes where family_id=f and project_id=p_target and watched and (s=0 or season=s))) then raise exception 'WATCH_FIRST';end if;
  select * into rt from public.mv_ratings where user_id=u and project_id=p_target and season=s for update;
  perform mv_private.check_version(rt.version,p_expected);
  insert into public.mv_ratings(family_id,user_id,project_id,season,score,favorite) values(f,u,p_target,s,(p_payload->>'score')::int,coalesce((p_payload->>'favorite')::boolean,false))
  on conflict(user_id,project_id,season) do update set score=case when p_payload ? 'score' then excluded.score else mv_ratings.score end,favorite=case when p_payload ? 'favorite' then excluded.favorite else mv_ratings.favorite end,version=mv_ratings.version+1,updated_at=now() returning version,score into v,sc;
  if rt.score is distinct from sc then
   insert into public.mv_rating_history(family_id,user_id,project_id,season,old_score,new_score) values(f,u,p_target,s,rt.score,sc);
   perform mv_private.notify_partner(f,'rating','У нас новая оценка','/project/'||p_target,'rating:'||p_id);
  end if;
 when 'letter' then
  rid:=p_target::uuid;select * into lt from public.mv_letters where id=rid for update;
  if found and lt.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if found and (lt.author_id<>u or lt.status not in('draft','scheduled','cancelled')) then raise exception 'LETTER_NOT_EDITABLE' using errcode='42501';end if;
  perform mv_private.check_version(lt.version,p_expected);
  select user_id into rec from public.mv_members where family_id=f and user_id<>u;
  if rec is null then raise exception 'PARTNER_NOT_JOINED';end if;
  st:=coalesce(p_payload->>'status','draft');if st not in('draft','scheduled','delivered','cancelled') then raise exception 'INVALID_STATUS';end if;
  dt:=(p_payload->>'scheduled_at')::timestamptz;
  if st='scheduled' and (dt is null or dt<=now()) then raise exception 'SCHEDULE_IN_FUTURE';end if;
  if p_payload->>'reply_to' is not null and not mv_private.target_visible('letter',(p_payload->>'reply_to')::uuid,f) then raise exception 'INVALID_REPLY';end if;
  insert into public.mv_letters(id,family_id,author_id,recipient_id,title,body,style,status,scheduled_at,delivered_at,reply_to)
  values(rid,f,u,rec,p_payload->>'title',p_payload->>'body',coalesce(p_payload->>'style','romantic'),st,dt,case when st='delivered' then now() end,(p_payload->>'reply_to')::uuid)
  on conflict(id) do update set title=excluded.title,body=excluded.body,style=excluded.style,status=excluded.status,scheduled_at=excluded.scheduled_at,delivered_at=excluded.delivered_at,version=mv_letters.version+1,updated_at=now() returning version into v;
  if st='delivered' then perform mv_private.notify(f,rec,'letter','Тебе пришло письмо от любимого человека ❤️','/letters/'||rid,'letter:'||rid);end if;
 when 'letter_delete' then
  rid:=p_target::uuid;select * into lt from public.mv_letters where id=rid for update;
  if found and lt.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if lt.author_id is distinct from u or lt.status not in('draft','cancelled') then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(lt.version,p_expected);
  if exists(select 1 from public.mv_media where kind='letter' and target_id=rid) then raise exception 'REMOVE_ATTACHMENTS_FIRST';end if;
  delete from public.mv_letters where id=rid;
 when 'letter_read' then
  rid:=p_target::uuid;select * into lt from public.mv_letters where id=rid and family_id=f;
  if lt.recipient_id is distinct from u or not mv_private.letter_visible(lt) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if (select read_receipts from public.mv_profiles where id=u) then update public.mv_letters set read_at=coalesce(read_at,now()) where id=rid;end if;
 when 'letter_favorite' then
  rid:=p_target::uuid;if not mv_private.target_visible('letter',rid,f) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if (p_payload->>'value')::boolean then insert into public.mv_letter_favorites values(u,rid) on conflict do nothing;else delete from public.mv_letter_favorites where user_id=u and letter_id=rid;end if;
 when 'message' then
  rid:=p_target::uuid;select * into msg from public.mv_messages where id=rid for update;
  if found and msg.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if found and msg.author_id<>u then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(msg.version,p_expected);
  k:=coalesce(msg.scope,p_payload->>'scope');st:=coalesce(msg.target,p_payload->>'target','');
  if k='project' and not exists(select 1 from public.mv_projects where id=st) then raise exception 'INVALID_TARGET';end if;
  if k in('session','moment') and not mv_private.target_visible(k,st::uuid,f) then raise exception 'INVALID_TARGET';end if;
  if k='chat' then st:='';end if;
  if p_payload->>'reply_to' is not null and not exists(select 1 from public.mv_messages where id=(p_payload->>'reply_to')::uuid and family_id=f and scope=k and target=st) then raise exception 'INVALID_REPLY';end if;
  insert into public.mv_messages(id,family_id,author_id,scope,target,body,spoiler,reply_to) values(rid,f,u,k,st,p_payload->>'body',coalesce((p_payload->>'spoiler')::boolean,false),(p_payload->>'reply_to')::uuid)
  on conflict(id) do update set body=excluded.body,spoiler=excluded.spoiler,version=mv_messages.version+1,edited_at=now() returning version into v;
  if msg.id is null then perform mv_private.notify_partner(f,case when k='chat' then 'message' else 'comment' end,'Новое сообщение в нашей вселенной',case when k='project' then '/project/'||st when k='session' then '/sessions/'||st when k='moment' then '/moments/'||st else '/chat' end,'message:'||rid);end if;
 when 'message_delete' then
  rid:=p_target::uuid;select * into msg from public.mv_messages where id=rid for update;
  if found and msg.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if msg.author_id is distinct from u then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(msg.version,p_expected);
  update public.mv_messages set body='Сообщение удалено',deleted_at=now(),version=version+1 where id=rid returning version into v;
 when 'reaction' then
  rid:=p_target::uuid;k:=p_payload->>'kind';
  if not mv_private.target_visible(k,rid,f) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if (p_payload->>'value')::boolean then insert into public.mv_reactions(family_id,user_id,kind,target_id,emoji) values(f,u,k,rid,p_payload->>'emoji') on conflict do nothing;
  else delete from public.mv_reactions where user_id=u and kind=k and target_id=rid and emoji=p_payload->>'emoji';end if;
 when 'session' then
  rid:=p_target::uuid;select * into ss from public.mv_sessions where id=rid for update;
  if found and ss.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(ss.version,p_expected);
  if ss.id is null then
   if not exists(select 1 from public.mv_projects where id=p_payload->>'project_id' and section<>'future' and release_date<=current_date) then raise exception 'PROJECT_NOT_RELEASED';end if;
   insert into public.mv_sessions(id,family_id,project_id,author_id,participants) values(rid,f,p_payload->>'project_id',u,array[u]) returning version into v;
   perform mv_private.notify_partner(f,'session','Начинаем совместный просмотр ❤️','/sessions/'||rid,'session:'||rid);
  else
   if ss.status='finished' then raise exception 'SESSION_FINISHED';end if;
   update public.mv_sessions set status=coalesce(p_payload->>'status',status),film_minute=coalesce((p_payload->>'film_minute')::int,film_minute),participants=case when not(u=any(participants)) then array_append(participants,u) else participants end,finished_at=case when p_payload->>'status'='finished' then now() else finished_at end,version=version+1 where id=rid returning version into v;
  end if;
 when 'moment' then
  rid:=p_target::uuid;select * into mo from public.mv_moments where id=rid for update;
  if found and mo.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if found and mo.author_id<>u then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(mo.version,p_expected);
  if p_payload->>'session_id' is not null and not mv_private.target_visible('session',(p_payload->>'session_id')::uuid,f) then raise exception 'INVALID_SESSION';end if;
  insert into public.mv_moments(id,family_id,author_id,project_id,session_id,caption,moment_date) values(rid,f,u,nullif(p_payload->>'project_id',''),(p_payload->>'session_id')::uuid,coalesce(p_payload->>'caption',''),coalesce((p_payload->>'moment_date')::date,current_date))
  on conflict(id) do update set caption=excluded.caption,moment_date=excluded.moment_date,version=mv_moments.version+1 returning version into v;
 when 'moment_delete' then
  rid:=p_target::uuid;select * into mo from public.mv_moments where id=rid for update;
  if found and mo.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if mo.author_id is distinct from u then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(mo.version,p_expected);
  if exists(select 1 from public.mv_media where kind='moment' and target_id=rid) then raise exception 'REMOVE_ATTACHMENTS_FIRST';end if;
  delete from public.mv_moments where id=rid;
 when 'event' then
  rid:=p_target::uuid;select * into ev from public.mv_events where id=rid for update;
  if found and ev.family_id<>f then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform mv_private.check_version(ev.version,p_expected);
  if p_payload ? 'timezone' and not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then raise exception 'INVALID_TIMEZONE';end if;
  if ev.id is null then
   if (p_payload->>'starts_at')::timestamptz<=now() then raise exception 'EVENT_IN_FUTURE';end if;
   insert into public.mv_events(id,family_id,project_id,author_id,starts_at,timezone,season,episode,location,note) values(rid,f,p_payload->>'project_id',u,(p_payload->>'starts_at')::timestamptz,p_payload->>'timezone',(p_payload->>'season')::int,(p_payload->>'episode')::int,coalesce(p_payload->>'location',''),coalesce(p_payload->>'note','')) returning version into v;
   st:='event_invite';
  else
   st:=p_payload->>'status';
   if st='confirmed' and ev.author_id=u and ev.status<>'proposed' then raise exception 'PARTNER_CONFIRMS';end if;
   if ev.status='cancelled' then raise exception 'EVENT_CANCELLED';end if;
   if st='proposed' and ((p_payload->>'proposed_at')::timestamptz<=now() or p_payload->>'proposed_at' is null) then raise exception 'EVENT_IN_FUTURE';end if;
   update public.mv_events set status=st,proposed_at=case when st='proposed' then (p_payload->>'proposed_at')::timestamptz else proposed_at end,starts_at=case when st='confirmed' and ev.status='proposed' then ev.proposed_at else starts_at end,confirmed_by=case when st='confirmed' then u else null end,version=version+1,updated_at=now() where id=rid returning version into v;
   st:=case st when 'confirmed' then 'event_confirm' when 'proposed' then 'event_move' else 'event_cancel' end;
  end if;
  perform mv_private.notify_partner(f,st,'Обновление нашего киновечера','/events/'||rid,'event:'||p_id);
 when 'notification_read' then update public.mv_notifications set read_at=now() where id=p_target::uuid and recipient_id=u;
 else raise exception 'UNKNOWN_OPERATION';
 end case;
 result:=result||jsonb_build_object('version',coalesce(v,0));
 insert into public.mv_operations(id,user_id,family_id,result) values(p_id,u,f,result);
 return result;
end $$;

create function public.mv_import_legacy(p_id uuid,p_records jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();u uuid:=auth.uid();result jsonb;item record;r jsonb;k text;parts text[];s int;e int;rl text;count_entries int:=0;count_ratings int:=0;
begin
 if f is null or mv_private.role()<>'anton' then raise exception 'OWNER_ONLY' using errcode='42501';end if;
 if jsonb_typeof(p_records)<>'object' or octet_length(p_records::text)>5000000 then raise exception 'INVALID_BACKUP';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_id::text,0));
 select o.result into result from public.mv_operations o where o.user_id=u and o.id=p_id;if found then return result;end if;
 for item in select * from jsonb_each(p_records) loop
 r:=item.value;
 if not exists(select 1 from public.mv_projects where id=item.key and section<>'future' and release_date<=current_date) then continue;end if;
 insert into public.mv_entries(family_id,project_id,watched,watched_date,note,updated_by) values(f,item.key,coalesce((r->>'watched')::boolean,false),nullif(r->>'date','')::date,coalesce(r->>'note',''),u) on conflict do nothing;
 count_entries:=count_entries+1;
 for k in select jsonb_array_elements_text(coalesce(r->'episodes','[]')) loop
  if k !~ '^[0-9]+:[0-9]+$' then raise exception 'INVALID_EPISODE';end if;
  parts:=string_to_array(k,':');s:=parts[1]::int;e:=parts[2]::int;
  if mv_private.valid_episode(item.key,s,e) then insert into public.mv_episodes(family_id,project_id,season,episode,watched,updated_by) values(f,item.key,s,e,true,u) on conflict do nothing;end if;
 end loop;
 foreach rl in array array['anton','tanya'] loop
  if r->>rl is not null then
   insert into public.mv_legacy_ratings(family_id,role,project_id,score,imported_by) values(f,rl,item.key,(r->>rl)::int,u) on conflict do nothing;count_ratings:=count_ratings+1;
  end if;
 end loop;
 -- v1 favorite was shared; preserve it in the importing owner's preference.
 if (r->>'favorite')::boolean then insert into public.mv_ratings(family_id,user_id,project_id,season,favorite) values(f,u,item.key,0,true) on conflict do nothing;end if;
 end loop;
 result:=jsonb_build_object('ok',true,'entries',count_entries,'staged_ratings',count_ratings,'id',p_id);
 insert into public.mv_operations(id,user_id,family_id,result) values(p_id,u,f,result);
 return result;
end $$;
create function public.mv_claim_legacy() returns integer language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();u uuid:=auth.uid();rl text:=mv_private.role();r record;n int:=0;
begin
 if f is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 for r in select * from public.mv_legacy_ratings where family_id=f and role=rl and claimed_by is null for update loop
 insert into public.mv_ratings(family_id,user_id,project_id,season,score) values(f,u,r.project_id,0,r.score) on conflict(user_id,project_id,season) do update set score=coalesce(mv_ratings.score,excluded.score),version=mv_ratings.version+1;
 update public.mv_legacy_ratings set claimed_by=u where family_id=f and role=rl and project_id=r.project_id;n:=n+1;
 end loop;return n;
end $$;
revoke execute on function mv_private.check_version(bigint,bigint),mv_private.valid_episode(text,int,int) from public,anon,authenticated;
revoke execute on function public.mv_apply(uuid,text,text,jsonb,bigint),public.mv_import_legacy(uuid,jsonb),public.mv_claim_legacy() from public,anon;
grant execute on function public.mv_apply(uuid,text,text,jsonb,bigint),public.mv_import_legacy(uuid,jsonb),public.mv_claim_legacy() to authenticated;
