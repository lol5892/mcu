create table public.mv_impressions(
 id uuid not null default gen_random_uuid(),family_id uuid not null references public.mv_families(id),
 user_id uuid not null references public.mv_profiles(id),project_id text not null references public.mv_projects(id),
 body text,version bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(family_id,user_id,project_id),unique(id),
 check(body is null or (char_length(body) between 1 and 200 and translate(body,' '||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279),'')<>''))
);
alter table public.mv_impressions enable row level security;
create policy family_read on public.mv_impressions for select to authenticated using(family_id=mv_private.family());
grant select on public.mv_impressions to authenticated;
revoke insert,update,delete on public.mv_impressions from anon,authenticated;
create function public.mv_impression(p_project text,p_body text,p_expected bigint default 0) returns public.mv_impressions language plpgsql security definer set search_path='' as $$
declare f uuid:=mv_private.family();u uuid:=auth.uid();r public.mv_impressions;
begin
 if f is null or u is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('impression:'||u||':'||p_project,0));
 select * into r from public.mv_impressions where family_id=f and user_id=u and project_id=p_project;
 perform mv_private.check_version(r.version,p_expected);
 insert into public.mv_impressions(family_id,user_id,project_id,body) values(f,u,p_project,p_body)
 on conflict(family_id,user_id,project_id) do update set body=excluded.body,version=mv_impressions.version+1,updated_at=now() returning * into r;
 return r;
end$$;
revoke all on function public.mv_impression(text,text,bigint) from public,anon;
grant execute on function public.mv_impression(text,text,bigint) to authenticated;
do $$declare d text;begin
 select pg_get_functiondef('mv_private.notify(uuid,uuid,text,text,text,text)'::regprocedure) into d;
 d:=replace(d,E'begin\n',E'begin\n if k in (''message'',''comment'',''letter'',''letter_nudge'') then return;end if;\n');execute d;
 select pg_get_functiondef('public.mv_tick()'::regprocedure) into d;
 d:=replace(d, 'where status=''scheduled'' and scheduled_at<=now()', 'where false and status=''scheduled'' and scheduled_at<=now()');execute d;
 select pg_get_functiondef('public.mv_claim_push(integer)'::regprocedure) into d;
 d:=replace(d, 'where (j.status=', 'where n.type not in (''message'',''comment'',''letter'',''letter_nudge'') and (j.status=');execute d;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.mv_impressions;end if;
end$$;
create or replace function public.mv_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.mv_export_v20()||jsonb_build_object('mediaLinks',coalesce((select jsonb_agg(l) from public.mv_media_links l),'[]'),'impressions',coalesce((select jsonb_agg(i) from public.mv_impressions i),'[]'),'achievements',coalesce((select jsonb_agg(a) from public.mv_achievements a),'[]'))
$$;
revoke all on function public.mv_export() from public,anon;
grant execute on function public.mv_export() to authenticated;
