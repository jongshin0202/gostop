const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

class MemoryStorage{constructor(seed){this.values=new Map(seed?Object.entries(seed):[]);}async get(key){return structuredClone(this.values.get(key));}async put(key,value){this.values.set(key,structuredClone(value));}}
class Socket{constructor(){this.messages=[];this.closed=false;}send(value){this.messages.push(JSON.parse(value));}close(){this.closed=true;}last(type){return this.messages.findLast(message=>message.type===type);}}

let RoomCore,parseClientMessage;
test.before(async()=>{({RoomCore}=await import('../server/room-core.mjs'));({parseClientMessage}=await import('../server/protocol.mjs'));});
const makeRoom=()=>new RoomCore({storage:new MemoryStorage(),cryptoApi:webcrypto,now:()=> '2026-09-12T00:00:00.000Z'});
async function readyRoom(){const core=makeRoom(),a=await core.create('ABCDEFGHJK2345'),b=await core.join();return {core,a,b};}

test('rooms create unique opaque identities, assign seats, join once, and reject a third player',async()=>{
  const one=makeRoom(),two=makeRoom(),a=await one.create('ABCDEFGHJK2345'),other=await two.create('ABCDEFGHJK2346');
  assert.equal(a.seatId,'playerA');assert.notEqual(a.credential,other.credential);assert.match(a.credential,/^room_[a-f0-9]{64}$/);
  await assert.rejects(one.join(a.credential),error=>error.code==='ALREADY_JOINED');
  const b=await one.join();assert.equal(b.seatId,'playerB');await assert.rejects(one.join(),error=>error.code==='ROOM_FULL');
  await assert.rejects(makeRoom().join(),error=>error.code==='ROOM_NOT_FOUND');
});

test('credentials authenticate only their assigned seat and reconnect replaces the old socket',async()=>{
  const {core,a,b}=await readyRoom();assert.equal((await core.authenticate(a.credential)).playerId,a.playerId);assert.equal(await core.authenticate('room_'+'0'.repeat(64)),null);
  assert.notEqual((await core.authenticate(a.credential)).playerId,(await core.authenticate(b.credential)).playerId);
  const oldSocket=new Socket(),replacement=new Socket();await core.connect(a.credential,oldSocket);await core.connect(a.credential,replacement);assert.equal(oldSocket.closed,true);assert.equal(replacement.__playerId,a.playerId);
  await assert.rejects(core.connect('invalid',new Socket()),error=>error.code==='INVALID_CREDENTIAL');
});

test('protocol validates versions and malformed action messages',()=>{
  assert.throws(()=>parseClientMessage('{'),error=>error.code==='MALFORMED_MESSAGE');
  assert.throws(()=>parseClientMessage({type:'ping',protocolVersion:2}),error=>error.code==='UNSUPPORTED_PROTOCOL');
  assert.throws(()=>parseClientMessage({type:'action',protocolVersion:1}),error=>error.code==='MALFORMED_ACTION');
  assert.deepEqual(parseClientMessage({type:'ping',protocolVersion:1,nonce:'x'}).nonce,'x');
});

test('initial snapshots are viewer-safe and network action routing preserves authority semantics',async()=>{
  const {core,a,b}=await readyRoom(),sa=new Socket(),sb=new Socket();await core.connect(a.credential,sa);await core.connect(b.credential,sb);
  const snapA=sa.last('snapshot').snapshot,snapB=sb.last('snapshot').snapshot;
  assert.equal(snapA.state.deck,undefined);assert.equal(snapB.state.deck,undefined);assert.equal(snapA.state.ai.hand,undefined);assert.equal(snapB.state.human.hand,undefined);
  assert.equal(JSON.stringify(sa.messages).includes('credentialHash'),false);assert.equal(JSON.stringify(sa.messages).includes('authority'),false);assert.equal(JSON.stringify(sa.messages).includes('readTrustedState'),false);
  assert.deepEqual(snapA.state.floor,snapB.state.floor);assert.equal(snapA.state.deckCount,snapB.state.deckCount);
  const starter=snapA.state.turn==='playerA'?a:b,socket=starter===a?sa:sb,snapshot=starter===a?snapA:snapB;
  const wrongSocket=starter===a?sb:sa,wrongView=starter===a?snapB:snapA,wrongHand=wrongView.seatId==='playerA'?wrongView.state.human.hand:wrongView.state.ai.hand,wrong=await core.handle(wrongSocket,JSON.stringify({type:'action',protocolVersion:1,actionId:'wrong-turn',expectedRevision:0,action:{type:'attemptPlayCard',cardId:wrongHand[0].id}}));assert.equal(wrong.error.code,'OUT_OF_TURN');
  const action={type:'resolveOpening'},message={type:'action',protocolVersion:1,actionId:'first',expectedRevision:snapshot.revision,action};
  const accepted=await core.handle(socket,JSON.stringify(message));assert.equal(accepted.type,'actionAccepted');assert.equal(accepted.revision,1);
  const duplicate=await core.handle(socket,JSON.stringify(message));assert.equal(duplicate.type,'actionAccepted');assert.equal(duplicate.duplicate,true);assert.equal(duplicate.revision,1);
  const stale=await core.handle(socket,JSON.stringify({...message,actionId:'stale'}));assert.equal(stale.type,'actionRejected');assert.equal(stale.error.code,'STALE_REVISION');
  const malformed=await core.handle(socket,'not json');assert.equal(malformed.error.code,'MALFORMED_MESSAGE');
  const illegal=await core.handle(socket,JSON.stringify({type:'action',protocolVersion:1,actionId:'illegal',expectedRevision:1,action:{type:'playCard',cardId:'missing'}}));assert.equal(illegal.error.code,'ILLEGAL_ACTION');
});

