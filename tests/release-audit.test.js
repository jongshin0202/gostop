'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../game-engine.js');
const {createSessionAuthority}=require('../session-authority.js');

function deterministicCrypto(seed){
  let value=(seed>>>0)||0x9e3779b9;
  return {
    getRandomValues(array){
      for(let index=0;index<array.length;index++){
        value^=value<<13;value^=value>>>17;value^=value<<5;
        array[index]=value>>>0;
      }
      return array;
    }
  };
}
function policyRng(seed){
  let value=(seed^0xa5a5a5a5)>>>0;
  return ()=>{
    value^=value<<13;value^=value>>>17;value^=value<<5;
    return (value>>>0)/0x100000000;
  };
}
const externalForSeat=seat=>seat==='playerA'?'alice':'bob';
const sideForSeat=seat=>seat==='playerA'?'human':'ai';

function driveFullMatch(seed){
  const random=policyRng(seed),service=createSessionAuthority({
    crypto:deterministicCrypto(seed),
    trustedRuntime:true,
    now:()=> '2026-09-23T00:00:00.000Z'
  });
  const matchId=`release-audit-${seed}`;
  let snapshot=service.createMatch({
    matchId,
    playerIds:['alice','bob'],
    startingPlayerId:seed%2?'alice':'bob'
  });
  let actionSequence=0,resumeCardBySeat={};
  const eventTypes=new Set();

  const send=(seat,action)=>{
    const playerId=externalForSeat(seat);
    const before=service.getSnapshot({matchId,viewerId:playerId});
    const result=service.submitAction({
      matchId,playerId,
      actionId:`audit-${seed}-${++actionSequence}`,
      expectedRevision:before.revision,
      action
    });
    assert.equal(result.revision,before.revision+1,'every accepted audit action advances exactly one revision');
    for(const event of result.events||[])eventTypes.add(event.type);
    if(result.resumePlay?.cardId)resumeCardBySeat[seat]=result.resumePlay.cardId;
    return result.snapshot;
  };

  for(let guard=0;guard<500;guard++){
    const trusted=service.readTrustedState(matchId);
    engine.assertCardConservation(trusted);
    const roundTrip=engine.deserializeGameState(engine.serializeGameState(trusted));
    engine.assertCardConservation(roundTrip);
    assert.deepEqual(roundTrip,trusted,'authoritative state must be lossless through JSON persistence');

    if(trusted.terminalResult){
      for(const viewerId of ['alice','bob']){
        const view=service.getSnapshot({matchId,viewerId});
        assert.ok(view.terminalResult,'terminal result must be public to both players');
        assert.equal(view.state.deck,undefined,'viewer snapshots must never reveal deck order');
        assert.equal(view.state[viewerId==='alice'?'ai':'human'].hand,undefined,'viewer snapshots must never reveal opponent hand');
      }
      return {actions:actionSequence,eventTypes,terminal:trusted.terminalResult};
    }

    const decision=trusted.pendingDecision;
    if(decision){
      const seat=decision.playerId;
      let action;
      if(decision.type==='openingTripleDecision'){
        if(decision.floorCardId)action={type:'declareShake'};
        else action=random()<0.5?{type:'declareShake'}:{type:'armOpeningBomb'};
      }else if(decision.type==='shakeDecision'){
        action=random()<0.5?{type:'declareShake'}:{type:'keepShakeSecret'};
      }else if(decision.type==='bombDecision'){
        action=random()<0.5?{type:'declareBomb'}:{type:'declineBomb'};
      }else if(decision.type==='goStopDecision'){
        const player=trusted[sideForSeat(seat)];
        action=player.go<1&&random()<0.45?{type:'declareGo'}:{type:'declareStop'};
      }else{
        assert.fail(`unknown private decision ${decision.type}`);
      }
      snapshot=send(seat,action);
      continue;
    }

    const seat=trusted.turn,playerId=externalForSeat(seat);
    snapshot=service.getSnapshot({matchId,viewerId:playerId});

    if(!trusted.openingSpecialsComplete){
      assert.equal(snapshot.nextAction?.type,'resolveOpening','opening must always expose a continuation');
      snapshot=send(seat,{type:'resolveOpening'});
      continue;
    }

    if(trusted.pendingTurn){
      const next=snapshot.nextAction;
      assert.ok(next,`pending turn stalled in phase ${trusted.pendingTurn.phase}`);
      let action;
      if(next.type==='chooseFloorTarget'){
        assert.ok(next.legalTargetIds.length>0,'target choice must expose at least one legal target');
        action={type:'chooseFloorTarget',source:next.source,targetId:next.legalTargetIds[Math.floor(random()*next.legalTargetIds.length)]};
      }else action={...next};
      snapshot=send(seat,action);
      continue;
    }

    const side=sideForSeat(seat),player=trusted[side];
    if(player.bombFreeTurns>0&&(player.hand.length===0||random()<0.22)){
      snapshot=send(seat,{type:'useBombBlank'});
      continue;
    }
    assert.ok(player.hand.length>0,'non-terminal idle turn must have a playable card or Bomb blank');
    let cardId=resumeCardBySeat[seat];
    if(!cardId||!player.hand.some(card=>card.id===cardId)){
      cardId=player.hand[Math.floor(random()*player.hand.length)].id;
    }
    delete resumeCardBySeat[seat];
    snapshot=send(seat,{type:'playCard',cardId});
  }
  assert.fail(`match ${seed} exceeded the 500-action release-audit guard`);
}

test('release audit: sixty complete authoritative matches conserve all cards, persist losslessly, never stall, and keep private state private',()=>{
  let totalActions=0,terminalCount=0;
  const observed=new Set();
  for(let seed=1;seed<=60;seed++){
    const result=driveFullMatch(seed);
    totalActions+=result.actions;terminalCount++;
    for(const type of result.eventTypes)observed.add(type);
  }
  assert.equal(terminalCount,60);
  assert.ok(totalActions>1200,'stress pass should execute a substantial number of authoritative actions');
  assert.ok(observed.has('turnCompleted'),'stress pass must exercise completed turns');
  assert.ok(observed.has('cardsCaptured'),'stress pass must exercise captures');
});

test('release audit: scoring and settlements remain finite and non-negative for every prefix of the canonical deck',()=>{
  for(let count=0;count<=engine.masterDeck.length;count++){
    const captured=engine.masterDeck.slice(0,count);
    for(const gukjinMode of ['animal','pi']){
      const player={captured,gukjinMode,go:count%7,shakes:count%3,shakeMultiplier:2**(count%3),firstPpeokPoints:count%2,lastGoScore:0};
      const scored=engine.scorePlayer(player);
      assert.ok(Number.isFinite(scored.total)&&scored.total>=0);
      const settlement=engine.calculateSettlement({winner:player,loser:{...player,captured:[]},nagariCarryPower:count%4});
      assert.ok(Number.isFinite(settlement.total)&&settlement.total>=0);
    }
  }
});
