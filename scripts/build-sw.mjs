import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
const files=(await walk('dist')).filter(f=>!f.endsWith('sw.js')).sort();
const hash=createHash('sha256');for(const f of files)hash.update(await readFile(f));
const version='our-marvel-'+hash.digest('hex').slice(0,12);
await writeFile('dist/sw.js',`const CACHE=${JSON.stringify(version)};
const ASSETS=${JSON.stringify(['./',...files.map(f=>'./'+f.slice(5))])};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('our-marvel-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
event.respondWith((async()=>{const cache=await caches.open(CACHE);if(event.request.mode==='navigate'){try{return await fetch(event.request);}catch{return await cache.match(new URL('./index.html',self.registration.scope))||Response.error();}}
return await cache.match(event.request,{ignoreVary:true})||fetch(event.request);})());});
`);
console.log('Precached',files.length+1,'local resources;',version);
