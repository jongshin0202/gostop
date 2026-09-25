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

async function onlineRoom(options={}){const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now,...options});const a=await core.create('ABCDEFGHJK2345',account('a','Alpha')),b=await core.join(null,account('b','Beta'));const sa=new Socket(),sb=new Socket();await core.connect(a.credential,sa);await core.connect(b.credential,sb);return {core,a,b,sa,sb,accountStore};}

async function soloRoom(){const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now});await core.createSolo('ABCDEFGHJK2346');const user=await core.join(null,account('solo-user','SoloPlayer'));const socket=new Socket();await core.connect(user.credential,socket);return {core,user,socket,accountStore};}

test('online inactivity timing is three-minute nudge, one-minute nudge phase, then 30-second abandonment countdown',async()=>{
  const standard=await onlineRoom(),start=Date.parse(now()),timing=standard.core.room.rankFlow.inactivity;
  assert.equal(timing.nudgeAt-start,180000);
  assert.equal(timing.warningAt-start,240000);
  assert.equal(timing.abandonAt-start,270000);
  const configured=await onlineRoom({inactivityNudgeMs:240000,nudgePhaseMs:90000,abandonmentCountdownMs:45000}),custom=configured.core.room.rankFlow.inactivity;
  assert.equal(custom.nudgeAt-start,240000);
  assert.equal(custom.warningAt-start,330000);
  assert.equal(custom.abandonAt-start,375000);
});

test('online pause defaults to three minutes and accepts a server-configured duration',async()=>{
  const standard=await onlineRoom(),start=Date.parse(now()),revision=standard.sa.last('snapshot').snapshot.revision;
  await standard.core.handle(standard.sa,flow('pause-default',revision,{type:'requestPause'}));
  assert.equal(standard.core.room.rankFlow.pause.until-start,180000);
  const configured=await onlineRoom({pauseDurationMs:240000}),customRevision=configured.sa.last('snapshot').snapshot.revision;
  await configured.core.handle(configured.sa,flow('pause-custom',customRevision,{type:'requestPause'}));
  assert.equal(configured.core.room.rankFlow.pause.until-start,240000);
});

