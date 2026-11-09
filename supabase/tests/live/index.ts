// Temporary hosted integration runner. Deploy only for a release check, then
// replace the endpoint with HTTP 410. Never uses the real family's accounts.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import jpeg from "npm:jpeg-js@0.4.4";
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=createClient(url,key,{auth:{persistSession:false}});
Deno.serve(async req=>{
 const {data:settings}=await admin.rpc('mv_delivery_settings');
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(req.headers.get('Authorization')||''),digest('Bearer '+settings?.mv_cron_secret)]);
 if(req.method!=='POST'||!settings?.mv_cron_secret||a.some((v,i)=>v!==b[i]))return new Response('Unauthorized',{status:401});
 const passed:string[]=[],users:string[]=[],clients:SupabaseClient<any>[]=[],tokens:string[]=[];let family:string|undefined,mediaPath:string|undefined;const cleanupErrors:string[]=[];
 const check=(ok:unknown,name:string)=>{if(!ok)throw Error(name);passed.push(name)};
 const must=async(q:PromiseLike<any>)=>{const r=await q;if(r.error)throw Error(r.error.code+': '+r.error.message);return r.data;};
 const apply=(c:any,kind:string,target:string,payload:any,version=0,id=crypto.randomUUID())=>must(c.rpc('mv_apply',{p_id:id,p_kind:kind,p_target:target,p_payload:payload,p_expected:version}));
 try{
  for(let i=0;i<3;i++){
   const email='release-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomUUID()+'aA1!';
   const u=await must(admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(u.user.id);
   const c=createClient(url,anon,{auth:{persistSession:false}});const session=await must(c.auth.signInWithPassword({email,password}));clients.push(c);tokens.push(session.session.access_token);
  }
  check(users.length===3,'three isolated real Auth sessions');
  await must(admin.from('mv_profiles').insert(users.map(id=>({id}))));
  family=(await must(admin.from('mv_families').insert({name:'Disposable release checks'}).select('id').single())).id;
  await must(admin.from('mv_members').insert([{family_id:family,user_id:users[0],role:'anton'},{family_id:family,user_id:users[1],role:'tanya'}]));
  const [x,y,z]=clients;
  await must(admin.from('mv_welcome').insert({family_id:family,scenes:['Synthetic 1','Synthetic 2','Synthetic 3'],body:'Synthetic test greeting'}));
  check((await must(x.from('mv_welcome').select('*'))).length===0,'greeting hidden from Anton');
  check((await must(y.from('mv_welcome').select('*'))).length===1,'greeting available only to invited partner');
  check((await must(z.from('mv_welcome').select('*'))).length===0,'greeting hidden from outsider');
  await must(y.rpc('mv_update_profile',{p:{welcome_seen:true}}));
  check(Boolean((await must(y.from('mv_profiles').select('welcome_seen_at').eq('id',users[1]).single())).welcome_seen_at),'greeting first-view flag persisted on server');
  check((await must(z.from('mv_members').select('*'))).length===0,'outsider cannot read family members');
  check(Boolean((await z.rpc('mv_create_family')).error),'outsider cannot create owner family');
  check(Boolean((await admin.from('mv_members').insert({family_id:family,user_id:users[2],role:'tanya'})).error),'third family slot rejected');
  const project=(await must(x.from('mv_projects').select('id').eq('kind','film').neq('section','future').lt('release_date','2026-01-01').limit(1)))[0].id;
  const op=crypto.randomUUID();await apply(x,'entry',project,{watched:true},0,op);await apply(x,'entry',project,{watched:true},0,op);
  check((await must(y.from('mv_entries').select('*').eq('project_id',project))).length===1,'shared watched entry visible and replay deduplicated');
  check(Boolean((await y.rpc('mv_apply',{p_id:crypto.randomUUID(),p_kind:'entry',p_target:project,p_payload:{watched:false},p_expected:0})).error),'stale edit rejected without overwriting progress');
  const series=(await must(x.from('mv_projects').select('*').eq('id','loki').single()));
  await apply(x,'episode',series.id,{season:1,episode:1,watched:true});
  await apply(y,'rating',series.id,{season:1,score:9});
  check((await must(x.from('mv_episodes').select('*').eq('project_id',series.id))).length===1,'episode progress shared without completing series');
  check((await must(x.from('mv_ratings').select('*').eq('project_id',series.id)))[0]?.score===9,'season rating allowed after first viewed episode');
  await apply(x,'rating',project,{score:8});await apply(y,'rating',project,{score:10});
  check((await must(x.from('mv_ratings').select('score').eq('project_id',project))).reduce((s:number,r:any)=>s+r.score,0)===18,'two separate personal ratings');
  check(Boolean((await y.rpc('mv_apply',{p_id:crypto.randomUUID(),p_kind:'rating',p_target:project,p_payload:{score:1,user_id:users[0]},p_expected:0})).error),'rating impersonation rejected');
  check((await must(z.from('mv_ratings').select('*'))).length===0,'outsider cannot read ratings');
  let gotRealtime:(v:boolean)=>void=()=>{};const changed=new Promise<boolean>(resolve=>gotRealtime=resolve);
  await y.realtime.setAuth(tokens[1]);
  const channel=y.channel('release-'+family).on('system',{},payload=>console.log('RELEASE_REALTIME_SYSTEM',JSON.stringify(payload))).on('postgres_changes',{event:'INSERT',schema:'public',table:'mv_messages',filter:'family_id=eq.'+family},()=>gotRealtime(true));
  await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('realtime subscription timeout')),15000);channel.subscribe((s:string)=>{if(s==='SUBSCRIBED'){clearTimeout(t);resolve()}})});
  const msg=crypto.randomUUID();await apply(x,'message',msg,{scope:'chat',body:'Disposable live message'});
  const realtimeDelivered=await Promise.race([changed,new Promise(resolve=>setTimeout(()=>resolve(false),25000))]);await y.removeChannel(channel);
  check((await must(y.from('mv_messages').select('*').eq('id',msg))).length===1,'partner can read chat');
  check(Boolean((await y.rpc('mv_apply',{p_id:crypto.randomUUID(),p_kind:'message',p_target:msg,p_payload:{body:'forged'},p_expected:1})).error),'partner cannot edit author message');
  const letter=crypto.randomUUID();await apply(x,'letter',letter,{title:'Integration only',body:'Disposable letter',status:'draft'});
  check((await must(y.from('mv_letters').select('*'))).length===0,'draft hidden from recipient');
  await apply(x,'letter',letter,{title:'Integration only',body:'Disposable letter',status:'scheduled',scheduled_at:new Date(Date.now()+3600000).toISOString()},1);
  check((await must(y.from('mv_letters').select('*'))).length===0,'scheduled letter hidden from recipient');
  await must(admin.from('mv_letters').update({scheduled_at:new Date(Date.now()-1000).toISOString()}).eq('id',letter));await must(admin.rpc('mv_tick'));
  check((await must(y.from('mv_letters').select('*').eq('id',letter)))[0]?.status==='delivered','server tick delivers due letter');
  check((await must(z.from('mv_letters').select('*'))).length===0,'outsider cannot read delivered letters');
  const event=crypto.randomUUID();await apply(x,'event',event,{project_id:project,starts_at:new Date(Date.now()+86400000*3).toISOString(),timezone:'Europe/Moscow'});await apply(y,'event',event,{status:'confirmed'},1);
  check((await must(x.from('mv_events').select('*').eq('id',event)))[0]?.status==='confirmed','partner confirms calendar event');
  const session=crypto.randomUUID();await apply(x,'session',session,{project_id:project});await apply(y,'session',session,{film_minute:12},1);await apply(x,'session',session,{status:'finished'},2);
  check((await must(y.from('mv_sessions').select('*').eq('id',session)))[0]?.status==='finished','shared session updates and finishes');
  const moment=crypto.randomUUID(),media=crypto.randomUUID();await apply(x,'moment',moment,{caption:'Disposable upload'});
  const photo=jpeg.encode({data:new Uint8Array([80,40,30,255]),width:1,height:1},80).data;
  await must(x.rpc('mv_prepare_media',{p_id:media,p_kind:'moment',p_target:moment,p_type:'image/jpeg',p_size:photo.length}));
  const form=new FormData();form.append('id',media);form.append('photo',new File([new Uint8Array(photo)],'test.jpg',{type:'image/jpeg'}));
  const upload=await fetch(url+'/functions/v1/media-upload',{method:'POST',headers:{Authorization:'Bearer '+tokens[0]},body:form});check(upload.ok,'actual private JPEG upload succeeds');
  const record=(await must(x.from('mv_media').select('*').eq('id',media).single()));mediaPath=record.object_path;
  check(record.ready,'upload finalized atomically');
  check(!(await y.storage.from('marvel-private').download(mediaPath!)).error,'partner can download private photo');
  check(Boolean((await z.storage.from('marvel-private').download(mediaPath!)).error),'outsider cannot download private photo');
  check(Boolean((await z.rpc('mv_delivery_settings')).error),'delivery keys inaccessible to authenticated outsider');
  check(realtimeDelivered,'actual Realtime message reaches partner');
  return Response.json({ok:true,passed});
 }catch(error){return Response.json({ok:false,passed,error:String(error).slice(0,500)},{status:500});}
 finally{
  if(mediaPath){const r=await admin.storage.from('marvel-private').remove([mediaPath]);if(r.error)cleanupErrors.push('storage');}
  for(const c of clients)await c.auth.signOut({scope:'global'});
  if(family){const r=await admin.from('mv_families').delete().eq('id',family);if(r.error)console.error('TEST_CLEANUP_FAMILY',family,r.error.code);}
  for(const id of users){await admin.from('mv_profiles').delete().eq('id',id);const r=await admin.auth.admin.deleteUser(id);if(r.error)console.error('TEST_CLEANUP_USER',id,r.error.code);}
  if(cleanupErrors.length)console.error('TEST_CLEANUP_STORAGE');
 }
});
