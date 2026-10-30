import test from 'node:test';
import assert from 'node:assert/strict';
import authority,{OfflineInviteStore} from '../offline-invites/worker.mjs';
const origin='https://gostop-dev.vercel.app';
const url='https://push.dev';
const bearer='Bearer sender-session-long123';
const sample=(account,target='acct-receiver-123')=>({
 id:account,nickname:account.startsWith('acct-sender')?'Sender':'Receiver',
 friendState:'friend',target
});
function fixture(){
 const data=new Map();let alarm=null;let current='acct-sender-123',isFriend=true;
 const store={
  get:async k=>structuredClone(data.get(k)),
  put:async(k,v)=>{data.set(k,structuredClone(v))},
  setAlarm:async at=>{alarm=at},
  getAlarm:async()=>alarm
 };
 const db=new OfflineInviteStore({storage:store},{});
 const env={
  DEV_AUTH:{fetch:async req=>{
   const path=new URL(req.url).pathname;
   if(path==='/api/me')return new Response(JSON.stringify({ok:true,account:sample(current)}),{status:200});
   if(path==='/api/social')return new Response(JSON.stringify({ok:true,friends:isFriend?[{accountId:'acct-receiver-123',friendState:'friend'}]:[]}),{status:200});
   return new Response('{}',{status:404});
  }},
  INVITES:{idFromName:x=>x,get:()=>({fetch:req=>db.fetch(req)})}
 };
 const req=(path,{method='GET',body,auth=bearer,from=origin}={})=>{
  const hdr={Origin:from,...(auth?{Authorization:auth}:{}),...(body?{'content-type':'application/json'}:{})};
  return authority.fetch(new Request(url+path,{method,headers:hdr,...(body?{body:JSON.stringify(body)}:{})}),env);
 };
 return {data,db,req,alarm:()=>alarm,switchUser:id=>{current=id},setFriend:value=>{isFriend=value}};
}
test('push invitations are isolated from public site and require login',async()=>{
 const s=fixture();
 assert.equal((await s.req('/api/invites/state',{from:'https://gostoplive.com'})).status,403);
 assert.equal((await s.req('/api/invites/state',{auth:null})).status,401);
 const publicKey=await s.req('/api/invites/public-key');
 assert.equal(publicKey.status,200);
 const data=await publicKey.json();
 assert.ok(data.publicKey.length>70);
});
test('default-on preference and explicit opt-out prevent offline requests',async()=>{
 const s=fixture();
 s.switchUser('acct-receiver-123');
 let r=await(await s.req('/api/invites/state')).json();
 assert.equal(r.enabled,true);
 r=await(await s.req('/api/invites/preference',{method:'POST',body:{enabled:false}})).json();
 assert.equal(r.enabled,false);
 s.switchUser('acct-sender-123');
 r=await s.req('/api/invites/request',{method:'POST',body:{targetId:'acct-receiver-123'}});
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,'OFFLINE_REQUESTS_DISABLED');
});
test('only actual friends can invite and sender can cancel',async()=>{
 const s=fixture();s.setFriend(false);
 assert.equal((await s.req('/api/invites/request',{method:'POST',body:{targetId:'acct-receiver-123'}})).status,403);
 s.setFriend(true);
 const sent=await s.req('/api/invites/request',{method:'POST',body:{targetId:'acct-receiver-123'}});
 assert.equal(sent.status,200,await sent.clone().text());
 const invite=(await sent.json()).invite;
 assert.equal(invite.status,'pending');
 assert.equal(invite.expiresAt-invite.createdAt,30000);
 assert.ok(s.alarm()<=invite.expiresAt);
 s.switchUser('acct-receiver-123');
 assert.equal((await s.req('/api/invites/cancel',{method:'POST',body:{requestId:invite.requestId}})).status,404);
 s.switchUser('acct-sender-123');
 assert.equal((await s.req('/api/invites/cancel',{method:'POST',body:{requestId:invite.requestId}})).status,200);
 assert.equal((await(await s.req('/api/invites/status?requestId='+invite.requestId)).json()).invite.status,'cancelled');
});
test('accepted invite launches via a server-validated room code, never before acceptance',async()=>{
 const s=fixture();
 const invitation=(await(await s.req('/api/invites/request',{method:'POST',body:{targetId:'acct-receiver-123'}})).json()).invite;
 const id=invitation.requestId;
 assert.equal((await s.req('/api/invites/room',{method:'POST',body:{requestId:id,roomCode:'ABCDEFGHIJKLMN'}})).status,409);
 s.switchUser('acct-receiver-123');
 const accepted=await s.req('/api/invites/accept',{method:'POST',body:{requestId:id}});
 assert.equal(accepted.status,200);
 s.switchUser('acct-sender-123');
 const room=await s.req('/api/invites/room',{method:'POST',body:{requestId:id,roomCode:'ABCDEFGHJKLMNP'}});
 assert.equal(room.status,200,await room.clone().text());
 s.switchUser('acct-receiver-123');
 const ready=await(await s.req('/api/invites/status?requestId='+id)).json();
 assert.equal(ready.invite.roomCode,'ABCDEFGHJKLMNP');
 assert.equal(ready.invite.status,'room-ready');
});
test('expired invites cannot be accepted and are expired by alarm',async()=>{
 const s=fixture();
 const invitation=(await(await s.req('/api/invites/request',{method:'POST',body:{targetId:'acct-receiver-123'}})).json()).invite;
 const entry=s.data.get('invite:'+invitation.requestId);
 entry.expiresAt=Date.now()-1000;
 s.data.set('invite:'+invitation.requestId,entry);
 await s.db.alarm();
 s.switchUser('acct-receiver-123');
 assert.equal((await s.req('/api/invites/accept',{method:'POST',body:{requestId:invitation.requestId}})).status,409);
 assert.equal((await(await s.req('/api/invites/status?requestId='+invitation.requestId)).json()).invite.status,'expired');
});
test('enabled preference preflight supports browser subscription and rejects production origin',async()=>{
 const s=fixture();
 const pre=await authority.fetch(new Request(url+'/api/invites/preference',{method:'OPTIONS',headers:{
  Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'
 }}),{});
 assert.equal(pre.status,204);
 assert.equal(pre.headers.get('access-control-allow-origin'),origin);
 const denied=await authority.fetch(new Request(url+'/api/invites/preference',{method:'OPTIONS',headers:{Origin:'https://gostoplive.com'}}),{});
 assert.equal(denied.status,403);
});