test('pause requester can cancel immediately and resume normal inactivity timing',async()=>{
  const {core,a,sa}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision,start=Date.parse(now());
  await core.handle(sa,flow('pause-cancel-start',revision,{type:'requestPause'}));
  const result=await core.handle(sa,flow('pause-cancel',revision,{type:'cancelPause'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.rankFlow.pause,null);
  assert.equal(core.room.rankFlow.inactivity.phase,'waiting');
  assert.equal(core.room.rankFlow.inactivity.nudgeAt-start,180000);
  assert.equal(core.room.rankFlow.pauseRemaining[a.playerId],1);
});

test('opponent quit during active pause settles the current game as a draw with zero Coins and points',async()=>{
  const {core,sa,sb,accountStore}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;
  await core.handle(sa,flow('pause-quit-start',revision,{type:'requestPause'}));
  const result=await core.handle(sb,flow('pause-quit-confirmed',revision,{type:'quitPausedGame'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.rankFlow.pause,null);assert.equal(core.room.rankFlow.abandonment,null);
  assert.equal(core.room.rankFlow.pauseResolution.type,'draw');assert.equal(core.room.rankFlow.pauseResolution.points,0);
  const settlement=accountStore.calls.findLast(call=>call.path==='/internal/game/settle');assert.ok(settlement);assert.equal(settlement.body.winnerPlayerId,null);assert.equal(settlement.body.finalPoints,0);assert.equal(settlement.body.settlementType,'pause-draw');
  assert.ok(settlement.body.participants.every(item=>item.won===false&&item.walletDelta===0&&item.coinsWon===0&&item.points===0));
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,0);
  assert.ok(accountStore.calls.some(call=>call.path==='/internal/session/end'&&call.body.summary?.reason==='pause-opponent-quit-draw'));
  assert.equal(sa.last('snapshot').snapshot.sessionFlow.pauseResolution.type,'draw');assert.equal(sb.last('snapshot').snapshot.sessionFlow.pauseResolution.type,'draw');
});

test('pause timeout becomes an indefinite expired-pause choice instead of abandonment',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant;
  const {core,sa,sb,accountStore}=await onlineRoom({now:clock}),revision=sa.last('snapshot').snapshot.revision;
  await core.handle(sa,flow('pause-timeout-start',revision,{type:'requestPause'}));
  instant='2026-09-15T04:48:00.001Z';await core.alarm();
  assert.equal(core.room.rankFlow.pause.phase,'expired');assert.equal(core.room.rankFlow.inactivity,null);assert.equal(core.room.sessionFlow.ended,false);
  assert.equal(sa.last('snapshot').snapshot.sessionFlow.pause.expired,true);assert.equal(sb.last('snapshot').snapshot.sessionFlow.pause.expired,true);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,0);assert.equal(core.storage.alarm,null);
});

test('paused player can Cancel after pause expiry and resume with fresh inactivity timing',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant;
  const {core,sa}=await onlineRoom({now:clock}),revision=sa.last('snapshot').snapshot.revision;
  await core.handle(sa,flow('pause-expire-cancel-start',revision,{type:'requestPause'}));instant='2026-09-15T04:48:00.001Z';await core.alarm();
  const latest=sa.last('snapshot').snapshot.revision,result=await core.handle(sa,flow('pause-expire-cancel',latest,{type:'cancelPause'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.rankFlow.pause,null);assert.equal(core.room.sessionFlow.ended,false);assert.equal(core.room.rankFlow.inactivity.phase,'waiting');assert.equal(core.room.rankFlow.inactivity.nudgeAt-Date.parse(instant),180000);
});

test('opponent claiming an expired pause win gets base seven plus multipliers and forced Go-bak',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant;
  const {core,a,b,sa,sb,accountStore}=await onlineRoom({now:clock}),revision=sa.last('snapshot').snapshot.revision;
  await core.handle(sa,flow('pause-claim-start',revision,{type:'requestPause'}));instant='2026-09-15T04:48:00.001Z';await core.alarm();
  const record=core.authority.exportMatch(core.room.matchId),winnerSide=record.seatByPlayer[b.playerId]==='playerA'?'human':'ai',loserSide=record.seatByPlayer[a.playerId]==='playerA'?'human':'ai';
  record.state[winnerSide].go=0;record.state[winnerSide].shakes=1;record.state[winnerSide].shakeMultiplier=2;record.state[loserSide].go=1;record.state[loserSide].lastGoScore=999;
  core.authority=core.authorityFactory({crypto:webcrypto,now:clock,trustedRuntime:true});core.authority.restoreMatch(record);await core.persist();
  const latest=sb.last('snapshot').snapshot.revision,result=await core.handle(sb,flow('pause-claim-win',latest,{type:'claimExpiredPauseWin'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.rankFlow.pauseResolution.type,'win');assert.equal(core.room.rankFlow.pauseResolution.winnerPlayerId,b.playerId);assert.equal(core.room.rankFlow.pauseResolution.points,28);
  const settlement=accountStore.calls.findLast(call=>call.path==='/internal/game/settle');assert.equal(settlement.body.finalPoints,28);assert.equal(settlement.body.winnerPlayerId,b.playerId);assert.equal(settlement.body.settlementType,'pause-expired-win');assert.ok(settlement.body.settlementReasons.includes('Shake ×2'));assert.ok(settlement.body.settlementReasons.includes('Go-bak ×2'));
  const winner=settlement.body.participants.find(item=>item.playerId===b.playerId),loser=settlement.body.participants.find(item=>item.playerId===a.playerId);assert.equal(winner.walletDelta,28);assert.equal(winner.points,28);assert.equal(winner.coinsWon,28);assert.equal(loser.walletDelta,-28);assert.equal(loser.points,0);
});

test('opponent already in Go uses current score and Go scoring when claiming expired pause win',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant;
  const {core,b,sa,sb,accountStore}=await onlineRoom({now:clock}),revision=sa.last('snapshot').snapshot.revision;
  await core.handle(sa,flow('pause-go-start',revision,{type:'requestPause'}));instant='2026-09-15T04:48:00.001Z';await core.alarm();
  const record=core.authority.exportMatch(core.room.matchId),winnerSide=record.seatByPlayer[b.playerId]==='playerA'?'human':'ai',loserSide=winnerSide==='human'?'ai':'human';
  record.state[winnerSide].firstPpeokPoints=9;record.state[winnerSide].go=1;record.state[winnerSide].lastGoScore=9;record.state[winnerSide].shakes=0;record.state[winnerSide].shakeMultiplier=1;record.state[loserSide].go=0;
  core.authority=core.authorityFactory({crypto:webcrypto,now:clock,trustedRuntime:true});core.authority.restoreMatch(record);await core.persist();
  const latest=sb.last('snapshot').snapshot.revision;await core.handle(sb,flow('pause-go-win',latest,{type:'claimExpiredPauseWin'}));
  const settlement=accountStore.calls.findLast(call=>call.path==='/internal/game/settle');assert.equal(settlement.body.finalPoints,10);assert.ok(settlement.body.formulaSteps.includes('First Ppeok +9'));assert.ok(settlement.body.formulaSteps.includes('Go bonus +1'));
});

test('orphaned ranked lock gets a short runtime recovery grace then ends without abandonment',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant;
  const {core,a,accountStore}=await onlineRoom({now:clock});
  core.sockets.clear();core.room.rankFlow.disconnectDeadlines={};core.room.rankFlow.disconnectSettlements={};
  const first=await core.reconcileActiveRanked('a',core.room.sessionId);
  assert.equal(first.active,true);assert.equal(first.connected,false);assert.ok(first.runtimeOrphanUntil);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,0);
  instant='2026-09-15T04:45:16.000Z';await core.alarm();
  assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.sessionFlow.endedBy,null);assert.equal(core.room.rankFlow.abandonment,null);
  assert.ok(accountStore.calls.some(call=>call.path==='/internal/session/end'&&call.body.summary?.reason==='runtime-orphan-timeout'));
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,0);
});

