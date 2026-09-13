const test=require('node:test');
const assert=require('node:assert/strict');
const {planOnlinePresentation}=require('../presentation-plan.js');
const engine=require('../game-engine.js');

const card=id=>structuredClone(engine.masterDeck.find(item=>item.id===id));
const player=hand=>({hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0});

test('presentation planner assigns one movement owner to normal played and drawn cards',()=>{
  const played={type:'cardPlayed',actorId:'playerA',card:card('m2-1'),targetId:'m2-2',matchCount:1};
  const draw={type:'deckCardRevealed',actorId:'playerA',card:card('m3-1'),targetId:'m3-2',matchCount:1};
  const plan=planOnlinePresentation([played,draw]);
  assert.equal(plan.steps.filter(step=>step.kind==='handSlap').length,1);
  assert.equal(plan.steps.filter(step=>step.kind==='deckFlip').length,1);
  assert.equal(plan.steps.filter(step=>step.kind==='stageSlap'&&step.cardId==='m3-1').length,1);
});

test('target selection continues an existing stage without replaying departure or flip',()=>{
  const first=planOnlinePresentation([{type:'cardPlayed',actorId:'playerA',card:card('m2-1'),targetId:null,matchCount:2}]);
  assert.deepEqual(first.steps.map(step=>step.kind),['handStage']);
  const chosen=planOnlinePresentation([{type:'floorTargetChosen',actorId:'playerA',source:'played',targetId:'m2-2'}],first.stages);
  assert.deepEqual(chosen.steps.map(step=>step.kind),['stageSlap']);
  const revealed=planOnlinePresentation([{type:'deckCardRevealed',actorId:'playerA',card:card('m3-1'),targetId:null,matchCount:2}]);
  assert.deepEqual(revealed.steps.map(step=>step.kind),['deckFlip']);
  const drawChosen=planOnlinePresentation([{type:'floorTargetChosen',actorId:'playerA',source:'drawn',targetId:'m3-2'}],revealed.stages);
  assert.deepEqual(drawChosen.steps.map(step=>step.kind),['stageSlap']);
});

test('capture and landing events clean staged ownership for both viewers',()=>{
  for(const actorId of ['playerA','playerB']){
    const initial={'m1-1':'landed','m1-2':'landed'},captured=planOnlinePresentation([{type:'cardsCaptured',actorId,cardIds:['m1-1','m1-2']}],initial);
    assert.deepEqual(captured.steps.map(step=>step.kind),['capture']);assert.deepEqual(captured.stages,{});
    const landed=planOnlinePresentation([{type:'cardLanded',actorId,cardId:'m1-1'}],{'m1-1':'landed'});assert.deepEqual(landed.stages,{});
  }
});

test('matching deck capture conserves all 48 authoritative cards with no floor duplicate',()=>{
  const used=new Set(['m1-1','m1-2','m2-1']),remaining=engine.masterDeck.filter(item=>!used.has(item.id)).map(item=>structuredClone(item));
  let state={deck:[card('m1-2'),...remaining],floor:[card('m1-1')],human:player([card('m2-1')]),ai:player([]),floorStacks:{},floorSlotByCard:{'m1-1':0},floorSlotCount:12,startingPlayerId:'playerA',turn:'playerA',winner:null,specialWinner:null,openingSpecialsComplete:true,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}};
  const apply=action=>{state=engine.applyNormalTurnAction(state,{actorId:'playerA',...action}).state;assert.equal(engine.assertCardConservation(state),true);};
  assert.equal(engine.assertCardConservation(state),true);apply({type:'playCard',cardId:'m2-1'});apply({type:'drawNextCard'});apply({type:'resolveNormalCard',source:'played'});apply({type:'resolveNormalCard',source:'drawn'});
  assert.equal(state.floor.some(item=>item.id==='m1-2'),false);assert.deepEqual(state.human.captured.map(item=>item.id).sort(),['m1-1','m1-2']);
  const a=engine.projectStateForViewer(state,'playerA'),b=engine.projectStateForViewer(state,'playerB');assert.deepEqual(a.floor.map(item=>item.id),b.floor.map(item=>item.id));assert.deepEqual(a.human.captured.map(item=>item.id),b.human.captured.map(item=>item.id));
});
