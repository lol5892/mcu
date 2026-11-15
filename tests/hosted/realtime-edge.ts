import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
Deno.serve(async req=>{
 if(req.method!=='POST'||!url.includes('aadztcqfwtuniucrlsgc'))return new Response('Not found',{status:404});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {data:settings}=await admin.rpc('mv_delivery_settings');const secret=settings?.mv_cron_secret;
 if(!secret||Number(secret.split('.').at(-1))<Date.now()||req.headers.get('authorization')!=='Bearer '+secret)return new Response('Forbidden',{status:403});
 const clients:any[]=[],channels:any[]=[],states:any[]=[];let own=0,foreign=0;
 try{
  const {data}=await admin.auth.admin.listUsers();
  for(const email of ['qa-a1@example.test','qa-b1@example.test','qa-a2@example.test']){
   const user=data.users.find(u=>u.email===email);if(!user)throw Error('missing synthetic account');
   const password='Qa-'+crypto.randomUUID()+'-aA7!';const changed=await admin.auth.admin.updateUserById(user.id,{password});if(changed.error)throw changed.error;
   const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;await client.realtime.setAuth(login.data.session!.access_token);
  }
  const {data:members}=await clients[0].from('mv_members').select('*');const family=members[0].family_id;
  async function subscribe(client:any,label:string,fn:()=>void){const ch=client.channel('qa-rt:'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'mv_ratings',filter:'family_id=eq.'+family},fn).on('system',{},(m:any)=>states.push({label,system:m}));channels.push(ch);await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('subscribe timeout '+label)),15000);ch.subscribe((status:string,error:any)=>{states.push({label,status,error:error?.message});if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(error||Error('channel error'));}});});}
  await subscribe(clients[0],'own',()=>own++);await subscribe(clients[2],'foreign',()=>foreign++);
  const before=await clients[1].from('mv_ratings').select('*').eq('project_id','iron-man');const row=before.data[0];
  const changed=await clients[1].rpc('mv_apply',{p_id:crypto.randomUUID(),p_kind:'rating',p_target:'iron-man',p_payload:{score:row.score===8?7:8},p_expected:row.version});if(changed.error)throw changed.error;
  const end=Date.now()+20000;while(own===0 && Date.now()<end)await new Promise(r=>setTimeout(r,200));await new Promise(r=>setTimeout(r,1000));
  return Response.json({ok:own>0&&foreign===0,ownEvents:own,foreignEvents:foreign,states});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:String(e),ownEvents:own,foreignEvents:foreign,states},{status:500});}
 finally{for(const c of channels)try{await c.unsubscribe();}catch{}for(const c of clients)try{await c.auth.signOut();}catch{}}
});