test('same authenticated seat stays live on two devices until the last device disconnects',async()=>{
  const {core,a,sa,sb}=await onlineRoom(),secondDevice=new Socket(),resumed=await core.join(null,account('a','Alpha'));
  assert.equal(resumed.playerId,a.playerId);assert.equal(resumed.seatId,a.seatId);assert.equal(resumed.resumedByAccount,true);
  await core.connect(resumed.credential,secondDevice);
  const live=core.sockets.get(a.playerId);assert.ok(live instanceof Set);assert.equal(live.size,2);
  core.broadcastSnapshots();assert.ok(sa.last('snapshot'));assert.ok(secondDevice.last('snapshot'));
  const firstDisconnect=await core.disconnect(sa);assert.equal(firstDisconnect,false);assert.equal(core.sockets.get(a.playerId).size,1);
  assert.equal(core.room.rankFlow.disconnectDeadlines[a.playerId],undefined);
  assert.equal(sb.last('snapshot').snapshot.sessionFlow.opponentReconnectUntil,null);
  const lastDisconnect=await core.disconnect(secondDevice);assert.equal(lastDisconnect,true);assert.equal(core.sockets.has(a.playerId),false);
  assert.ok(core.room.rankFlow.disconnectDeadlines[a.playerId]);
});

test('sync request after reconnect deadline resolves the session instead of leaving 0:00 stuck',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant,{core,a,b,sa,sb}=await onlineRoom({now:clock}),state=core.engineState(),activeSeat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn;
  const quitter=a.seatId===activeSeat?b:a,quitterSocket=quitter.playerId===a.playerId?sa:sb,otherSocket=quitter.playerId===a.playerId?sb:sa;
  await core.disconnect(quitterSocket);assert.ok(core.room.rankFlow.disconnectDeadlines[quitter.playerId]);
  instant='2026-09-15T04:46:01.000Z';
  await core.handle(otherSocket,JSON.stringify({type:'syncRequest',protocolVersion:1,sinceRevision:0}));
  assert.equal(core.room.sessionFlow.ended,true);assert.deepEqual(core.room.rankFlow.disconnectDeadlines,{});
  assert.equal(otherSocket.last('snapshot').snapshot.sessionFlow.ended,true);
  assert.equal(otherSocket.last('snapshot').snapshot.sessionFlow.opponentReconnectUntil,null);
});

