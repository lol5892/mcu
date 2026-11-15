// Temporary QA harness for the EMPTY isolated beta project only. Retire to 404 after use.
import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {encode} from 'npm:jpeg-js@0.4.4';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
let running=false;
Deno.serve(async req=>{
 if(req.method!=='POST' || !url.includes('aadztcqfwtuniucrlsgc'))return new Response('Not found',{status:404});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:settings}=await admin.rpc('mv_delivery_settings');const secret=settings?.mv_cron_secret;
 if(!secret || Number(secret.split('.').at(-1))<Date.now() || req.headers.get('authorization')!=='Bearer '+secret || running)return new Response('Forbidden',{status:403});
 running=true;const start=Date.now();let passed=0;const clients:any[]=[],pairs:any[]=[];const channels:any[]=[];
 const assert=(ok:boolean,label:string)=>{if(!ok)throw Error(label);passed++;};
 const rpc=async(c:any,name:string,args:object={})=>{const {data,error}=await c.rpc(name,args);if(error)throw Error(name+':'+error.message);return data;};
 try{
  for(let n=1;n<=5;n++){
   const pair:any={};
   for(const role of ['a','b']){
    const email=`qa-${role}${n}@example.test`,password='Qa-'+crypto.randomUUID()+'-aA7!';
    const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw Error('create-test-user:'+made.error.message);
    const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
    const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error('login:'+login.error.message);
    assert(Boolean(login.data.session?.access_token),'actual Auth password login');await client.realtime.setAuth(login.data.session!.access_token);pair[role]=client;pair[role+'Id']=login.data.user!.id;
   }
   const family=await rpc(pair.a,'kv_create_pair',{p_name:'Тест '+n+'A',p_family_name:'Синтетическая пара '+n});pair.family=family;
   const invite=await rpc(pair.a,'kv_invite',{p_email:`qa-b${n}@example.test`});
   const preview=await rpc(pair.b,'kv_pair_invitation',{p_secret:invite.token,p_accept:false});assert(preview.ok && preview.inviter==='Тест '+n+'A','preview actual inviter');
   const join=await rpc(pair.b,'kv_pair_invitation',{p_secret:invite.code,p_accept:true,p_name:'Тест '+n+'B'});assert(join.ok && join.family_id===family,'explicit confirmed join');
   const members=await pair.a.from('mv_members').select('*');assert(members.data?.length===2 && members.data.every((m:any)=>m.family_id===family),'real API membership isolation');
   const independent=await rpc(pair.b,'mv_apply',{p_id:crypto.randomUUID(),p_kind:'rating',p_target:'iron-man',p_payload:{score:7},p_expected:0});assert(independent.ok,'rating before watched');
   await rpc(pair.a,'mv_apply',{p_id:crypto.randomUUID(),p_kind:'rating',p_target:'iron-man',p_payload:{score:9},p_expected:0});
   await rpc(pair.a,'mv_impression',{p_project:'iron-man',p_body:'Искусственное впечатление A',p_expected:0});await rpc(pair.b,'mv_impression',{p_project:'iron-man',p_body:'Искусственное впечатление B',p_expected:0});
   const impressions=await pair.b.from('mv_impressions').select('*');assert(impressions.data?.length===2 && impressions.data.every((r:any)=>r.family_id===family),'actual impressions stay in pair');
   await rpc(pair.a,'mv_apply',{p_id:crypto.randomUUID(),p_kind:'entry',p_target:'iron-man',p_payload:{watched:true},p_expected:0});
   const {data:requests}=await pair.b.from('mv_watch_requests').select('*').eq('status','pending');assert(requests?.length===1,'real pending watch');
   await rpc(pair.b,'mv_apply',{p_id:crypto.randomUUID(),p_kind:'watch_confirm',p_target:requests[0].id,p_payload:{},p_expected:requests[0].version});
   const {data:awards}=await pair.a.from('mv_achievements').select('*');assert(awards.some((r:any)=>r.achievement_id==='films-1'&&r.xp===10),'actual trigger canonical bronze XP');
   const width=800,height=500,pixels=new Uint8Array(width*height*4);for(let j=0;j<pixels.length;j+=4){pixels[j]=(j/4)%255;pixels[j+1]=110;pixels[j+2]=170;pixels[j+3]=255;}
   const bytes=Uint8Array.from(encode({width,height,data:pixels},75).data),mid=crypto.randomUUID();
   await rpc(pair.a,'mv_prepare_media',{p_id:mid,p_kind:'avatar',p_target:null,p_type:'image/jpeg',p_size:bytes.length});
   const form=new FormData();form.append('id',mid);form.append('photo',new Blob([bytes.buffer],{type:'image/jpeg'}),'synthetic.jpg');
   const uploaded=await pair.a.functions.invoke('media-upload',{body:form});assert(!uploaded.error && uploaded.data?.ok,'actual authenticated Edge upload');
   const {data:media}=await pair.b.from('mv_media').select('*').eq('id',mid).single();assert(media.ready && media.thumbnail_path && media.byte_size<=524288 && media.thumbnail_bytes<=65536,'actual full image and thumbnail sizes');pair.path=media.object_path;
   const downloaded=await pair.b.storage.from('marvel-private').download(media.thumbnail_path);assert(!downloaded.error && downloaded.data?.size>0,'partner downloads private thumbnail');
   pairs.push(pair);
  }
  for(let n=0;n<5;n++){
   const pair=pairs[n],other=pairs[(n+1)%5];
   for(const table of ['mv_entries','mv_ratings','mv_impressions','mv_sessions','mv_media','mv_achievements','mv_notifications','mv_members']){
    const r=await pair.a.from(table).select('*').eq('family_id',other.family);assert(!r.error && r.data.length===0,'actual RLS cross-pair '+table);
   }
   const foreign=await pair.a.storage.from('marvel-private').download(other.path);assert(Boolean(foreign.error),'actual private storage rejects foreign photo');
   const forged=await pair.a.rpc('mv_apply',{p_id:crypto.randomUUID(),p_kind:'rating',p_target:'thor',p_payload:{score:10,user_id:pair.bId},p_expected:0});assert(Boolean(forged.error),'actual RPC forbids forged author');
  }
  let ownEvents=0,foreignEvents=0;
  async function subscribe(client:any,family:string,callback:()=>void){const channel=client.channel('qa:'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'mv_ratings',filter:'family_id=eq.'+family},callback);channels.push(channel);await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('realtime subscribe timeout')),12000);channel.subscribe((status:string)=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('realtime rejected'));}});});}
  await subscribe(pairs[0].a,pairs[0].family,()=>ownEvents++);await subscribe(pairs[1].a,pairs[0].family,()=>foreignEvents++);
  await rpc(pairs[0].b,'mv_apply',{p_id:crypto.randomUUID(),p_kind:'rating',p_target:'iron-man',p_payload:{score:8},p_expected:1});
  const until=Date.now()+20000;while(!ownEvents && Date.now()<until)await new Promise(r=>setTimeout(r,200));assert(ownEvents>0,'real hosted Realtime reaches own partner');assert(foreignEvents===0,'real hosted Realtime does not leak cross-pair records');
  return Response.json({ok:true,pairs:5,accounts:10,assertions:passed,elapsed_ms:Date.now()-start,mail_delivery_tested:false,physical_push_tested:false});
 }catch(e){return Response.json({ok:false,assertions:passed,error:e instanceof Error?e.message:'QA failed'},{status:500});}
 finally{for(const channel of channels)try{await channel.unsubscribe();}catch{}for(const client of clients)try{await client.auth.signOut();}catch{}}
});