test('sync and persistence restore revision, idempotency, viewer safety, and terminal result fields',async()=>{
  const {core,a,b}=await readyRoom(),sa=new Socket();await core.connect(a.credential,sa);const initial=sa.last('snapshot').snapshot;
  const restored=new RoomCore({storage:core.storage,cryptoApi:webcrypto,now:()=> '2026-09-12T00:00:00.000Z'});await restored.load();assert.equal(restored.room.matchId,core.room.matchId);assert.equal(restored.authority.getSnapshot({matchId:core.room.matchId,viewerId:a.playerId}).revision,initial.revision);
  assert.equal(Object.hasOwn(restored.room,'terminalResult'),true);assert.equal(restored.room.terminalResult,null);
  const reconnect=new Socket();await restored.connect(a.credential,reconnect);assert.equal(reconnect.last('snapshot').snapshot.revision,initial.revision);assert.equal(reconnect.last('snapshot').snapshot.state.ai.hand,undefined);
  const sync=await restored.handle(reconnect,JSON.stringify({type:'syncRequest',protocolVersion:1,sinceRevision:0}));assert.equal(sync.type,'snapshot');assert.ok(Array.isArray(sync.events));
  assert.equal((await restored.authenticate(b.credential)).seatId,'playerB');
});

test('a completed authoritative terminal result survives room restoration',async()=>{
  const {core,a}=await readyRoom(),stored=await core.storage.get('room');
  stored.authority.state.terminalResult={winnerId:'playerA',reason:'stop',points:7};stored.authority.completedAt='2026-09-12T00:01:00.000Z';stored.terminalResult={winnerId:a.playerId,points:7};stored.status='completed';await core.storage.put('room',stored);
  const restored=new RoomCore({storage:core.storage,cryptoApi:webcrypto});await restored.load();const snapshot=restored.authority.getSnapshot({matchId:restored.room.matchId,viewerId:a.playerId});
  assert.equal(restored.room.status,'completed');assert.equal(restored.room.terminalResult.winnerId,a.playerId);assert.equal(snapshot.terminalResult.winnerId,a.playerId);assert.equal(snapshot.terminalResult.result.points,7);
});

test('private pending decisions and events never cross the network boundary',async()=>{
  const {core,a,b}=await readyRoom(),sa=new Socket(),sb=new Socket();await core.connect(a.credential,sa);await core.connect(b.credential,sb);
  const viewA=sa.last('snapshot').snapshot,viewB=sb.last('snapshot').snapshot;
  for(const view of [viewA,viewB]){const opponent=view.seatId==='playerA'?view.state.ai:view.state.human;assert.equal(opponent.hiddenTripleMonths.length,0);}
  const exported=core.authority.exportMatch(core.room.matchId),privateEvent={type:'secret',audience:'player-private',playerId:'playerA',cardIds:['m1-1']};exported.events.push({...privateEvent,revision:1,eventIndex:0});exported.revision=1;
  const isolated=new RoomCore({storage:new MemoryStorage(),cryptoApi:webcrypto});isolated.room=structuredClone(core.room);isolated.room.authority=exported;await isolated.storage.put('room',isolated.room);isolated.room=null;await isolated.load();
  const eventsA=isolated.authority.getEventsSince({matchId:core.room.matchId,viewerId:a.playerId,revision:0}).events,eventsB=isolated.authority.getEventsSince({matchId:core.room.matchId,viewerId:b.playerId,revision:0}).events;
  assert.equal(eventsA.some(event=>event.type==='secret'),true);assert.equal(eventsB.some(event=>event.type==='secret'),false);
});

test('online browser mode has a fail-closed authority boundary and no AI turn path',()=>{
  const source=readFileSync(join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/if\(onlineMode\)throw new Error\('Online authoritative actions must use the WebSocket authority\.'\);/);
  assert.match(source,/async function aiTurn\(\)\{\s*if\(onlineMode\)return;/);
  assert.match(source,/function scheduleTurnStart\(\)\{[\s\S]*?if\(onlineMode\)return;/);
  for(const type of ['attemptPlayCard','useBombBlank','declareShake','keepShakeSecret','declareBomb','declineBomb','declareGo','declareStop','setGukjinMode','newHand'])assert.match(source,new RegExp(`onlineSubmit\\(\\{type:'${type}'`));
  assert.match(source,/presentSemanticEvents\(events\)/);assert.match(source,/state=\{\.\.\.projected/);assert.match(source,/authoritative server\. Reconnect before playing/);
});
