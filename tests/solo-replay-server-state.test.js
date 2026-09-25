import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {FinalRankedRoomCore} from '../server/ranked-room-final.mjs';

class MemoryStorage{constructor(){this.values=new Map();this.alarm=null;}async get(key){return structuredClone(this.values.get(key));}async put(key,value){this.values.set(key,structuredClone(value));}async setAlarm(value){this.alarm=value;}async deleteAlarm(){this.alarm=null;}}
class Socket{constructor(){this.messages=[];}send(value){this.messages.push(JSON.parse(value));}close(){}last(type){return this.messages.findLast(message=>message.type===type);}}
class AccountStub{async fetch(request){const body=request.method==='POST'?await request.json().catch(()=>({})):{};return new Response(JSON.stringify({ok:true,session:{id:body.sessionId},game:{participants:[]}}),{status:200,headers:{'content-type':'application/json'}});}}
const now=()=> '2026-09-15T04:45:00.000Z';
const flow=(id,revision,action)=>JSON.stringify({type:'action',protocolVersion:1,actionId:id,expectedRevision:revision,action});

test('Solo replay never leaves the user on an authoritative dead turn after the computer opens',async()=>{
  const core=new FinalRankedRoomCore({storage:new MemoryStorage(),accountStore:new AccountStub(),cryptoApi:webcrypto,now});
  await core.createSolo('ABCDEFGHJK2399');
  const user=await core.join(null,{id:'solo-user',nickname:'SoloPlayer',walletCoins:200});
  const socket=new Socket();await core.connect(user.credential,socket);
  const bot=core.room.participants.find(item=>item.bot),record=core.authority.exportMatch(core.room.matchId);
  record.state.terminalResult={type:'stop',winnerId:bot.seatId,finalPoints:7};record.state.winner=bot.seatId;record.completedAt=now();
  core.authority=core.authorityFactory({crypto:webcrypto,now,trustedRuntime:true});core.authority.restoreMatch(record);core.room.terminalResult=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}).terminalResult;core.room.status='completed';await core.persist();
  const before=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId});
  await core.handle(socket,flow('replay-after-loss',before.revision,{type:'playAgainReady'}));
  const snapshot=socket.last('snapshot').snapshot,state=snapshot.state;
  if(!snapshot.terminalResult&&state.turn===snapshot.seatId&&!state.pendingDecision&&!state.pendingTurn&&state.openingSpecialsComplete){
    assert.ok(state.legalActions.includes('attemptPlayCard')||state.legalActions.includes('useBombBlank'));
  }
  if(snapshot.terminalResult)assert.ok(snapshot.terminalResult.winnerId||state.winner,'terminal replay snapshot must identify the winner');
  assert.equal(snapshot.sessionFlow.replayReady.you,false);
});
