-- Disposable local database only, bootstrapped by scripts/test-sql.sh.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.mv_apply(gen_random_uuid(),'session','81000000-0000-4000-8000-000000000001','{"project_id":"iron-man-2"}',0);
select public.mv_apply(gen_random_uuid(),'session','81000000-0000-4000-8000-000000000002','{"project_id":"thor"}',0);
select public.test_assert((select count(*)=1 from public.mv_sessions where status='active'),'second start joins unique active session');
select id::text as current_session from public.mv_sessions where status='active' \gset
select public.mv_prepare_media('82000000-0000-4000-8000-000000000001','staged',null,'image/jpeg',123);
select public.test_assert(public.mv_prepare_media('82000000-0000-4000-8000-000000000001','staged',null,'image/jpeg',123) is not null,'stable upload reservation retry');
select public.test_denied('select public.mv_apply(gen_random_uuid(),''moment'',''83000000-0000-4000-8000-000000000001'',''{"caption":"test","media_ids":["82000000-0000-4000-8000-000000000001"]}'',0)','unfinished upload cannot publish');
select public.test_assert((select count(*)=0 from public.mv_moments where id='83000000-0000-4000-8000-000000000001'),'failed publication rolls back empty parent');
reset role;
update public.mv_media set ready=true where id='82000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.test_assert((select count(*)=0 from public.mv_media where id='82000000-0000-4000-8000-000000000001'),'partner cannot see staged photo');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.mv_apply('84000000-0000-4000-8000-000000000001','message','85000000-0000-4000-8000-000000000001',jsonb_build_object('scope','session','target',:'current_session','body','','media_ids',jsonb_build_array('82000000-0000-4000-8000-000000000001')),0);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.test_assert((select count(*)=1 from public.mv_media where id='82000000-0000-4000-8000-000000000001'),'published photo visible to partner');
select public.mv_apply(gen_random_uuid(),'moment','83000000-0000-4000-8000-000000000001','{"caption":"shared","media_ids":["82000000-0000-4000-8000-000000000001"]}',0);
select public.test_assert((select count(*)=2 from public.mv_media_links where media_id='82000000-0000-4000-8000-000000000001'),'reuse photo without second upload');
select public.test_assert((select author_id='11111111-1111-4111-8111-111111111111' from public.mv_media_links where kind='moment' and media_id='82000000-0000-4000-8000-000000000001'),'photo author preserved on reuse');
select public.test_assert(jsonb_array_length(public.mv_export()->'mediaLinks')>=2,'export includes attachment links');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.test_assert((select count(*)=0 from public.mv_media_links where media_id='82000000-0000-4000-8000-000000000001'),'other family cannot enumerate attachments');
select public.test_denied('select public.mv_apply(gen_random_uuid(),''moment_attach'',''83000000-0000-4000-8000-000000000001'',''{"media_ids":["82000000-0000-4000-8000-000000000001"]}'',0)','other family cannot attach photo');
reset role;