test('live ranked socket survives account reconciliation and clears any orphan deadline',async()=>{
  const {core,a}=await onlineRoom();core.room.rankFlow.runtimeOrphanDeadlines[a.playerId]=Date.parse(now())+15000;
  const status=await core.reconcileActiveRanked('a',core.room.sessionId);
  assert.equal(status.active,true);assert.equal(status.connected,true);assert.equal(core.room.rankFlow.runtimeOrphanDeadlines[a.playerId],undefined);
});


test('disconnected Competitive seat reconciliation exposes the active reconnect deadline',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant,{core,a,sa}=await onlineRoom({now:clock});
  await core.disconnect(sa);
  const deadline=core.room.rankFlow.disconnectDeadlines[a.playerId],status=await core.reconcileActiveRanked('a',core.room.sessionId);
  assert.ok(deadline>Date.parse(instant));assert.equal(status.active,true);assert.equal(status.connected,false);assert.equal(status.reconnectUntil,deadline);
});

test('returning Competitive player can choose No and immediately apply normal disconnect abandonment rules',async()=>{
  const {core,a,b,sa,sb,accountStore}=await onlineRoom(),state=core.engineState(),activeSeat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn;
  const quitter=a.seatId===activeSeat?a:b,socket=quitter.playerId===a.playerId?sa:sb,accountId=quitter.playerId===a.playerId?'a':'b',sessionId=core.room.sessionId;
  await core.disconnect(socket);assert.ok(core.room.rankFlow.disconnectDeadlines[quitter.playerId]);
  const result=await core.declineReconnect(accountId,sessionId);
  assert.equal(result.ok,true);assert.equal(result.ended,true);assert.equal(result.reason,'reconnect-declined');assert.equal(result.normalQuit,false);
  assert.equal(result.penaltyCoins,core.room.rankFlow.abandonment.penaltyCoins);assert.equal(result.fairPoints,core.room.rankFlow.abandonment.fairPoints);assert.equal(result.settlementType,core.room.rankFlow.abandonment.settlementType);
  assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.sessionFlow.endedBy,quitter.playerId);assert.equal(core.room.status,'ended');
  assert.equal(core.room.rankFlow.abandonment.playerId,quitter.playerId);assert.equal(core.room.rankFlow.abandonment.reason,'reconnect-declined');
  const forceQuit=accountStore.calls.findLast(call=>call.path==='/internal/force-quit');assert.ok(forceQuit);assert.equal(forceQuit.body.accountId,accountId);assert.equal(forceQuit.body.reason,'reconnect-declined');
});

test('expired reconnect reconciliation settles the disconnect before returning account status',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant,{core,a,b,sa,sb}=await onlineRoom({now:clock}),state=core.engineState(),activeSeat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn;
  const quitter=a.seatId===activeSeat?a:b,socket=quitter.playerId===a.playerId?sa:sb;
  await core.disconnect(socket);instant='2026-09-15T04:46:01.000Z';
  const accountId=quitter.playerId===a.playerId?'a':'b',status=await core.reconcileActiveRanked(accountId,core.room.sessionId);
  assert.equal(status.active,false);assert.equal(status.reason,'disconnect-timeout');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.status,'ended');
});

