'use strict';

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||self.registration.scope;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      try{
        const url=new URL(client.url);
        const wanted=new URL(target,self.registration.scope);
        if(url.origin===wanted.origin&&url.pathname.startsWith(new URL(self.registration.scope).pathname)){
          await client.focus();
          if('navigate' in client&&client.url!==wanted.href)await client.navigate(wanted.href);
          return;
        }
      }catch(_){}
    }
    if(self.clients.openWindow)await self.clients.openWindow(target);
  })());
});
