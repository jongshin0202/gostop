import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {FinalRankedRoomCore} from '../server/ranked-room-final.mjs';

class MemoryStorage{
  constructor(){this.values=new Map();this.alarm=null;}
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){this.values.set(key,structuredClone(value));}
  async setAlarm(value){this.alarm=value;}
  async deleteAlarm(){this.alarm=null;}
}
class Socket{constructor(){this.messages=[];}send(value){this.messages.push(JSON.parse(value));}close(){}last(type){return this.messages.findLast(message=>message.type===type);}}
class AccountStub{
  constructor(){this.calls=[];}
  async fetch(request){const body=request.method==='POST'?await request.json().catch(()=>({})):{};this.calls.push({path:new URL(request.url).pathname,body});return new Response(JSON.stringify({ok:true,session:{id:body.sessionId},game:{participants:[]}}),{status:200,headers:{'content-type':'application/json'}});}
}
const now=()=> '2026-09-15T04:45:00.000Z';
const flow=(id,revision,action)=>JSON.stringify({type:'action',protocolVersion:1,actionId:id,expectedRevision:revision,action});
const account=(id,nickname,walletCoins=200)=>({id,nickname,walletCoins});

async function onlineRoom(){const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now});const a=await core.create('ABCDEFGHJK2345',account('a','Alpha')),b=await core.join(null,account('b','Beta'));const sa=new Socket(),sb=new Socket();await core.connect(a.credential,sa);await core.connect(b.credential,sb);return {core,a,b,sa,sb,accountStore};}

async function soloRoom(){const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now});await core.createSolo('ABCDEFGHJK2346');const user=await core.join(null,account('solo-user','SoloPlayer'));const socket=new Socket();await core.connect(user.credential,socket);return {core,user,socket,accountStore};}

test('online ranked pause is immediate, visible to both players, and decrements only requester budget',async()=>{
  const {core,a,sa,sb}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;
  const result=await core.handle(sa,flow('pause-1',revision,{type:'requestPause'}));assert.equal(result.type,'actionAccepted');assert.equal(core.room.rankFlow.pauseRemaining[a.playerId],1);
  const mine=sa.last('snapshot').snapshot.sessionFlow,theirs=sb.last('snapshot').snapshot.sessionFlow;assert.equal(mine.pause.requestedByYou,true);assert.equal(theirs.pause.requestedByYou,false);assert.equal(mine.pausesRemaining.you,1);assert.equal(theirs.pausesRemaining.opponent,1);assert.ok(core.storage.alarm);
});

test('pause allowance resets to two for each human when game sequence changes',async()=>{
  const {core,a,b}=await onlineRoom();core.room.rankFlow.pauseRemaining[a.playerId]=0;core.room.rankFlow.pauseRemaining[b.playerId]=1;core.room.gameSequence++;core.resetPauseBudgetForCurrentGame();assert.equal(core.room.rankFlow.pauseRemaining[a.playerId],2);assert.equal(core.room.rankFlow.pauseRemaining[b.playerId],2);
});

test('online quit asks opponent; acceptance ends session without abandonment',async()=>{
  const {core,sa,sb}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;
  await core.handle(sa,flow('quit-request',revision,{type:'quitGame'}));const request=sb.last('snapshot').snapshot.sessionFlow.quitRequest;assert.ok(request);assert.equal(request.requestedByYou,false);assert.equal(core.room.sessionFlow.ended,false);
  const accepted=await core.handle(sb,flow('quit-accept',revision,{type:'respondQuit',requestId:request.requestId,accept:true}));assert.equal(accepted.type,'actionAccepted');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.rankFlow.abandonment,null);
});

test('online quit decline schedules requester exit after current game',async()=>{
  const {core,a,sa,sb}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;await core.handle(sa,flow('quit-request-2',revision,{type:'quitGame'}));const request=sb.last('snapshot').snapshot.sessionFlow.quitRequest;await core.handle(sb,flow('quit-decline',revision,{type:'respondQuit',requestId:request.requestId,accept:false}));assert.equal(core.room.sessionFlow.ended,false);assert.equal(core.room.rankFlow.scheduledQuitBy,a.playerId);assert.equal(sa.last('snapshot').snapshot.sessionFlow.scheduledQuitByYou,true);
});

test('ranked Solo disconnect freezes the five-point settlement and stops the computer during grace',async()=>{
  const {core,user,socket}=await soloRoom(),bot=core.room.participants.find(item=>item.bot),record=core.authority.exportMatch(core.room.matchId),botSide=bot.seatId==='playerA'?'human':'ai';
  assert.equal(globalThis.GoStopEngine.scorePlayer(record.state[botSide]).total,0);record.state[botSide].firstPpeokPoints=5;record.state[botSide].go=0;record.state[botSide].shakes=0;record.state[botSide].shakeMultiplier=1;record.state.matchContext.nagariCarryPower=0;
  core.authority=core.authorityFactory({crypto:webcrypto,now,trustedRuntime:true});core.authority.restoreMatch(record);await core.persist();assert.equal(core.calculateDisconnectSettlement(user.playerId).fairPoints,5);
  await core.disconnect(socket);assert.equal(core.room.rankFlow.disconnectSettlements[user.playerId].fairPoints,5);const before=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}).revision;
  const changed=core.authority.exportMatch(core.room.matchId);changed.state[botSide].firstPpeokPoints=20;core.authority=core.authorityFactory({crypto:webcrypto,now,trustedRuntime:true});core.authority.restoreMatch(changed);assert.equal(core.calculateDisconnectSettlement(user.playerId).fairPoints,5);
  const frozenRevision=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}).revision;await core.advanceBot();assert.equal(core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}).revision,frozenRevision);assert.equal(before,frozenRevision);
});