test('Competitive player cannot choose Yes after reconnect grace has expired',async()=>{
  let instant='2026-09-15T04:45:00.000Z';const clock=()=>instant,{core,a,b,sa,sb,accountStore}=await onlineRoom({now:clock}),state=core.engineState(),activeSeat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn;
  const quitter=a.seatId===activeSeat?a:b,socket=quitter.playerId===a.playerId?sa:sb,accountId=quitter.playerId===a.playerId?'a':'b',credential=quitter.credential,stored=core.room.participants.find(item=>item.playerId===quitter.playerId),returningAccount={id:accountId,nickname:stored.nickname,walletCoins:stored.walletCoins};
  await core.disconnect(socket);instant='2026-09-15T04:46:01.000Z';
  await assert.rejects(()=>core.join(credential,returningAccount),error=>error?.code==='ROOM_NOT_FOUND');
  assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.status,'ended');
  assert.ok(accountStore.calls.some(call=>call.path==='/internal/force-quit'&&call.body.accountId===accountId));
});
test('accepted multiplayer challenge ends ranked Solo immediately with no abandonment penalty',async()=>{
  const {core,user,socket,accountStore}=await soloRoom(),forceQuitsBefore=accountStore.calls.filter(call=>call.path==='/internal/force-quit').length;
  assert.equal(core.room.sessionFlow.ended,false);
  const result=await core.leaveSoloForChallenge('solo-user');
  assert.equal(result.ok,true);
  assert.equal(core.room.sessionFlow.ended,true);
  assert.equal(core.room.sessionFlow.endedBy,user.playerId);
  assert.equal(core.room.status,'ended');
  assert.equal(core.room.rankFlow.abandonment,null);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,forceQuitsBefore);
  assert.ok(accountStore.calls.some(call=>call.path==='/internal/session/end'&&call.body.summary?.reason==='accepted-multiplayer-challenge'));
  assert.equal(socket.last('snapshot').snapshot.sessionFlow.ended,true);
});

test('online ranked pause is immediate, visible to both players, and decrements only requester budget',async()=>{
  const {core,a,sa,sb}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;
  const result=await core.handle(sa,flow('pause-1',revision,{type:'requestPause'}));assert.equal(result.type,'actionAccepted');assert.equal(core.room.rankFlow.pauseRemaining[a.playerId],1);
  const mine=sa.last('snapshot').snapshot.sessionFlow,theirs=sb.last('snapshot').snapshot.sessionFlow;assert.equal(mine.pause.requestedByYou,true);assert.equal(theirs.pause.requestedByYou,false);assert.equal(mine.pausesRemaining.you,1);assert.equal(theirs.pausesRemaining.opponent,1);assert.ok(core.storage.alarm);
});

test('pause allowance resets to two for each human when game sequence changes',async()=>{
  const {core,a,b}=await onlineRoom();core.room.rankFlow.pauseRemaining[a.playerId]=0;core.room.rankFlow.pauseRemaining[b.playerId]=1;core.room.gameSequence++;core.resetPauseBudgetForCurrentGame();assert.equal(core.room.rankFlow.pauseRemaining[a.playerId],2);assert.equal(core.room.rankFlow.pauseRemaining[b.playerId],2);
});

test('online quit asks opponent; acceptance ends session normally with no force-quit record',async()=>{
  const {core,sa,sb,accountStore}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;
  const forceQuitsBefore=accountStore.calls.filter(call=>call.path==='/internal/force-quit').length;
  await core.handle(sa,flow('quit-request',revision,{type:'quitGame'}));const request=sb.last('snapshot').snapshot.sessionFlow.quitRequest;assert.ok(request);assert.equal(request.requestedByYou,false);assert.equal(core.room.sessionFlow.ended,false);
  const accepted=await core.handle(sb,flow('quit-accept',revision,{type:'respondQuit',requestId:request.requestId,accept:true}));assert.equal(accepted.type,'actionAccepted');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.rankFlow.abandonment,null);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,forceQuitsBefore);
});

test('quit after a completed ranked game ends immediately as a normal quit with no abandonment',async()=>{
  const {core,a,sa,accountStore}=await onlineRoom(),record=core.authority.exportMatch(core.room.matchId),seatId=record.seatByPlayer[a.playerId];
  record.state.terminalResult={type:'stop',winnerId:seatId,finalPoints:7};record.state.winner=seatId;record.completedAt=now();
  core.authority=core.authorityFactory({crypto:webcrypto,now,trustedRuntime:true});core.authority.restoreMatch(record);core.room.terminalResult=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:a.playerId}).terminalResult;core.room.status='completed';await core.persist();
  const forceQuitsBefore=accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,revision=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:a.playerId}).revision;
  const result=await core.handle(sa,flow('quit-after-game',revision,{type:'quitGame'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.sessionFlow.endedBy,a.playerId);assert.equal(core.room.rankFlow.abandonment,null);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,forceQuitsBefore);
});

