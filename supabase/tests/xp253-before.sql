-- This database is a pre-2.5.3 disposable clone. All 82 awards are synthetic.
create function public.xp_test(ok boolean,label text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'FAILED XP253: %',label;end if;raise notice 'PASS: XP253 %',label;end$$;
create function public.xp_denied(statement text,label text) returns void language plpgsql as $$begin begin execute statement;exception when others then raise notice 'PASS: XP253 denied %',label;return;end;raise exception 'FAILED allowed: %',label;end$$;
insert into auth.users values('11111111-1111-4111-8111-111111111111','old-a@example.test',now()),('22222222-2222-4222-8222-222222222222','old-t@example.test',now());
insert into public.mv_profiles(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222') on conflict do nothing;
insert into public.mv_families(id) values('aaaaaaaa-1111-4111-8111-111111111111');
insert into public.mv_members(family_id,user_id,role) values('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','anton'),('aaaaaaaa-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','tanya');
insert into public.mv_achievements(family_id,achievement_id,owner,xp,unlocked_at,historical)
select 'aaaaaaaa-1111-4111-8111-111111111111',id,definition->>'owner',case definition->>'rarity' when 'common' then 10 when 'rare' then 25 when 'epic' then 50 else 100 end,'2026-01-01'::timestamptz+row_number() over(order by id)*interval '1 second',(row_number() over(order by id))%2=0 from mv_private.legend_catalog;
insert into public.mv_legend_seen(user_id,seen_ids) values('11111111-1111-4111-8111-111111111111','{__baseline__,films-1,phase-1-v1}'),('22222222-2222-4222-8222-222222222222','{__baseline__,hero-thor}');
insert into public.mv_devices(id,user_id,family_id,name,subscription) values('dddddddd-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','test','{"endpoint":"https://web.push.apple.com/xp-test","keys":{"p256dh":"test","auth":"test"}}');
insert into public.mv_notifications(id,family_id,recipient_id,type,title,route,dedupe_key,read_at) values
('eeeeeeee-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','achievement','Антон и Таня · БРОНЗА — «Первый шаг Старка» · +25 XP','/legend/films-1','xp-test-pending',null),
('eeeeeeee-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','achievement','Антон и Таня · БРОНЗА — «Первый шаг Старка» · +25 XP','/legend/films-1','xp-test-sent','2026-02-01');
insert into mv_private.push_jobs(notification_id,device_id,status) values('eeeeeeee-1111-4111-8111-111111111111','dddddddd-0000-4000-8000-000000000001','queued'),('eeeeeeee-2222-4222-8222-222222222222','dddddddd-0000-4000-8000-000000000001','sent');
create table mv_private.xp_test_snapshot as select
(select jsonb_agg(to_jsonb(a) order by family_id,achievement_id) from public.mv_achievements a) awards,
(select jsonb_agg(to_jsonb(n) order by id) from public.mv_notifications n) notifications,
(select jsonb_agg(to_jsonb(s) order by user_id) from public.mv_legend_seen s) seen,
(select jsonb_agg(to_jsonb(j) order by id) from mv_private.push_jobs j) jobs;
select public.xp_test((select count(*)=82 from public.mv_achievements),'legacy fixture has all 82 awards');
select public.xp_test((select sum(xp)=2945 from public.mv_achievements),'legacy fixture preserves old rarity XP');
