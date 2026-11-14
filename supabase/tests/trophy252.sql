select family_id as fixture_family from public.mv_members where user_id='11111111-1111-4111-8111-111111111111' \gset
-- Disposable SQL fixture only. Server facts must generate events without React.
select public.test_assert((select count(*)=82 from mv_private.trophy_presentation),'82 tier definitions are server-owned');
select public.test_assert((select count(*)=9 from mv_private.trophy_presentation where tier='platinum'),'only nine platinum trophies');
select public.test_assert((select count(*)=2 from public.mv_notifications where route='/legend/phase-1-v1'),'family award notifies both members exactly once');
select public.test_assert((select count(*)=1 from public.mv_notifications where route='/legend/anton-perfect1' and recipient_id='11111111-1111-4111-8111-111111111111'),'personal award notifies only its owner');
select public.test_assert((select count(*)=0 from public.mv_notifications where route='/legend/anton-perfect1' and recipient_id='22222222-2222-4222-8222-222222222222'),'partner receives no personal push event');
select count(*) as event_before from public.mv_notifications where type='achievement' \gset
select coalesce(sum(xp),0) as xp_before from public.mv_achievements \gset
select mv_private.legend_refresh((select family_id from public.mv_members where user_id='11111111-1111-4111-8111-111111111111'),false);
select public.test_assert((select count(*)=:event_before from public.mv_notifications where type='achievement'),'refresh cannot duplicate trophy events');
select public.test_assert((select sum(xp)=:xp_before from public.mv_achievements),'tier changes do not alter saved XP');
-- Use actual remaining state transitions for personal tier and push preferences.
update public.mv_profiles set notification_types='{"enabled":true,"achievement":true}',quiet_start='00:00',quiet_end='00:00';
insert into public.mv_devices(id,user_id,family_id,name,subscription) select ('dddddddd-0000-4000-8000-'||case role when 'anton' then '000000000001' else '000000000002' end)::uuid,user_id,family_id,role,jsonb_build_object('endpoint','https://web.push.apple.com/test-'||role,'keys',jsonb_build_object('p256dh',repeat('x',87),'auth',repeat('a',22))) from public.mv_members where user_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
select count(*) as tanya_before from public.mv_notifications where route='/legend/tanya-strict1' \gset
insert into public.mv_ratings(family_id,user_id,project_id,season,score) select family_id,user_id,'strange',0,2 from public.mv_members where user_id='22222222-2222-4222-8222-222222222222' on conflict(user_id,project_id,season) do update set score=2;
select public.test_assert((select count(*)=1 from public.mv_notifications where route='/legend/tanya-strict1'),'saved score creates a trophy without opening the page');
select public.test_assert((select count(*)=0 from public.mv_notifications where type='achievement' and title not like '%XP'),'event includes actual saved XP');
-- Access checks: metadata and eligibility snapshots are private.
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.test_assert((select count(*)=0 from public.mv_notifications where type='achievement' and family_id=:'fixture_family'),'outsider cannot read family trophy events');
select public.test_denied('select * from mv_private.trophy_baseline','baseline is not client-readable');
select public.test_denied('insert into mv_private.trophy_presentation values(''fake'',''fake'',''platinum'')','client cannot forge tier metadata');
select public.test_denied('select mv_private.trophy_unlocked()','client cannot invoke award delivery trigger');
reset role;
-- A dedicated old-state fixture verifies baseline capture without altering any awards.
insert into auth.users values('55555555-5555-4555-8555-555555555555','baseline@example.test',now());
insert into public.mv_profiles(id) values('55555555-5555-4555-8555-555555555555') on conflict do nothing;
insert into public.mv_families(id) values('aaaaaaaa-1111-4111-8111-111111111111');
insert into public.mv_members(family_id,user_id,role) values('aaaaaaaa-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','anton');
alter table public.mv_entries disable trigger legend_entry;
insert into public.mv_entries(family_id,project_id,watched,updated_by) values('aaaaaaaa-1111-4111-8111-111111111111','iron-man',true,'55555555-5555-4555-8555-555555555555');
alter table public.mv_entries enable trigger legend_entry;
select mv_private.trophy_capture_baseline('aaaaaaaa-1111-4111-8111-111111111111',true);
select public.test_assert((select count(*)=0 from public.mv_achievements where family_id='aaaaaaaa-1111-4111-8111-111111111111'),'baseline capture does not award or rewrite XP');
select mv_private.legend_refresh('aaaaaaaa-1111-4111-8111-111111111111',false);
select public.test_assert((select count(*)>0 from public.mv_achievements where family_id='aaaaaaaa-1111-4111-8111-111111111111'),'old progress remains eligible under original conditions');
select public.test_assert((select count(*)=0 from public.mv_notifications where family_id='aaaaaaaa-1111-4111-8111-111111111111' and type='achievement'),'old eligible state cannot produce mass notifications');

select public.test_assert((select count(*)=1 from mv_private.push_jobs j join public.mv_notifications n on n.id=j.notification_id where n.route='/legend/tanya-strict1'),'one device job for the personal owner');
update public.mv_profiles set notification_types='{"enabled":true,"achievement":false}' where id='11111111-1111-4111-8111-111111111111';
select mv_private.notify((select family_id from public.mv_members where user_id='11111111-1111-4111-8111-111111111111'),'11111111-1111-4111-8111-111111111111','achievement','test','/legend/films-3','test:trophy-category-off');
select public.test_assert((select count(*)=0 from mv_private.push_jobs j join public.mv_notifications n on n.id=j.notification_id where n.dedupe_key='test:trophy-category-off'),'category opt-out creates no deferred push backlog');
update public.mv_profiles set notification_types='{"enabled":false,"achievement":true}' where id='11111111-1111-4111-8111-111111111111';
select mv_private.notify((select family_id from public.mv_members where user_id='11111111-1111-4111-8111-111111111111'),'11111111-1111-4111-8111-111111111111','achievement','test','/legend/films-3','test:trophy-global-off');
select public.test_assert((select count(*)=0 from mv_private.push_jobs j join public.mv_notifications n on n.id=j.notification_id where n.dedupe_key='test:trophy-global-off'),'global opt-out creates no trophy push');
update public.mv_profiles set timezone='UTC',quiet_start='00:00',quiet_end='23:59' where id='22222222-2222-4222-8222-222222222222';
select public.test_assert((select count(*)=0 from public.mv_claim_push(50)),'quiet hours defer trophy push');
update public.mv_profiles set quiet_start='00:00',quiet_end='00:00',notification_types='{"enabled":true,"achievement":true}';
select job_id,attempt from public.mv_claim_push(1) \gset
select public.mv_ack_push(:'job_id',:attempt,true,false,null);
select public.mv_ack_push(:'job_id',:attempt,true,false,null);
select public.test_assert((select count(*)=0 from public.mv_claim_push(50)),'accepted device job is never claimed twice');