test('disconnect timeout before player first turn begins is a normal quit with zero force-quit settlement',async()=>{
  const {core,a,b,sa,sb,accountStore}=await onlineRoom(),state=core.engineState(),activeSeat=state.pendingDecision?.playerId||state.pendingTurn?.actorId||state.turn;
  const quitter=a.seatId===activeSeat?b:a,socket=quitter.playerId===a.playerId?sa:sb,side=quitter.seatId==='playerA'?'human':'ai';
  assert.equal(Number(state[side]?.turnsTaken)||0,0);assert.notEqual(activeSeat,quitter.seatId);assert.equal(core.isBeforeFirstTurn(quitter.playerId),true);
  const walletBefore=core.room.participants.find(item=>item.playerId===quitter.playerId).walletCoins,forceQuitsBefore=accountStore.calls.filter(call=>call.path==='/internal/force-quit').length;
  await core.disconnect(socket);assert.ok(core.room.rankFlow.disconnectDeadlines[quitter.playerId]);
  core.now=()=> '2026-09-15T04:46:01.000Z';await core.alarm();
  assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.sessionFlow.endedBy,quitter.playerId);assert.equal(core.room.rankFlow.abandonment,null);assert.equal(core.room.status,'ended');
  assert.equal(core.room.participants.find(item=>item.playerId===quitter.playerId).walletCoins,walletBefore);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit').length,forceQuitsBefore);
  assert.ok(accountStore.calls.some(call=>call.path==='/internal/session/end'&&call.body.summary?.reason==='pre-first-turn-disconnect'));
});

test('online quit decline schedules requester exit after current game',async()=>{
  const {core,a,sa,sb}=await onlineRoom(),revision=sa.last('snapshot').snapshot.revision;await core.handle(sa,flow('quit-request-2',revision,{type:'quitGame'}));const request=sb.last('snapshot').snapshot.sessionFlow.quitRequest;await core.handle(sb,flow('quit-decline',revision,{type:'respondQuit',requestId:request.requestId,accept:false}));assert.equal(core.room.sessionFlow.ended,false);assert.equal(core.room.rankFlow.scheduledQuitBy,a.playerId);assert.equal(sa.last('snapshot').snapshot.sessionFlow.scheduledQuitByYou,true);
});

test('ranked Solo disconnect freezes the five-point settlement and stops the computer during grace',async()=>{
  const {core,user,socket}=await soloRoom(),bot=core.room.participants.find(item=>item.bot),record=core.authority.exportMatch(core.room.matchId),botSide=bot.seatId==='playerA'?'human':'ai';
  record.state.terminalResult=null;record.state.winner=null;record.completedAt=null;core.room.terminalResult=null;core.room.status='ready';
  // Secure-random Solo setup can let either seat collect scoring cards before this synthetic
  // disconnect scenario is injected. Return those captures to the deck so the fixture still
  // conserves all 48 cards, then normalize both scoring states to a deterministic 0-vs-5 setup.
  const userSide=botSide==='human'?'ai':'human';
  record.state.deck.push(...record.state[botSide].captured,...record.state[userSide].captured);
  for(const side of [botSide,userSide]){
    record.state[side].captured=[];record.state[side].gukjinMode='animal';record.state[side].firstPpeokPoints=0;
    record.state[side].go=0;record.state[side].shakes=0;record.state[side].shakeMultiplier=1;record.state[side].lastGoScore=0;
  }
  assert.equal(globalThis.GoStopEngine.scorePlayer(record.state[botSide]).total,0);
  assert.equal(globalThis.GoStopEngine.scorePlayer(record.state[userSide]).total,0);
  record.state[botSide].firstPpeokPoints=5;record.state.matchContext.nagariCarryPower=0;
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



test('clean seven-point Solo Stop settles and records exactly seven with no hidden doubling',async()=>{
  const {core,user,accountStore}=await soloRoom(),record=core.authority.exportMatch(core.room.matchId),seatId=record.seatByPlayer[user.playerId];
  record.state.terminalResult={type:'stop',winnerId:seatId,score:7,settlement:{baseTotal:7,total:7,goBonus:0,reasons:[],formulaSteps:['Base 7']}};
  record.state.winner=seatId;record.completedAt=now();
  core.authority=core.authorityFactory({crypto:webcrypto,now,trustedRuntime:true});core.authority.restoreMatch(record);
  // Secure random setup can very rarely finish the hand before this synthetic settlement is injected.
  // This test owns the current game settlement, so remove only that game's prior marker before asserting it.
  const gameId=core.currentGameId();core.room.settledGameIds=(core.room.settledGameIds||[]).filter(id=>id!==gameId);
  const snapshot=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId});
  await core.settleTerminal(snapshot);
  const call=accountStore.calls.findLast(item=>item.path==='/internal/game/settle');
  assert.ok(call);assert.equal(call.body.finalPoints,7);
  assert.equal(call.body.participants[0].walletDelta,7);
  assert.equal(call.body.participants[0].points,7);
  assert.deepEqual(call.body.settlementReasons,[]);
  assert.deepEqual(call.body.formulaSteps,['Base 7','Final 7']);
  assert.equal(call.body.sessionId,core.room.sessionId);
});


