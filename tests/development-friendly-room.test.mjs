import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DevelopmentFriendlyRoomCore} from '../server/development-friendly-room-core.mjs';
import {readFile} from 'node:fs/promises';
class Storage {
 constructor(){this.values=new Map();this.alarm=null;}
 async get(k){return structuredClone(this.values.get(k));}
 async put(k,v){this.values.set(k,structuredClone(v));}
 async setAlarm(at){this.alarm=at;}
 async deleteAlarm(){this.alarm=null;}
}
class Socket{
 constructor(){this.messages=[];this.closed=false;}
 send(data){this.messages.push(JSON.parse(data));}
 close(){this.closed=true;}
 last(type){return this.messages.findLast(m=>m.type===type);}
}
const clock=()=>new Date().toISOString();
const action=(socket,type)=>JSON.stringify({type:'action',protocolVersion:1,
 actionId:'action-'+type+'-'+Math.random(),expectedRevision:socket.last('snapshot').snapshot.revision,
 action:{type}});
test('Friendly opponent background WebSocket close preserves match, cards, and reconnect credential',async()=>{
 const core=new DevelopmentFriendlyRoomCore({storage:new Storage(),cryptoApi:webcrypto,now:clock});
 const host=await core.create('FRND2345ABCDEF',{id:'host-1',nickname:'SonGoku',walletCoins:400});
 const guest=await core.join(null,null),pc=new Socket(),phone=new Socket();
 await core.connect(host.credential,pc);
 await core.connect(guest.credential,phone);
 assert.equal(core.isRanked(),false);
 assert.equal(core.room.sessionFlow.ended,false);
 const matchId=core.room.matchId;
 const revision=pc.last('snapshot').snapshot.revision;
 const result=await core.disconnect(phone);
 assert.equal(result,true);
 assert.equal(core.room.sessionFlow.ended,false);
 assert.equal(core.room.sessionFlow.forceEnded,false);
 assert.equal(core.room.matchId,matchId);
 assert.equal(pc.last('opponentDisconnected').type,'opponentDisconnected');
 assert.equal(pc.last('snapshot').snapshot.sessionFlow.ended,false);
 const resumed=await core.join(guest.credential,null);
 assert.equal(resumed.playerId,guest.playerId);
 assert.equal(resumed.credential,guest.credential);
 const returnedPhone=new Socket();
 await core.connect(resumed.credential,returnedPhone);
 assert.equal(core.room.sessionFlow.ended,false);
 assert.equal(core.room.matchId,matchId);
 assert.equal(returnedPhone.last('snapshot').snapshot.matchId,matchId);
 assert.equal(returnedPhone.last('snapshot').snapshot.revision,revision);
 assert.equal(pc.last('opponentConnected').type,'opponentConnected');
});
test('Friendly Quit Game still explicitly ends the same room',async()=>{
 const core=new DevelopmentFriendlyRoomCore({storage:new Storage(),cryptoApi:webcrypto,now:clock});
 const host=await core.create('FRND2345ABCDEG',null);
 const guest=await core.join(null,null),pc=new Socket(),phone=new Socket();
 await core.connect(host.credential,pc);await core.connect(guest.credential,phone);
 const result=await core.handle(pc,action(pc,'quitGame'));
 assert.equal(result.type,'actionAccepted');
 assert.equal(core.room.sessionFlow.ended,true);
 assert.equal(core.room.sessionFlow.forceEnded,false);
});
test('Ranked disconnection retains existing protected reconnect/deadline behavior',async()=>{
 const accountStore={fetch:async()=>new Response(JSON.stringify({ok:true,session:{}}),
 {status:200,headers:{'content-type':'application/json'}})};
 const core=new DevelopmentFriendlyRoomCore({storage:new Storage(),accountStore,cryptoApi:webcrypto,now:clock});
 const a=await core.create('RANK2345ABCDEF',{id:'rank-a',nickname:'A',walletCoins:300});
 const b=await core.join(null,{id:'rank-b',nickname:'B',walletCoins:300});
 const sa=new Socket(),sb=new Socket();await core.connect(a.credential,sa);await core.connect(b.credential,sb);
 assert.equal(core.isRanked(),true);
 await core.disconnect(sb);
 assert.equal(core.room.sessionFlow.ended,false);
 assert.ok(core.room.rankFlow.disconnectDeadlines[b.playerId]>Date.now());
});
test('Cloudflare dev binds a separate GameRoom and production source is unchanged',async()=>{
 const dev=await readFile(new URL('../server/development-worker.mjs',import.meta.url),'utf8');
 const prod=await readFile(new URL('../server/worker.mjs',import.meta.url),'utf8');
 const frozen=await readFile(new URL('../server/ranked-room-core.mjs',import.meta.url),'utf8');
 assert.match(dev,/development-game-room/);
 assert.match(prod,/game-room\.mjs/);
 assert.match(frozen,/this\.room\.sessionFlow\.forceEnded=true/);
});