test('ranked Solo browser return during reconnect grace restores the same seat and game with no coin settlement',async()=>{
  const {core,user,socket,accountStore}=await soloRoom();
  const oldMatch=core.room.matchId,oldSequence=core.room.gameSequence,oldWallet=core.room.participants.find(item=>item.playerId===user.playerId).walletCoins;
  const settlementsBefore=accountStore.calls.filter(call=>call.path==='/internal/game/settle'||call.path==='/internal/force-quit').length;
  await core.disconnect(socket);
  assert.ok(core.room.rankFlow.disconnectDeadlines[user.playerId]>Date.parse(now()));
  const restored=await core.join(user.credential,account('solo-user','SoloPlayer',oldWallet));
  assert.equal(restored.playerId,user.playerId);assert.equal(restored.seatId,user.seatId);assert.equal(restored.credential,user.credential);
  assert.equal(core.room.matchId,oldMatch);assert.equal(core.room.gameSequence,oldSequence);
  const reconnect=new Socket();await core.connect(restored.credential,reconnect);
  assert.equal(core.room.rankFlow.disconnectDeadlines[user.playerId],undefined);
  assert.equal(reconnect.last('snapshot').snapshot.matchId,oldMatch);
  assert.equal(core.room.participants.find(item=>item.playerId===user.playerId).walletCoins,oldWallet);
  const settlementsAfter=accountStore.calls.filter(call=>call.path==='/internal/game/settle'||call.path==='/internal/force-quit').length;
  assert.equal(settlementsAfter,settlementsBefore);
});

test('ranked Solo Play Again immediately creates the next hand without waiting for the computer seat',async()=>{
  const {core,user,socket}=await soloRoom(),oldSession=core.room.sessionId,oldSequence=core.room.gameSequence;
  const record=core.authority.exportMatch(core.room.matchId),seatId=record.seatByPlayer[user.playerId];record.state.terminalResult={type:'stop',winnerId:seatId,finalPoints:7};record.state.winner=seatId;record.completedAt=now();
  core.authority=core.authorityFactory({crypto:webcrypto,now,trustedRuntime:true});core.authority.restoreMatch(record);core.room.terminalResult=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}).terminalResult;core.room.status='completed';await core.persist();
  const before=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}),result=await core.handle(socket,flow('solo-replay',before.revision,{type:'playAgainReady'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.sessionId,oldSession);assert.equal(core.room.gameSequence,oldSequence+1);assert.equal(core.room.sessionFlow.replayReady.playerA,false);assert.equal(core.room.sessionFlow.replayReady.playerB,false);assert.equal(core.room.terminalResult,null);assert.equal(socket.last('snapshot').snapshot.terminalResult,null);assert.equal(socket.last('snapshot').snapshot.sessionFlow.replayReady.you,false);
});

test('ranked Solo is server-owned, starts Computer #1 at 100 Coins, New Game starts a new session, and Quit ends immediately',async()=>{
  const {core,user,socket,accountStore}=await soloRoom(),bot=core.room.participants.find(item=>item.bot);assert.equal(core.isRanked(),true);assert.equal(bot.nickname,'Computer #1');assert.equal(core.room.solo.computerBankroll,100);assert.ok(bot.walletCoins>0);assert.equal(socket.last('snapshot').snapshot.sessionFlow.rankedMode,'solo');
  const oldMatch=core.room.matchId,oldSession=core.room.sessionId,revision=socket.last('snapshot').snapshot.revision;const newGame=await core.handle(socket,flow('solo-new',revision,{type:'requestNewGame'}));assert.equal(newGame.type,'actionAccepted');assert.notEqual(core.room.matchId,oldMatch);assert.notEqual(core.room.sessionId,oldSession);assert.equal(core.room.sessionFlow.ended,false);assert.ok(accountStore.calls.some(call=>call.path==='/internal/session/end'));
  const latest=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}).revision;const quit=await core.handle(socket,flow('solo-quit',latest,{type:'quitGame'}));assert.equal(quit.type,'actionAccepted');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.rankFlow.abandonment,null);
});


test('connected opponent can cancel during reconnect grace without force-quit settlement',async()=>{
  const {core,a,sa,sb,accountStore}=await onlineRoom();
  await core.disconnect(sa);
  const snapshot=sb.last('snapshot').snapshot;
  assert.ok(snapshot.sessionFlow.opponentReconnectUntil);
  assert.equal(core.room.sessionFlow.ended,false);
  const beforeForceQuits=accountStore.calls.filter(call=>call.path==='/internal/force-quit').length;
  const result=await core.handle(sb,flow('cancel-disconnected',snapshot.revision,{type:'cancelDisconnectedGame'}));
  assert.equal(result.type,'actionAccepted');
  assert.equal(core.room.sessionFlow.ended,true);
  assert.equal(core.room.rankFlow.disconnectCancelled,true);
  assert.equal(core.room.rankFlow.abandonment,null);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,beforeForceQuits);
});

