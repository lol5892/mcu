"""Local SQL workload, NOT a claim about 200 Auth/WebSocket clients over internet."""
import subprocess,concurrent.futures,time,json,statistics,os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
subprocess.run(['bash','scripts/test-public-sql.sh'],cwd=root,env={**os.environ,'KV_SQL_DATABASE':'kino_load_test','KV_SCHEMA_ONLY':'1'},check=True,stdout=subprocess.DEVNULL)
base=['docker','--host=unix:///var/run/docker.sock','exec','-i','kino-beta-sql','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','kino_load_test','-At']
def sql(s):
 p=subprocess.run(base,input=s,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr[-800:])
 return p.stdout
sql("update mv_private.beta_config set accepting_families=true,max_families=100;insert into mv_private.beta_enrollments(email,can_create) select 'load-'||n||'@example.test',n%2=1 from generate_series(1,200)n;insert into auth.users select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'load-'||n||'@example.test',now() from generate_series(1,200)n;")
def pair(n):
 a='20000000-0000-4000-8000-'+str(2*n-1).zfill(12);b='20000000-0000-4000-8000-'+str(2*n).zfill(12);start=time.perf_counter()
 query=f"""set role authenticated;
 select set_config('request.jwt.claim.sub','{a}',false);
 select public.kv_create_pair('Участник {n}A','Нагрузочная пара {n}');
 select public.kv_invite('load-{2*n}@example.test') as invite \\gset
 select set_config('request.jwt.claim.sub','{b}',false);
 select public.kv_pair_invitation(:'invite'::jsonb->>'token',true,'Участник {n}B');
 select public.mv_apply(gen_random_uuid(),'rating','iron-man','{{"score":7}}',0);
 select public.mv_impression('iron-man','Синтетический нагрузочный текст B',0);
 select set_config('request.jwt.claim.sub','{a}',false);
 select public.mv_apply(gen_random_uuid(),'rating','iron-man','{{"score":9}}',0);
 select public.mv_impression('iron-man','Синтетический нагрузочный текст A',0);
 select public.mv_apply(gen_random_uuid(),'entry','iron-man','{{"watched":true}}',0);
 select set_config('request.jwt.claim.sub','{b}',false);
 select public.mv_apply(gen_random_uuid(),'watch_confirm',(select id::text from public.mv_watch_requests where status='pending'),'{{}}',(select version from public.mv_watch_requests where status='pending'));
 select public.mv_legend();
 """
 sql(query);return time.perf_counter()-start
start=time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool: timings=list(pool.map(pair,range(1,101)))
elapsed=time.perf_counter()-start
counts=json.loads(sql("select jsonb_build_object('pairs',(select count(*) from public.mv_families),'members',(select count(*) from public.mv_members),'ratings',(select count(*) from public.mv_ratings),'impressions',(select count(*) from public.mv_impressions),'watched',(select count(*) from public.mv_entries where watched),'awards',(select count(*) from public.mv_achievements),'xp_mismatches',(select count(*) from public.mv_achievements a join mv_private.trophy_presentation p on p.id=a.achievement_id join mv_private.trophy_xp_scale s on s.tier=p.tier where a.xp<>s.xp));"))
assert counts['pairs']==100 and counts['members']==200 and counts['ratings']==200 and counts['impressions']==200 and counts['watched']==100 and counts['xp_mismatches']==0,counts
result={'workload':'100 synthetic pairs / 200 SQL identities; 20 concurrent database sessions; local Docker', 'elapsed_s':round(elapsed,3),'pair_workflow_p50_s':round(statistics.median(timings),3),'pair_workflow_p95_s':round(sorted(timings)[94],3),'counts':counts,'limitations':'Does not measure 200 hosted Auth logins, 200 Realtime sockets, internet latency or iPhone push. No production family data used.'}
Path(root/'docs/public-beta/load-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
