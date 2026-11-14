import { test, expect, type Page } from '@playwright/test';
async function release(page:Page, version:string, broken=false) { await page.request.get(`/__release?version=${version}&broken=${broken?1:0}`); }
async function opened(page:Page) {
 await release(page,'v1');await page.goto('/mcu/');
 await expect(page.locator('h1')).toHaveText('v1');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
}
async function check(page:Page) { await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update(); window.dispatchEvent(new Event('pageshow'));}); }
async function seed(page:Page) { return page.evaluate(async()=>{
 localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:'test-session-sentinel',user:{id:'test-anton'}}));
 sessionStorage.setItem('draft-note','Наш вечер');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('our-marvel-preserved',1);request.onupgradeneeded=()=>request.result.createObjectStore('entries');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put({score:9,note:'Любимый фильм'},'iron-man');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 await(await caches.open('mv-push-receipts-v1')).put('/mcu/receipt',new Response('seen'));
 const reg=await navigator.serviceWorker.ready;
 return {scope:reg.scope,worker:reg.active?.scriptURL,manifest:await(await fetch('/mcu/manifest.webmanifest')).text()};
 }); }
async function preserved(page:Page,before:Awaited<ReturnType<typeof seed>>) {
 const after=await page.evaluate(async()=>{
 const reg=await navigator.serviceWorker.ready;
 const db=await new Promise<IDBDatabase>((resolve)=>{const request=indexedDB.open('our-marvel-preserved',1);request.onsuccess=()=>resolve(request.result);});
 const entry=await new Promise((resolve)=>{const request=db.transaction('entries').objectStore('entries').get('iron-man');request.onsuccess=()=>resolve(request.result);});db.close();
 return {scope:reg.scope,worker:reg.active?.scriptURL,auth:localStorage.getItem('sb-test-auth-token'),draft:sessionStorage.getItem('draft-note'),entry,receipt:await(await(await caches.open('mv-push-receipts-v1')).match('/mcu/receipt'))?.text(),manifest:await(await fetch('/mcu/manifest.webmanifest')).text(),pushApi:'pushManager' in reg};
 });
 expect(after).toMatchObject({...before,draft:'Наш вечер',entry:{score:9,note:'Любимый фильм'},receipt:'seen',pushApi:true});
 expect(after.auth).toContain('test-session-sentinel');
}
test('a complete new UI starts automatically and preserves session, IndexedDB, installation and push receipts',async({page})=>{
 await opened(page);const before=await seed(page);await release(page,'v2');await check(page);

 await expect(page.locator('h1')).toHaveText('v2');await preserved(page,before);
 await page.reload();await expect(page.locator('h1')).toHaveText('v2');
 const reloads=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('mv-reloaded:')).length);expect(reloads).toBe(1);
});
test('draft text delays activation until the user finishes',async({page})=>{
 await opened(page);await page.locator('textarea').fill('Танюш, наш вечер');await release(page,'v2');await check(page);
 await expect.poll(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
 await page.waitForTimeout(1300);await expect(page.locator('h1')).toHaveText('v1');await expect(page.locator('textarea')).toHaveValue('Танюш, наш вечер');
 await page.locator('textarea').fill('');await expect(page.locator('h1')).toHaveText('v2');
});
for(const blocker of ['active-session','sync-outbox','photo-upload'])test(`${blocker} defers update without losing work`,async({page})=>{
 await opened(page);await page.evaluate(name=>(window as any).block(name,true),blocker);await release(page,'v2');await check(page);await page.waitForTimeout(1300);
 await expect(page.locator('h1')).toHaveText('v1');await page.evaluate(name=>(window as any).block(name,false),blocker);await expect(page.locator('h1')).toHaveText('v2');
});
test('offline opening keeps the entire old shell then online foreground obtains the latest UI',async({page,context})=>{
 await opened(page);const before=await seed(page);await release(page,'v2');await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toHaveText('v1');
 await context.setOffline(false);await check(page);await expect(page.locator('h1')).toHaveText('v2');await preserved(page,before);
});
test('failed or partial download leaves the working UI and retries a complete release',async({page})=>{
 await opened(page);await release(page,'v2',true);await check(page);await page.waitForTimeout(1600);await expect(page.locator('h1')).toHaveText('v1');
 await page.reload();await expect(page.locator('h1')).toHaveText('v1');await release(page,'v2');await check(page);await expect(page.locator('h1')).toHaveText('v2');
});
test('reopening after all pages close applies a waiting version using the same browser installation',async({page,context})=>{
 await opened(page);const before=await seed(page);await page.evaluate(()=>(window as any).block('session',true));await release(page,'v2');await check(page);
 await expect.poll(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);await page.close();const next=await context.newPage();await next.goto('/mcu/');await expect(next.locator('h1')).toHaveText('v2');
 expect(await next.evaluate(()=>localStorage.getItem('sb-test-auth-token'))).toContain('test-session-sentinel');expect((await next.evaluate(async()=>(await navigator.serviceWorker.ready).scope))).toBe(before.scope);
});
test('a second tab with a draft vetoes activation, then both tabs adopt the new version',async({page,context})=>{
 await opened(page);const second=await context.newPage();await second.goto('/mcu/');await second.locator('textarea').fill('Не потерять');await release(page,'v2');await check(second);await page.waitForTimeout(1300);await expect(second.locator('h1')).toHaveText('v1');
 await second.locator('textarea').fill('');await expect(second.locator('h1')).toHaveText('v2');await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('h1')).toHaveText('v2');
});
test('unchanged artwork is reused only after checksum verification; corrupted cache is repaired',async({page})=>{await opened(page);const before=await(await page.request.get('/__stats')).json();await release(page,'v2');await check(page);await expect(page.locator('h1')).toHaveText('v2');const reused=await(await page.request.get('/__stats')).json();expect(reused.artworkRequests).toBe(before.artworkRequests);await page.evaluate(async()=>{for(const key of await caches.keys())if(key.startsWith('our-marvel-'))await(await caches.open(key)).put('/mcu/assets/catalogue-poster.webp',new Response('corrupt cached artwork'));});await release(page,'v3');await check(page);await expect(page.locator('h1')).toHaveText('v3');const repaired=await(await page.request.get('/__stats')).json();expect(repaired.artworkRequests).toBe(before.artworkRequests+1);});

// Exercise the actual 164 release illustrations, not a token dummy image.
import { readFileSync } from 'node:fs';
const trophyArtwork = JSON.parse(readFileSync(new URL('../../src/legend/artwork.json', import.meta.url),'utf8')) as Record<string,{full:string;thumbnail:string}>;
test('all 82 full trophies and 82 thumbnails remain available offline after a safe update',async({page,context})=>{
 await opened(page);await release(page,'v2');await check(page);await expect(page.locator('h1')).toHaveText('v2');
 await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toHaveText('v2');
 const paths=Object.values(trophyArtwork).flatMap(a=>[a.full,a.thumbnail]);
 const results=await page.evaluate(async paths=>Promise.all(paths.map(async p=>{const r=await fetch('/mcu/'+p);const b=await r.arrayBuffer();return {ok:r.ok,bytes:b.byteLength,magic:new TextDecoder().decode(b.slice(8,12))};})),paths);
 expect(results).toHaveLength(164);expect(results.every(r=>r.ok&&r.bytes>1000&&r.magic==='WEBP')).toBe(true);
});
