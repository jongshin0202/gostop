'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const engine=require('../game-engine.js');
const {createSessionAuthority,AuthorityError}=require('../session-authority.js');

function authority(options={}){return createSessionAuthority({crypto:webcrypto,now:()=> '2026-09-12T00:00:00.000Z',...options});}
function deterministicCrypto(seed=0x6d2b79f5){let value=seed>>>0;return {getRandomValues(array){for(let index=0;index<array.length;index++){value^=value<<13;value^=value>>>17;value^=value<<5;array[index]=value>>>0;}return array;}};}
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

test('online Go is public to both viewers and hands the turn to the opposite participant',()=>{
  for(const actor of ['alice','bob']){
    const seed=authority({trustedRuntime:true}),created=seed.createMatch({matchId:`go-${actor}`,playerIds:['alice','bob'],startingPlayerId:actor}),record=seed.exportMatch(created.matchId),state=record.state,actorSeat=actor==='alice'?'playerA':'playerB',side=actorSeat==='playerA'?'human':'ai',otherSide=side==='human'?'ai':'human';
    const all=[...state.human.hand,...state.ai.hand,...state.floor,...state.deck],captured=[];for(const card of all)if(card.type==='pi'&&engine.scorePlayer({...state[side],captured:[...captured,card]}).total<=7)captured.push(card);
    while(engine.scorePlayer({...state[side],captured}).total<7){const next=all.find(card=>!captured.some(item=>item.id===card.id));captured.push(next);}
    const remaining=all.filter(card=>!captured.some(item=>item.id===card.id));state[side].captured=captured;state[side].hand=[remaining.shift()];state[otherSide].captured=[];state[otherSide].hand=[remaining.shift()];state.floor=[];state.deck=remaining;state.floorSlotByCard={};state.floorStacks={};state.turn=actorSeat;state.winner=null;state.terminalResult=null;state.openingSpecialsComplete=true;delete state.pendingTurn;const score=engine.scorePlayer(state[side]).total;state.pendingDecision={type:'goStopDecision',audience:'player-private',playerId:actorSeat,score,previousGoScore:0,choices:['go','stop']};state.matchContext.lastScoreBySide[actorSeat]=0;record.state=state;record.events=[];record.actions={};record.revision=0;
    const service=authority({trustedRuntime:true});service.restoreMatch(record);const result=service.submitAction({matchId:record.id,playerId:actor,actionId:'go',expectedRevision:0,action:{type:'declareGo'}}),other=actor==='alice'?'bob':'alice',otherView=service.getSnapshot({matchId:record.id,viewerId:other});
    assert.equal(result.events.filter(event=>event.type==='goDeclared').length,1);assert.equal(result.events.find(event=>event.type==='turnHandedOff').toPlayerId,actorSeat==='playerA'?'playerB':'playerA');assert.equal(otherView.state.turn,actorSeat==='playerA'?'playerB':'playerA');assert.equal(otherView.state.legalActions.includes('attemptPlayCard'),true);assert.equal(service.getEventsSince({matchId:record.id,viewerId:other,revision:0}).events.filter(event=>event.type==='goDeclared').length,1);
  }
});