test('anonymous Free Gaming host stays connected while waiting for the second player',async()=>{
  const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now});
  const host=await core.create('FREEGAMEABC2345',null),socket=new Socket();
  assert.equal(core.isRanked(),false);
  assert.equal(host.ranked,false);
  assert.equal(core.room.status,'waiting');
  await core.connect(host.credential,socket);
  const connected=socket.last('connected');
  assert.ok(connected);
  assert.equal(connected.roomCode,'FREEGAMEABC2345');
  assert.equal(connected.playerId,host.playerId);
  assert.equal(core.room.participants[0].connected,true);
  assert.equal(socket.last('snapshot'),undefined);
});


test('Friendly Quit Game ends an unranked two-player room immediately instead of opening a Competitive quit request',async()=>{
  const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now});
  const host=await core.create('FREEGAMEABC2348',null),friend=await core.join(null,null),hostSocket=new Socket(),friendSocket=new Socket();
  await core.connect(host.credential,hostSocket);await core.connect(friend.credential,friendSocket);
  const snapshot=hostSocket.last('snapshot').snapshot;
  const result=await core.handle(hostSocket,flow('friendly-quit',snapshot.revision,{type:'quitGame'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.isRanked(),false);assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.sessionFlow.endedBy,host.playerId);assert.equal(core.room.rankFlow.quitRequest,null);assert.equal(core.room.status,'ended');
  const hostFlow=hostSocket.last('snapshot').snapshot.sessionFlow,friendFlow=friendSocket.last('snapshot').snapshot.sessionFlow;
  assert.equal(hostFlow.ended,true);assert.equal(hostFlow.endedByYou,true);assert.equal(friendFlow.ended,true);assert.equal(friendFlow.endedByYou,false);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit'||call.path==='/internal/game/settle').length,0);
});

test('anonymous Free Friend tab disconnect immediately ends the room for the surviving player',async()=>{
  const storage=new MemoryStorage(),accountStore=new AccountStub(),core=new FinalRankedRoomCore({storage,accountStore,cryptoApi:webcrypto,now});
  const host=await core.create('FREEGAMEABC2347',null),friend=await core.join(null,null),hostSocket=new Socket(),friendSocket=new Socket();
  await core.connect(host.credential,hostSocket);await core.connect(friend.credential,friendSocket);
  assert.equal(core.isRanked(),false);assert.ok(core.room.matchId);assert.equal(core.room.sessionFlow.ended,false);
  const result=await core.disconnect(friendSocket);
  assert.equal(result,true);assert.equal(core.room.sessionFlow.ended,true);assert.equal(core.room.sessionFlow.endedBy,friend.playerId);assert.equal(core.room.sessionFlow.forceEnded,true);assert.equal(core.room.status,'ended');
  const survivor=hostSocket.last('snapshot').snapshot.sessionFlow;
  assert.equal(survivor.ended,true);assert.equal(survivor.endedByYou,false);assert.equal(survivor.forceEnded,true);
  assert.equal(accountStore.calls.filter(call=>call.path==='/internal/force-quit'||call.path==='/internal/game/settle').length,0);
});