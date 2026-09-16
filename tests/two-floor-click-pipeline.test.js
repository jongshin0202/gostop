'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=require('../game-engine.js');

const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const card=id=>structuredClone(engine.masterDeck.find(item=>item.id===id));

test('ranked client submits the hand card before waiting for an authoritative two-floor choice',()=>{
  assert.match(app,/async function submitOnlineCardPlay\(\)[\s\S]*?onlineSubmit\(\{type:'playCard',cardId,targetId:null\}\)/);
  assert.doesNotMatch(app,/if\(matches\.length>1\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
});

test('server engine turns a targetless play with two floor matches into chooseFloorTarget',()=>{
  const played=card('m1-1'),floorA=card('m1-2'),floorB=card('m1-3');
  const makePlayer=hand=>({hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0});
  const state={deck:[card('m2-1')],floor:[floorA,floorB],human:makePlayer([played]),ai:makePlayer([]),floorStacks:{},floorSlotByCard:{[floorA.id]:0,[floorB.id]:1},floorSlotCount:12,startingPlayerId:'playerA',turn:'playerA',winner:null,specialWinner:null,openingResolved:true,openingSpecialsComplete:true,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}};
  const attempted=engine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:played.id});
  const result=engine.applyNormalTurnAction(attempted.state,{type:'playCard',actorId:'playerA',cardId:played.id,targetId:null});
  assert.equal(result.state.pendingTurn.phase,'awaitingFloorTarget');
  assert.equal(result.pendingDecision.type,'chooseFloorTarget');
  assert.deepEqual(new Set(result.pendingDecision.legalTargetIds),new Set([floorA.id,floorB.id]));
});


test('ordinary ranked cards use one-click authoritative play while Shake/Bomb cards keep the pre-decision path',()=>{
  assert.match(app,/const needsPrePlayDecision=state\.human\.armedBombMonths\?\.includes\(card\.month\)\|\|state\.human\.hiddenTripleMonths\?\.includes\(card\.month\)/);
  assert.match(app,/const action=needsPrePlayDecision\?\{type:'attemptPlayCard',cardId\}:\{type:'playCard',cardId,targetId:null\}/);
  assert.match(app,/clickedEl\?\.classList\.add\('pending-card'\)/);
});


test('ranked card input serializes rapid/repeated taps until the authority responds',()=>{
  const humanPlay=app.slice(app.indexOf('async function humanPlay'),app.indexOf('async function aiTurn'));
  assert.match(humanPlay,/if\(onlineMode\)\{[\s\S]*?if\(onlineActions\.size>0\)return;/);
});

test('ranked targetless play leaves zero/one floor matches to authority without opening a false chooser',()=>{
  const makePlayer=hand=>({hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0});
  const makeState=floor=>({deck:[card('m2-1')],floor,human:makePlayer([card('m1-1')]),ai:makePlayer([]),floorStacks:{},floorSlotByCard:Object.fromEntries(floor.map((item,index)=>[item.id,index])),floorSlotCount:12,startingPlayerId:'playerA',turn:'playerA',winner:null,specialWinner:null,openingResolved:true,openingSpecialsComplete:true,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}});
  for(const floor of [[],[card('m1-2')]]){
    const state=makeState(floor);
    const result=engine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m1-1',targetId:null});
    assert.notEqual(result.pendingDecision?.type,'chooseFloorTarget');
    assert.notEqual(result.state.pendingTurn?.phase,'awaitingFloorTarget');
  }
});

test('ranked click pipeline keeps special pre-decisions and clears rejected pending-card ownership',()=>{
  assert.match(app,/needsPrePlayDecision=state\.human\.armedBombMonths\?\.includes\(card\.month\)\|\|state\.human\.hiddenTripleMonths\?\.includes\(card\.month\)/);
  assert.match(app,/actionRejected[\s\S]*?if\(onlinePendingCardId===action\.cardId\)onlinePendingCardId=null/);
});
