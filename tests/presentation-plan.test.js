const test=require('node:test');
const assert=require('node:assert/strict');
const {planOnlinePresentation,pendingOnlineStageIds,isUpwardFlick}=require('../presentation-plan.js');
const engine=require('../game-engine.js');

const card=id=>structuredClone(engine.masterDeck.find(item=>item.id===id));
const player=hand=>({hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0});

test('quick upward and radial top-right motions are flick throws',()=>{
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:112,endY:420,duration:170}),true);
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:70,endY:440,duration:190}),true);
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:195,endY:455,duration:150}),true);
});

test('tap, slow drag, short lift, and nearly horizontal swipe are not flick throws',()=>{
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:101,endY:497,duration:90}),false);
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:100,endY:425,duration:520}),false);
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:100,endY:466,duration:120}),false);
  assert.equal(isUpwardFlick({startX:100,startY:500,endX:190,endY:490,duration:150}),false);
});

test('presentation planner assigns one movement owner to normal played and drawn cards',()=>{
  const played={type:'cardPlayed',actorId:'playerA',card:card('m2-1'),targetId:'m2-2',matchCount:1};
  const draw={type:'deckCardRevealed',actorId:'playerA',card:card('m3-1'),targetId:'m3-2',matchCount:1};
  const plan=planOnlinePresentation([played,draw]);
  assert.equal(plan.steps.filter(step=>step.kind==='handSlap').length,1);
  assert.equal(plan.steps.find(step=>step.kind==='handSlap').targetCardId,'m2-2');
  assert.equal(plan.steps.filter(step=>step.kind==='deckFlip').length,1);
  assert.equal(plan.steps.filter(step=>step.kind==='stageSlap'&&step.cardId==='m3-1').length,1);
});

test('unmatched hand play keeps one hand movement owner and no inferred target',()=>{
  const plan=planOnlinePresentation([{type:'cardPlayed',actorId:'playerA',card:card('m2-1'),targetId:null,matchCount:0}]);
  assert.deepEqual(plan.steps.map(step=>step.kind),['handSlap']);
  assert.equal(plan.steps[0].cardId,'m2-1');
  assert.equal(plan.steps[0].targetCardId,null);
});

test('registered stack representative targets drive direct hand and deck slaps',()=>{
  const hand=planOnlinePresentation([{type:'cardPlayed',actorId:'playerA',card:card('m2-4'),targetId:'m2-3',matchCount:3}]);
  assert.deepEqual(hand.steps.map(step=>[step.kind,step.cardId,step.targetCardId]),[['handSlap','m2-4','m2-3']]);
  const deck=planOnlinePresentation([{type:'deckCardRevealed',actorId:'playerA',card:card('m3-4'),targetId:'m3-3',matchCount:3}]);
  assert.deepEqual(deck.steps.map(step=>[step.kind,step.cardId,step.targetCardId]),[['deckFlip','m3-4',undefined],['stageSlap','m3-4','m3-3']]);
});

test('target selection continues an existing stage without replaying departure or flip',()=>{
  const first=planOnlinePresentation([{type:'cardPlayed',actorId:'playerA',card:card('m2-1'),targetId:null,matchCount:2}]);
  assert.deepEqual(first.steps.map(step=>step.kind),['handStage']);
  const chosen=planOnlinePresentation([{type:'floorTargetChosen',actorId:'playerA',source:'played',targetId:'m2-2'}],first.stages);
  assert.deepEqual(chosen.steps.map(step=>step.kind),['stageSlap']);
  assert.equal(chosen.steps[0].cardId,'m2-1');
  assert.equal(chosen.steps[0].targetCardId,'m2-2');
  assert.equal(chosen.steps.filter(step=>step.kind==='handSlap'||step.kind==='handStage').length,0);

  const revealed=planOnlinePresentation([{type:'deckCardRevealed',actorId:'playerA',card:card('m3-1'),targetId:null,matchCount:2}]);
  assert.deepEqual(revealed.steps.map(step=>step.kind),['deckFlip']);
  const drawChosen=planOnlinePresentation([{type:'floorTargetChosen',actorId:'playerA',source:'drawn',targetId:'m3-2'}],revealed.stages);
  assert.deepEqual(drawChosen.steps.map(step=>step.kind),['stageSlap']);
  assert.equal(drawChosen.steps[0].cardId,'m3-1');
  assert.equal(drawChosen.steps[0].targetCardId,'m3-2');
  assert.equal(drawChosen.steps.filter(step=>step.kind==='deckFlip').length,0);
});

