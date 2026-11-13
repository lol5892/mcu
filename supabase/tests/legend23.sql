-- Disposable fixture users only. Never run against production.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.mv_legend();
select public.mv_apply(gen_random_uuid(),'rating','shang-chi','{"score":10,"season":0}',0);
select public.test_assert((select score=10 from public.mv_ratings where user_id=auth.uid() and project_id='shang-chi' and season=0),'rate before watching');
select public.test_assert((select count(*)=1 from public.mv_achievements where achievement_id='anton-perfect1'),'personal award from persisted score');
select public.test_assert((select count(*)=0 from public.mv_achievements where achievement_id='tanya-perfect1'),'cannot award partner for own score');
select public.test_denied('insert into public.mv_achievements select family_id,''tanya-perfect1'',''tanya'',100,now(),false from public.mv_members limit 1','XP cannot be forged');
select sum(xp) as xp_before from public.mv_achievements \gset
select public.mv_legend();select public.mv_legend();
select public.test_assert((select sum(xp)=:xp_before from public.mv_achievements),'repeated refresh never duplicates XP');
reset role;
insert into public.mv_entries(family_id,project_id,watched,updated_by)
select family_id,p,true,user_id from public.mv_members cross join unnest(array['iron-man','hulk','iron-man-2','thor','first-avenger','avengers','iron-man-3','thor-dark','winter-soldier','guardians','ultron','ant-man']) p where role='anton' and user_id='11111111-1111-4111-8111-111111111111'
on conflict(family_id,project_id) do update set watched=true;
set role authenticated;
select public.test_assert((select count(*)=2 from public.mv_achievements where achievement_id in ('phase-1-v1','phase-2-v1')),'phase one and two use correct six films');
select public.test_assert((select count(*)=0 from public.mv_achievements where achievement_id='phase-6-v1'),'future phase cannot complete');
select public.mv_legend();
select public.mv_apply(gen_random_uuid(),'entry','iron-man',jsonb_build_object('watched',false),(select version from public.mv_entries where project_id='iron-man'));
select public.test_assert((select count(*)=1 from public.mv_achievements where achievement_id='phase-1-v1'),'historical award survives unwatch');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.test_assert((select count(*)=0 from public.mv_achievements where achievement_id='phase-1-v1'),'other family cannot read awards');
select public.test_denied('select mv_private.legend_refresh(''99999999-0000-4000-8000-000000000001'',false)','client cannot call private evaluator');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.mv_apply(gen_random_uuid(),'rating','loki','{"season":2,"score":9}',coalesce((select version from public.mv_ratings where user_id=auth.uid() and project_id='loki' and season=2),0));
select public.test_assert((select score=9 from public.mv_ratings where user_id=auth.uid() and project_id='loki' and season=2),'season score independent of episodes');
select public.mv_apply(gen_random_uuid(),'rating','shang-chi','{"score":null}',(select version from public.mv_ratings where user_id=auth.uid() and project_id='shang-chi' and season=0));
select public.test_assert((select score is null from public.mv_ratings where user_id=auth.uid() and project_id='shang-chi' and season=0),'personal score can be deleted');
select public.test_assert((select count(*)=1 from public.mv_achievements where achievement_id='anton-perfect1'),'deleting rating does not farm or revoke historical XP');
reset role;
