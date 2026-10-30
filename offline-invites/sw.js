/* Development-only Web Push worker; separate /dev-invites/ scope.
 * Does not replace the game's existing root service worker. */
'use strict';
const TAG='gostop-dev-request-';
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let message;try{message=event.data?.json();}catch{return;}
  if(!message||!/^invite_[a-f0-9]{32}$/i.test(message.requestId||''))return;
  const tag=TAG+message.requestId;
  if(message.type==='cancel'){
   const notifications=await self.registration.getNotifications({tag});
   for(const n of notifications)n.close();
   const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   for(const client of windows)client.postMessage({kind:'gostop-dev-invite-closed',requestId:message.requestId});
   return;
  }
  if(message.type!=='request'||!Number.isFinite(message.expiresAt)||message.expiresAt<=Date.now())return;
  const sender=String(message.from||'Your friend').slice(0,40);
  await self.registration.showNotification('GoStop Live! • Competitive invitation',{
   body:sender+' wants to play. Respond within 30 seconds.',
   tag,requireInteraction:true,renotify:false,
   timestamp:Date.now(),data:{requestId:message.requestId,expiresAt:message.expiresAt},
   actions:[{action:'play',title:'Play now'},{action:'settings',title:'Notification settings'}]
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const id=String(event.notification?.data?.requestId||'');
  const base=new URL('/',self.location.origin);
  if(event.action==='settings')base.searchParams.set('devInviteSettings','1');
  else base.searchParams.set('offlineInvite',id);
  const target=base.href;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){
   try{
    if(new URL(client.url).origin!==self.location.origin)continue;
    if(typeof client.navigate==='function')await client.navigate(target);
    await client.focus();
    return;
   }catch(_){}
  }
  if(self.clients.openWindow)await self.clients.openWindow(target);
 })());
});
