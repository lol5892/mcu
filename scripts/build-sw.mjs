import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = process.env.MV_DIST_DIR || 'dist';
async function walk(path) { const entries = await readdir(path, {withFileTypes:true}); return (await Promise.all(entries.map(e => e.isDirectory() ? walk(`${path}/${e.name}`) : `${path}/${e.name}`))).flat(); }
const files = (await walk(dir)).filter(f => !f.endsWith('/sw.js')).sort();
// Hash the push handler as part of the shell. It is inlined below so an imported
// script can never remain stale independently of the controller's version.
let html = (await readFile(`${dir}/index.html`, 'utf8')).replace(/<meta name="mv-build" content="[^"]*">\s*/g, '');
await writeFile(`${dir}/index.html`, html);
const hash = createHash('sha256').update(await readFile(new URL(import.meta.url)));
for (const f of files) hash.update(f.slice(dir.length)).update(await readFile(f));
const prefix = process.env.BASE_PATH?.includes('/preview/') ? 'marvel-preview-' : 'our-marvel-';
const version = prefix + hash.digest('hex').slice(0, 12);
html = html.replace('</head>', `<meta name="mv-build" content="${version}"></head>`);
await writeFile(`${dir}/index.html`, html);
const assets = await Promise.all(files.map(async f => ['./' + f.slice(dir.length + 1), createHash('sha256').update(await readFile(f)).digest('hex')]));
const push = await readFile(`${dir}/sw-family.js`, 'utf8');
await writeFile(`${dir}/sw.js`, `${push}
const CACHE=${JSON.stringify(version)};
const PREFIX=${JSON.stringify(prefix)};
const ASSETS=${JSON.stringify(assets)};
const ASSET_URLS=new Map(ASSETS.map(([url,digest])=>[new URL(url,self.registration.scope).href,digest]));
const READY=new URL('./__shell_ready__',self.registration.scope).href;
const clientVersions=new Map();
let preparing=null;
let retired=[];
const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try {
  // A deployment/CDN race or truncated mobile download must not activate a
  // shell containing HTML and chunks from different builds.
  for(const [url,digest] of ASSET_URLS){
   const response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));
   if(!response.ok||hex(await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer()))!==digest)throw Error('Incomplete app release');
   await cache.put(url,response);
  }
  await cache.put(READY,new Response(CACHE));
 }catch(error){await caches.delete(CACHE);throw error;}
})()));
async function windows(){return (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(self.registration.scope));}
async function cleanup(){
 const clients=await windows();
 // Retain every previous shell until all open clients actually run this version,
 // including lazy chunks needed by an old page that was busy during activation.
 if(clients.some(c=>clientVersions.get(c.id)!==CACHE))return;
 for(const key of retired)await caches.delete(key);
 retired=[];
}
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);if(!await cache.match(READY))throw Error('Shell not ready');
 retired=(await caches.keys()).filter(key=>key.startsWith(PREFIX)&&/^[a-f0-9]{12}$/.test(key.slice(PREFIX.length))&&key!==CACHE);
 await self.clients.claim();
 for(const client of await windows())client.postMessage({type:'MV_VERSION_QUERY'});
 await cleanup();
})()));
self.addEventListener('message',event=>{
 const data=event.data;if(!data||typeof data!=='object')return;
 if(data.type==='MV_GET_VERSION'){event.source?.postMessage({type:'MV_VERSION',version:CACHE});return;}
 if(data.type==='MV_CLIENT_VERSION'&&event.source){clientVersions.set(event.source.id,data.version);event.waitUntil(cleanup());return;}
 if(data.type==='MV_SAFE'&&preparing&&data.nonce===preparing.nonce&&event.source){preparing.answers.set(event.source.id,data.safe===true);return;}
 if(data.type==='MV_ACTIVATE'&&!preparing)event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);if(!await cache.match(READY))return;
  const clients=await windows(), nonce=crypto.randomUUID();
  preparing={nonce,answers:new Map()};
  for(const client of clients)client.postMessage({type:'MV_PREPARE',nonce});
  await new Promise(resolve=>setTimeout(resolve,500));
  const latest=await windows();
  const safe=latest.every(c=>preparing.answers.get(c.id)===true);
  preparing=null;
  if(safe)await self.skipWaiting();
  else for(const client of latest)client.postMessage({type:'MV_ACTIVATION_DEFERRED'});
 })());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(event.request.mode==='navigate'){
  event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(new URL('./index.html',self.registration.scope))||Response.error()));return;
 }
 // Only build-listed public resources are served from the shell cache. Private
 // API responses, photos and arbitrary same-origin requests are never inserted.
 url.search='';
 if(ASSET_URLS.has(url.href))event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.href)||Response.error()));
 else if(/\\/assets\\/[^/]+-[a-zA-Z0-9_-]+\\.(?:js|css)$/.test(url.pathname))event.respondWith((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)){const hit=await(await caches.open(key)).match(url.href);if(hit)return hit;}
  return fetch(event.request);
 })());
});
`);
console.log('Verified shell resources:', assets.length, 'version:', version);
