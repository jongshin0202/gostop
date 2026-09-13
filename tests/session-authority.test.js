'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const engine=require('../game-engine.js');
const {createSessionAuthority,AuthorityError}=require('../session-authority.js');

function authority(options={}){return createSessionAuthority({crypto:webcrypto,now:()=> '2026-09-12T00:00:00.000Z',...options});}
function allVisibleCards(snapshot){
  const state=snapshot.state;
  return [...state.human.hand,...state.human.captured,...(state.ai.hand||[]),...state.ai.captured,...state.floor];
}
function submit(service,match,playerId,actionId,action,revision=match.revision){return service.submitAction({matchId:match.matchId,playerId,actionId,expectedRevision:revision,action});}
function createReadyMatch(service,prefix){
  for(let attempt=0;attempt<100;attempt++){
    let match=service.createMatch({matchId:`${prefix}-${attempt}`,playerIds:['alice','bob'],startingPlayerId:'alice'});
    match=submit(service,match,'alice',`resolve-opening-${attempt}`,{type:'resolveOpening'}).snapshot;
    const other=service.getSnapshot({matchId:match.matchId,viewerId:'bob'});
    if(!match.terminalResult&&!match.state.pendingDecision&&!other.state.pendingDecision)return match;
  }
  throw new Error('Unable to create a hand without an opening decision.');
}

test('createMatch creates exactly one secure, valid 48-card authoritative deal',()=>{
  const service=authority();
  const created=service.createMatch({matchId:'one',playerIds:['alice','bob'],startingPlayerId:'alice'});
  assert.equal(service.matchCount,1);
  assert.throws(()=>service.createMatch({matchId:'one',playerIds:['alice','bob']}),error=>error.code==='MATCH_EXISTS');
  assert.equal(created.state.human.hand.length,10);
  assert.equal(created.state.ai.handCount,10);
  assert.equal(created.state.floor.length,8);
  assert.equal(created.state.deckCount,20);
  assert.equal(created.state.human.hand.length+created.state.ai.handCount+created.state.floor.length+created.state.deckCount,48);
  assert.equal(created.state.floor.some((card,index,cards)=>cards.filter(other=>other.month===card.month).length===4),false);
  assert.equal(created.state.openingResolved,undefined);
});

test('snapshots protect opponent hands, deck order, and private decisions',()=>{
  const service=authority();
  const a=service.createMatch({matchId:'privacy',playerIds:['alice','bob'],startingPlayerId:'alice'});
  const b=service.getSnapshot({matchId:'privacy',viewerId:'bob'});
  assert.ok(Array.isArray(a.state.human.hand));assert.equal(a.state.ai.hand,undefined);assert.equal(a.state.ai.handCount,10);
  assert.ok(Array.isArray(b.state.ai.hand));assert.equal(b.state.human.hand,undefined);assert.equal(b.state.human.handCount,10);
  assert.equal(a.state.deck,undefined);assert.equal(b.state.deck,undefined);assert.equal(a.state.deckCount,b.state.deckCount);
  assert.deepEqual(a.state.floor,b.state.floor);assert.deepEqual(a.state.floorStacks,b.state.floorStacks);
  if(a.state.pendingDecision){assert.equal(a.state.pendingDecision.playerId,'playerA');assert.equal(b.state.pendingDecision,undefined);}
  else if(b.state.pendingDecision){assert.equal(b.state.pendingDecision.playerId,'playerB');assert.equal(a.state.pendingDecision,undefined);}
});

test('accepted action advances once; exact duplicate is idempotent and conflicting reuse fails',()=>{
  const service=authority();const current=createReadyMatch(service,'idem');
  const cardId=current.state.human.hand[0].id;
  const first=submit(service,current,'alice','action-1',{type:'attemptPlayCard',cardId});
  assert.equal(first.revision,current.revision+1);
  const duplicate=service.submitAction({matchId:current.matchId,playerId:'alice',actionId:'action-1',expectedRevision:current.revision,action:{type:'attemptPlayCard',cardId}});
  assert.deepEqual(duplicate,first);assert.equal(service.getSnapshot({matchId:current.matchId,viewerId:'alice'}).revision,first.revision);
  assert.throws(()=>service.submitAction({matchId:current.matchId,playerId:'alice',actionId:'action-1',expectedRevision:first.revision,action:{type:'playCard',cardId}}),error=>error.code==='ACTION_ID_CONFLICT');
  assert.throws(()=>service.submitAction({matchId:current.matchId,playerId:'alice',actionId:'stale',expectedRevision:current.revision,action:{type:'playCard',cardId}}),error=>error.code==='STALE_REVISION');
});

test('wrong player, out-of-turn, illegal, and malformed submissions are rejected without revision changes',()=>{
  const service=authority();const match=service.createMatch({matchId:'reject',playerIds:['alice','bob'],startingPlayerId:'alice'});
  const revision=match.revision;
  assert.throws(()=>submit(service,match,'mallory','x',{type:'attemptPlayCard',cardId:'m1-1'}),error=>error.code==='WRONG_PLAYER');
  assert.throws(()=>submit(service,match,'bob','x',{type:'attemptPlayCard',cardId:'m1-1'}),error=>['OUT_OF_TURN','ILLEGAL_ACTION'].includes(error.code));
  assert.throws(()=>submit(service,match,'alice','illegal',{type:'playCard',cardId:'not-owned'}),error=>error.code==='ILLEGAL_ACTION');
  assert.throws(()=>service.submitAction({matchId:'reject',playerId:'alice',actionId:'bad',expectedRevision:revision,action:null}),error=>error instanceof AuthorityError&&error.code==='MALFORMED_ACTION');
  assert.equal(service.getSnapshot({matchId:'reject',viewerId:'alice'}).revision,revision);
});

test('private events are viewer-safe and event history is revision ordered',()=>{
  const service=authority();const match=createReadyMatch(service,'events');
  const cardId=match.state.human.hand[0].id;
  submit(service,match,'alice','attempt',{type:'attemptPlayCard',cardId});
  const alice=service.getEventsSince({matchId:match.matchId,viewerId:'alice',revision:0});
  const bob=service.getEventsSince({matchId:match.matchId,viewerId:'bob',revision:0});
  for(const stream of [alice.events,bob.events])for(let i=1;i<stream.length;i++)assert.ok(stream[i-1].revision<stream[i].revision||stream[i-1].revision===stream[i].revision&&stream[i-1].eventIndex<stream[i].eventIndex);
  assert.ok(alice.events.every(event=>event.audience===undefined));assert.ok(bob.events.every(event=>event.audience===undefined));
  assert.ok(bob.events.every(event=>event.playerId!=='playerA'));
  assert.deepEqual(service.getEventsSince({matchId:match.matchId,viewerId:'alice',revision:alice.revision}).events,[]);
});

test('engine remains DOM-free and authority delegates every gameplay action to it',()=>{
  assert.equal(typeof document,'undefined');
  assert.equal(typeof engine.applyNormalTurnAction,'function');
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','session-authority.js'),'utf8');
  assert.match(source,/engine\.applyNormalTurnAction/);assert.match(source,/engine\.applySpecialTurnAction/);assert.match(source,/engine\.applyGoStopAction/);
});
