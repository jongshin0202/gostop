/* Development-only offline Competitive friend invitation authority.
 * No imports or writes to the production game Worker, game state, or account store.
 */
import {buildPushPayload} from '@block65/webcrypto-web-push';
const TTL=30000;
const HOSTS=new Set(['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com']);
const okOrigin=s=>s==='https://gostop-dev.vercel.app'||s==='https://gostop-dev-jwshin1-5345s-projects.vercel.app';
const headers=o=>({'access-control-allow-origin':o,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','vary':'Origin','cache-control':'no-store'});
const json=(x,status=200,h={})=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json',...h}});
const error=(code,status=400)=>json({ok:false,error:code},status);
const validId=id=>typeof id==='string'&&/^[a-z0-9:_-]{5,130}$/i.test(id);
const safeEndpoint=s=>{
 try{const u=new URL(s);return u.protocol==='https:'&&(HOSTS.has(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}
};
const base64url=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const cardAccount=x=>({id:String(x.id),nickname:String(x.nickname||'Player').slice(0,40)});
async function authenticate(req,env,origin){
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer\s+[a-z0-9._-]{12,4096}$/i.test(authorization)||!env.DEV_AUTH?.fetch)return null;
 try{
  const response=await env.DEV_AUTH.fetch(new Request('https://gostop-authority-dev.jwshin1.workers.dev/api/me',{headers:{authorization,Origin:origin}}));
  if(!response.ok)return null;
  const value=await response.json();
  if(!validId(value.account?.id))return null;
  return {user:cardAccount(value.account),authorization};
 }catch{return null;}
}
async function isFriend(env,authorization,origin,targetId){
 if(!env.DEV_AUTH?.fetch)return false;
 try{
  const r=await env.DEV_AUTH.fetch(new Request('https://gostop-authority-dev.jwshin1.workers.dev/api/social',{headers:{authorization,Origin:origin}}));
  if(!r.ok)return false;
  const x=await r.json();
  return Array.isArray(x.friends)&&x.friends.some(p=>String(p.accountId)===targetId&&p.friendState==='friend');
 }catch{return false;}
}
async function body(req){
 if(Number(req.headers.get('content-length'))>12000)return null;
 const text=await req.text();if(text.length>12000)return null;
 try{return JSON.parse(text);}catch{return null;}
}
export class OfflineInviteStore{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async get(k,def){return (await this.ctx.storage.get(k))??def;}
 async put(k,value){await this.ctx.storage.put(k,value);}
 async keys(){
  let pair=await this.get('vapid');
  if(!pair){
   const generated=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
   const publicKey=await crypto.subtle.exportKey('raw',generated.publicKey);
   const privateKey=await crypto.subtle.exportKey('jwk',generated.privateKey);
   pair={publicKey:base64url(publicKey),privateKey:privateKey.d};
   await this.put('vapid',pair);
  }
  return pair;
 }
 async push(target,payload){
  const subs=await this.get('subscriptions:'+target,[]);
  if(!subs.length)return 0;
  const keys=await this.keys();
  let count=0;
  await Promise.all(subs.map(async s=>{
   try{
    const data=await buildPushPayload(
      {data:JSON.stringify(payload),options:{ttl:30}},s,
      {subject:'mailto:noreply@gostoplive.com',publicKey:keys.publicKey,privateKey:keys.privateKey}
    );
    const r=await fetch(s.endpoint,data);
    if(r.ok)count++;
    if(r.status===404||r.status===410)await this.unsubscribe(target,s.endpoint);
   }catch(_){}
  }));
  return count;
 }
 async unsubscribe(accountId,endpoint){
  const key='subscriptions:'+accountId,subs=await this.get(key,[]);
  await this.put(key,subs.filter(s=>s.endpoint!==endpoint));
 }
 async settle(id,why){
  const invite=await this.get('invite:'+id);
  if(!invite||invite.status!=='pending')return invite;
  invite.status=why;invite.endedAt=Date.now();
  await this.put('invite:'+id,invite);
  await this.push(invite.targetId,{type:'cancel',requestId:id,reason:why});
  return invite;
 }
 async alarm(){
  const pending=await this.get('pending',[]);
  const next=[];
  for(const id of pending){
   const i=await this.get('invite:'+id);
   if(!i||i.status!=='pending')continue;
   if(i.expiresAt<=Date.now())await this.settle(id,'expired');
   else next.push(id);
  }
  await this.put('pending',next);
  if(next.length){
   const times=await Promise.all(next.map(id=>this.get('invite:'+id)));
   const first=Math.min(...times.map(i=>i.expiresAt));
   await this.ctx.storage.setAlarm(first);
  }
 }
 async fetch(req){
  const url=new URL(req.url),path=url.pathname,actor=req.headers.get('x-actor-id')||'';
  const actorName=req.headers.get('x-actor-name')||'Player';
  if(path==='/public-key')return json({ok:true,publicKey:(await this.keys()).publicKey});
  if(!validId(actor))return error('AUTH_REQUIRED',401);
  if(req.method==='GET'&&path==='/state'){
   const prefs=await this.get('pref:'+actor,{enabled:true});
   const subscriptions=await this.get('subscriptions:'+actor,[]);
   const pending=await this.get('pending',[]);
   const relevant=[];
   for(const id of pending){
    const item=await this.get('invite:'+id);
    if(!item)continue;
    if(item.expiresAt<=Date.now()&&item.status==='pending'){await this.settle(id,'expired');continue;}
    if(item.senderId===actor||item.targetId===actor)relevant.push(item);
   }
   return json({ok:true,enabled:prefs.enabled!==false,subscribedDevices:subscriptions.length,invites:relevant});
  }
  if(req.method==='POST'&&path==='/preference'){
   const x=await body(req);
   if(typeof x?.enabled!=='boolean')return error('BAD_PREFERENCE');
   await this.put('pref:'+actor,{enabled:x.enabled});
   if(!x.enabled){
    const pending=await this.get('pending',[]);
    for(const id of pending){const item=await this.get('invite:'+id);if(item?.targetId===actor&&item.status==='pending')await this.settle(id,'disabled');}
   }
   return json({ok:true,enabled:x.enabled});
  }
  if(req.method==='POST'&&path==='/subscribe'){
   const x=await body(req),s=x?.subscription;
   if(!safeEndpoint(s?.endpoint)||!s?.keys||!/^[-\w]{60,120}$/.test(s.keys.p256dh||'')||!/^[-\w]{18,40}$/.test(s.keys.auth||''))
     return error('INVALID_PUSH_SUBSCRIPTION');
   const key='subscriptions:'+actor,subs=await this.get(key,[]);
   await this.put(key,[...subs.filter(v=>v.endpoint!==s.endpoint),s].slice(-8));
   return json({ok:true,devices:Math.min(8,subs.length+1)});
  }
  if(req.method==='POST'&&path==='/unsubscribe'){
   const x=await body(req);
   if(!safeEndpoint(x?.endpoint))return error('BAD_ENDPOINT');
   await this.unsubscribe(actor,x.endpoint);
   return json({ok:true});
  }
  if(req.method==='POST'&&path==='/eligibility'){
   const x=await body(req),targetId=String(x?.targetId||'');
   if(!validId(targetId)||targetId===actor||x?.friendVerified!==true)
     return error('NOT_FRIEND',403);
   const prefs=await this.get('pref:'+targetId,{enabled:true});
   const subs=await this.get('subscriptions:'+targetId,[]);
   return json({ok:true,targetId,canRequest:prefs.enabled!==false&&subs.length>0});
  }
  if(req.method==='POST'&&path==='/request'){
   const x=await body(req),targetId=x?.targetId;
   if(!validId(targetId)||targetId===actor||x?.friendVerified!==true)return error('NOT_FRIEND',403);
   const pref=await this.get('pref:'+targetId,{enabled:true});
   if(pref.enabled===false)return error('OFFLINE_REQUESTS_DISABLED',403);
   const pending=await this.get('pending',[]);
   for(const id of pending){
    const current=await this.get('invite:'+id);
    if(current?.status==='pending'&&current.expiresAt>Date.now()&&(current.senderId===actor||current.targetId===targetId))return error('REQUEST_ALREADY_IN_PROGRESS',409);
   }
   const id='invite_'+crypto.randomUUID().replace(/-/g,'');
   const invite={requestId:id,senderId:actor,senderName:actorName,targetId,
     expiresAt:Date.now()+TTL,createdAt:Date.now(),status:'pending',roomCode:null};
   await this.put('invite:'+id,invite);
   await this.put('pending',[...pending.filter(Boolean).slice(-100),id]);
   const existingAlarm=await this.ctx.storage.getAlarm();
   await this.ctx.storage.setAlarm(existingAlarm&&existingAlarm>Date.now()?Math.min(existingAlarm,invite.expiresAt):invite.expiresAt);
   const deliveries=await this.push(targetId,{type:'request',requestId:id,from:actorName,expiresAt:invite.expiresAt});
   return json({ok:true,invite,deliveredDevices:deliveries});
  }
  if(req.method==='GET'&&path==='/status'){
   const id=url.searchParams.get('requestId');
   const invite=await this.get('invite:'+id);
   if(!invite||(invite.senderId!==actor&&invite.targetId!==actor))return error('NOT_FOUND',404);
   if(invite.status==='pending'&&invite.expiresAt<=Date.now())await this.settle(id,'expired');
   return json({ok:true,invite:await this.get('invite:'+id)});
  }
  if(req.method==='POST'&&path==='/cancel'){
   const x=await body(req),invite=await this.get('invite:'+x?.requestId);
   if(!invite||invite.senderId!==actor)return error('NOT_FOUND',404);
   if(invite.status==='pending')await this.settle(invite.requestId,'cancelled');
   return json({ok:true,invite:await this.get('invite:'+invite.requestId)});
  }
  if(req.method==='POST'&&path==='/accept'){
   const x=await body(req),invite=await this.get('invite:'+x?.requestId);
   if(!invite||invite.targetId!==actor)return error('NOT_FOUND',404);
   if(invite.status!=='pending'||invite.expiresAt<=Date.now()){if(invite.status==='pending')await this.settle(invite.requestId,'expired');return error('REQUEST_EXPIRED',409);}
   invite.status='accepted';invite.acceptedAt=Date.now();
   await this.put('invite:'+invite.requestId,invite);
   await this.push(invite.targetId,{type:'cancel',requestId:invite.requestId,reason:'accepted'});
   return json({ok:true,invite});
  }
  if(req.method==='POST'&&path==='/room'){
   const x=await body(req),invite=await this.get('invite:'+x?.requestId);
   if(!invite||invite.senderId!==actor)return error('NOT_FOUND',404);
   if(invite.status!=='accepted'||!Number.isFinite(invite.acceptedAt)||Date.now()-invite.acceptedAt>30000)return error('NOT_ACCEPTED',409);
   if(!/^[A-Z2-9]{14}$/.test(x?.roomCode||''))return error('BAD_ROOM_CODE');
   invite.status='room-ready';invite.roomCode=x.roomCode;await this.put('invite:'+invite.requestId,invite);
   return json({ok:true,invite});
  }
  return error('NOT_FOUND',404);
 }
}
export default {
 async fetch(req,env){
  const origin=req.headers.get('origin')||'';
  if(!okOrigin(origin))return error('ORIGIN_NOT_ALLOWED',403);
  const cors=headers(origin),url=new URL(req.url);
  if(req.method==='OPTIONS'){
   const method=req.headers.get('access-control-request-method'),h=(req.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
   return new Response(null,{status:method==='GET'||method==='POST'&&h.every(x=>['authorization','content-type'].includes(x))?204:403,headers:cors});
  }
  const allowedPaths=new Set(['/api/invites/public-key','/api/invites/state','/api/invites/preference','/api/invites/subscribe','/api/invites/unsubscribe','/api/invites/request','/api/invites/eligibility','/api/invites/status','/api/invites/cancel','/api/invites/accept','/api/invites/room']);
  if(!allowedPaths.has(url.pathname))return json({ok:false,error:'NOT_FOUND'},404,cors);
  const store=env.INVITES.get(env.INVITES.idFromName('development-only-invite-state'));
  const suffix=url.pathname.replace('/api/invites','');
  const authRequired=suffix!=='/public-key';
  const actor=authRequired?await authenticate(req,env,origin):null;
  if(authRequired&&!actor)return json({ok:false,error:'AUTH_REQUIRED'},401,cors);
  let payload;
  if(req.method==='POST'){
   payload=await body(req);
   if(!payload)return json({ok:false,error:'BAD_BODY'},400,cors);
   if(suffix==='/request'||suffix==='/eligibility'){
    if(!(await isFriend(env,actor.authorization,origin,payload.targetId)))return json({ok:false,error:'NOT_FRIEND'},403,cors);
    payload.friendVerified=true;
   }
  }
  const forwarded=new Request('https://invite.internal'+suffix+url.search,{method:req.method,
    headers:{'x-actor-id':actor?.user.id||'','x-actor-name':actor?.user.nickname||'',...(payload?{'content-type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})});
  const response=await store.fetch(forwarded);
  const h=new Headers(response.headers);Object.entries(cors).forEach(([k,v])=>h.set(k,v));
  return new Response(response.body,{status:response.status,headers:h});
 }
};
