// Imported by the generated app-shell worker. Private API responses and photos
// are never cached here. Push payloads contain generic text and a safe route.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(!payload||typeof payload.id!=='string'||!/^[a-f0-9-]{36}$/i.test(payload.id))return;
  const safeRoute=typeof payload.route==='string'&&/^\/(letters|chat|project|moments|events|sessions|settings)(\/[a-zA-Z0-9-]+)?$/.test(payload.route)?payload.route:'/universe';
  const cache=await caches.open('mv-push-receipts-v1');
  const key=new URL('__push_receipt__/'+payload.id,self.registration.scope).href;
  if(await cache.match(key))return;
  // Stable tags collapse retries across transport failures; a durable receipt
  // also avoids showing the same server notification twice on this device.
  await self.registration.showNotification(typeof payload.title==='string'?payload.title.slice(0,160):'Наша маленькая вселенная',{
   body:'Откройте «Наш Marvel», чтобы посмотреть.',tag:'marvel:'+payload.id,
   icon:new URL('icons/icon-192.png',self.registration.scope).href,
   badge:new URL('icons/icon-192.png',self.registration.scope).href,
   data:{route:safeRoute,id:payload.id},renotify:false,
  });
  await cache.put(key,new Response('seen',{headers:{'Content-Type':'text/plain'}}));
  const keys=await cache.keys();if(keys.length>500)for(const old of keys.slice(0,keys.length-500))await cache.delete(old);
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const route=event.notification.data?.route||'/universe';
 const safeRoute=/^\/(letters|chat|project|moments|events|sessions|settings)(\/[a-zA-Z0-9-]+)?$/.test(route)?route:'/universe';
 const target=new URL('./',self.registration.scope);target.hash=safeRoute;
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(client.url.startsWith(self.registration.scope)){await client.navigate(target.href);return client.focus();}
  return self.clients.openWindow(target.href);
 })());
});