test('deck draw onto a registered stack advances directly to authoritative special resolution',()=>{
  const seed=authority({trustedRuntime:true}),created=seed.createMatch({matchId:'stack-auto',playerIds:['alice','bob'],startingPlayerId:'alice'}),record=seed.exportMatch(created.matchId),state=record.state;
  const month=3,monthCards=engine.masterDeck.filter(card=>card.month===month).map(card=>engine.serializeGameState(card)),stack=monthCards.slice(0,3),drawn=monthCards[3],remaining=engine.masterDeck.filter(card=>card.month!==month).map(card=>engine.serializeGameState(card));
  state.floor=stack;state.deck=[drawn];state.human.hand=[remaining.shift()];state.ai.hand=[remaining.shift()];state.human.captured=[];state.ai.captured=remaining;
  state.floorSlotByCard=Object.fromEntries(stack.map(card=>[card.id,0]));state.floorSlotCount=12;state.floorStacks={[month]:{month,cardIds:stack.map(card=>card.id),source:'ppeok',owner:'playerA'}};
  state.turn='playerA';state.startingPlayerId='playerA';state.openingSpecialsComplete=true;state.human.bombFreeTurns=1;state.winner=null;state.terminalResult=null;delete state.pendingDecision;delete state.pendingTurn;
  engine.assertCardConservation(state);record.state=state;record.events=[];record.actions={};record.revision=0;
  const service=authority({trustedRuntime:true});service.restoreMatch(record);
  const blank=submit(service,service.getSnapshot({matchId:record.id,viewerId:'alice'}),'alice','blank',{type:'useBombBlank'});
  assert.equal(blank.snapshot.nextAction.type,'drawNextCard');
  const result=submit(service,blank.snapshot,'alice','draw',{type:'drawNextCard'});
  assert.equal(result.snapshot.state.pendingDecision,undefined);assert.equal(result.snapshot.nextAction.type,'resolveSpecialTurn');
  assert.equal(result.events[0].type,'deckCardRevealed');assert.equal(result.events[0].targetId,stack[2].id);
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

test('authoritative completion atomically evaluates and strictly alternates ordinary turns',()=>{
  const service=authority({crypto:deterministicCrypto()}),initial=createReadyMatch(service,'alternation'),matchId=initial.matchId;
  let revision=initial.revision,actionSequence=0,completed=0,expectedSeat=initial.state.turn;
  const external=seat=>seat==='playerA'?'alice':'bob';
  const ownHand=(snapshot,seat)=>seat==='playerA'?snapshot.state.human.hand:snapshot.state.ai.hand;
  const send=(playerId,action)=>service.submitAction({matchId,playerId,actionId:`alternation-${++actionSequence}`,expectedRevision:revision,action:JSON.parse(JSON.stringify(action))});
  while(completed<20){
    const actor=external(expectedSeat),opponent=external(expectedSeat==='playerA'?'playerB':'playerA');
    const actorView=service.getSnapshot({matchId,viewerId:actor}),opponentView=service.getSnapshot({matchId,viewerId:opponent});revision=actorView.revision;
    assert.equal(actorView.state.turn,expectedSeat);assert.equal(opponentView.state.turn,expectedSeat);
    assert.ok(actorView.state.legalActions.includes('attemptPlayCard'));assert.equal(opponentView.state.legalActions.includes('attemptPlayCard'),false);
    assert.throws(()=>send(opponent,{type:'attemptPlayCard',cardId:'not-the-opponents-turn'}),error=>error.code==='OUT_OF_TURN');
    const cardId=ownHand(actorView,expectedSeat)[0]?.id;if(!cardId)break;
    let result=send(actor,{type:'attemptPlayCard',cardId});revision=result.revision;
    let view=service.getSnapshot({matchId,viewerId:actor});
    if(view.state.pendingDecision?.type==='shakeDecision'){result=send(actor,{type:'keepShakeSecret'});revision=result.revision;view=result.snapshot;}
    else if(view.state.pendingDecision?.type==='bombDecision'){result=send(actor,{type:'declineBomb'});revision=result.revision;view=result.snapshot;}
    result=send(actor,{type:'playCard',cardId});revision=result.revision;
    for(let guard=0;guard<12&&!result.events.some(event=>event.type==='turnCompleted');guard++){
      view=service.getSnapshot({matchId,viewerId:actor});const next=view.nextAction;assert.ok(next,`authority stalled after ${completed} completed turns`);
      const action=next.type==='chooseFloorTarget'?{type:'chooseFloorTarget',source:next.source,targetId:next.legalTargetIds[0]}:next;
      result=send(actor,action);revision=result.revision;
    }
    assert.equal(result.events.filter(event=>event.type==='turnCompleted').length,1);completed++;
    view=service.getSnapshot({matchId,viewerId:actor});
    if(view.terminalResult)break;
    if(view.state.pendingDecision?.type==='goStopDecision'){
      result=send(actor,{type:'declareGo'});revision=result.revision;view=result.snapshot;
      if(view.terminalResult)break;
    }
    const nextSeat=expectedSeat==='playerA'?'playerB':'playerA';
    const a=service.getSnapshot({matchId,viewerId:'alice'}),b=service.getSnapshot({matchId,viewerId:'bob'});
    assert.equal(a.state.turn,nextSeat);assert.equal(b.state.turn,nextSeat);
    assert.equal(a.state.legalActions.includes('attemptPlayCard'),nextSeat==='playerA');assert.equal(b.state.legalActions.includes('attemptPlayCard'),nextSeat==='playerB');
    expectedSeat=nextSeat;
  }
  assert.ok(completed>0);assert.ok(completed===20||service.getSnapshot({matchId,viewerId:'alice'}).terminalResult);
});


test('Ttadak skips irrelevant drawn target selection while ordinary two-target draws still choose',()=>{
  const findScenario=(wanted,prefix)=>{
    const service=authority({crypto:deterministicCrypto(0x31f2a9c7),trustedRuntime:true});

    for(let attempt=0;attempt<120;attempt++){
      const match=createReadyMatch(service,`${prefix}-${attempt}`);
      const trusted=service.readTrustedState(match.matchId);

      if(trusted.turn!=='playerA')continue;

      for(const played of trusted.human.hand){
        // Avoid Shake/Bomb decision branches; this test is specifically about
        // post-play draw continuation.
        if(trusted.human.hand.filter(card=>card.month===played.month).length>=3)continue;

        const matches=engine.matchingCards(trusted.floor,played);
        const target=matches.length?matches[0]:null;

        let afterPlay,afterDraw;
        try{
          afterPlay=engine.applyNormalTurnAction(trusted,{
            type:'playCard',
            actorId:'playerA',
            cardId:played.id,
            targetId:target?.id||null
          }).state;

          afterDraw=engine.applyNormalTurnAction(afterPlay,{
            type:'drawNextCard',
            actorId:'playerA'
          }).state;
        }catch(_){
          continue;
        }

        const classification=engine.classifyTurnOutcome(afterDraw,{actorId:'playerA'});

        if(wanted==='ttadak'&&classification.kind==='ttadakCandidate')
          return {service,match,played,target};

        if(
          wanted==='ordinary-two-target'&&
          afterDraw.pendingTurn?.phase==='awaitingFloorTarget'&&
          afterDraw.pendingTurn?.drawn?.matchIds?.length===2&&
          afterDraw.pendingTurn.drawn.card.month!==afterDraw.pendingTurn.played.card.month
        )
          return {service,match,played,target};
      }
    }

    throw new Error(`Unable to find deterministic ${wanted} scenario.`);
  };

  const runThroughDraw=(scenario,label)=>{
    const {service,played,target}=scenario;
    let snapshot=scenario.match;

    let result=submit(
      service,snapshot,'alice',`${label}-attempt`,
      {type:'attemptPlayCard',cardId:played.id}
    );
    snapshot=result.snapshot;
    assert.equal(snapshot.state.pendingDecision,undefined);

    result=submit(
      service,snapshot,'alice',`${label}-play`,
      {type:'playCard',cardId:played.id,targetId:target?.id||null}
    );
    snapshot=result.snapshot;
    assert.equal(snapshot.nextAction?.type,'drawNextCard');

    result=submit(
      service,snapshot,'alice',`${label}-draw`,
      {type:'drawNextCard'}
    );

    return {service,actor:result.snapshot};
  };

  const ttadak=runThroughDraw(findScenario('ttadak','ttadak-scenario'),'ttadak');
  const ttadakOpponent=ttadak.service.getSnapshot({
    matchId:ttadak.actor.matchId,
    viewerId:'bob'
  });

  assert.equal(ttadak.actor.nextAction?.type,'resolveSpecialTurn');
  assert.equal(ttadak.actor.nextAction?.source,undefined);
  assert.equal(ttadakOpponent.nextAction,null);
  assert.equal(ttadak.actor.state.pendingDecision,undefined);
  assert.equal(ttadakOpponent.state.pendingDecision,undefined);
  assert.deepEqual(ttadak.actor.state.floor,ttadakOpponent.state.floor);

  const resolvedSpecial=submit(
    ttadak.service,
    ttadak.actor,
    'alice',
    'ttadak-resolve-once',
    {type:'resolveSpecialTurn'}
  );

  assert.equal(resolvedSpecial.snapshot.nextAction?.type,'completeTurn');
  assert.notEqual(resolvedSpecial.snapshot.nextAction?.type,'resolveSpecialTurn');

  const ordinary=runThroughDraw(
    findScenario('ordinary-two-target','ordinary-target-scenario'),
    'ordinary'
  );

  assert.equal(ordinary.actor.nextAction?.type,'chooseFloorTarget');
  assert.equal(ordinary.actor.nextAction?.source,'drawn');
  assert.equal(ordinary.actor.nextAction?.legalTargetIds.length,2);
});