test('capture and landing events clean staged ownership for both viewers',()=>{
  for(const actorId of ['playerA','playerB']){
    const initial={'m1-1':'landed','m1-2':'landed'},captured=planOnlinePresentation([{type:'cardsCaptured',actorId,cardIds:['m1-1','m1-2']}],initial);
    assert.deepEqual(captured.steps.map(step=>step.kind),['capture']);assert.deepEqual(captured.stages,{});
    const landed=planOnlinePresentation([{type:'cardLanded',actorId,cardId:'m1-1'}],{'m1-1':'landed'});assert.deepEqual(landed.stages,{});
  }
});

test('same-month Jjok, Ppeok, and Ttadak keep the drawn card aimed at the staged played card',()=>{
  const played=card('m10-3'),drawn=card('m10-4'),ordinaryFloorTarget=card('m10-1');
  for(const scenario of [
    {name:'Jjok',targetId:null,matchCount:0},
    {name:'Ppeok',targetId:ordinaryFloorTarget.id,matchCount:1},
    {name:'Ttadak',targetId:ordinaryFloorTarget.id,matchCount:2}
  ]){
    const plan=planOnlinePresentation(
      [{type:'deckCardRevealed',actorId:'playerA',card:drawn,targetId:scenario.targetId,matchCount:scenario.matchCount}],
      {[played.id]:'landed'},
      {pendingPlayedCard:played,sameMonthSpecial:true}
    );
    assert.deepEqual(plan.steps.map(step=>step.kind),['deckFlip','stageSlap'],scenario.name);
    assert.equal(plan.steps[1].cardId,drawn.id,scenario.name);
    assert.equal(plan.steps[1].targetCardId,played.id,scenario.name);
  }

  const ordinary=planOnlinePresentation(
    [{type:'deckCardRevealed',actorId:'playerA',card:drawn,targetId:ordinaryFloorTarget.id,matchCount:1}],
    {},
    {pendingPlayedCard:played,sameMonthSpecial:false}
  );
  assert.equal(ordinary.steps[1].targetCardId,ordinaryFloorTarget.id);
});

test('matching deck capture conserves all 48 authoritative cards with no floor duplicate',()=>{
  const used=new Set(['m1-1','m1-2','m2-1']),remaining=engine.masterDeck.filter(item=>!used.has(item.id)).map(item=>structuredClone(item));
  let state={deck:[card('m1-2'),...remaining],floor:[card('m1-1')],human:player([card('m2-1')]),ai:player([]),floorStacks:{},floorSlotByCard:{'m1-1':0},floorSlotCount:12,startingPlayerId:'playerA',turn:'playerA',winner:null,specialWinner:null,openingSpecialsComplete:true,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}};
  const apply=action=>{state=engine.applyNormalTurnAction(state,{actorId:'playerA',...action}).state;assert.equal(engine.assertCardConservation(state),true);};
  assert.equal(engine.assertCardConservation(state),true);apply({type:'playCard',cardId:'m2-1'});apply({type:'drawNextCard'});apply({type:'resolveNormalCard',source:'played'});apply({type:'resolveNormalCard',source:'drawn'});
  assert.equal(state.floor.some(item=>item.id==='m1-2'),false);assert.deepEqual(state.human.captured.map(item=>item.id).sort(),['m1-1','m1-2']);
  const a=engine.projectStateForViewer(state,'playerA'),b=engine.projectStateForViewer(state,'playerB');assert.deepEqual(a.floor.map(item=>item.id),b.floor.map(item=>item.id));assert.deepEqual(a.human.captured.map(item=>item.id),b.human.captured.map(item=>item.id));
});

test('eventless authority sync preserves cards still owned by pending turn staging',()=>{
  const state={pendingTurn:{played:{card:card('m2-1')},drawn:{card:card('m3-1')}}};
  assert.deepEqual(pendingOnlineStageIds(state),['m2-1','m3-1']);
  assert.deepEqual(pendingOnlineStageIds({pendingTurn:{played:{card:card('m2-1')},drawn:null}}),['m2-1']);
  assert.deepEqual(pendingOnlineStageIds({}),[]);
});
