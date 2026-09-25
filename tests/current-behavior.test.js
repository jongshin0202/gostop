'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extractedEngine = require('../game-engine.js');

function fakeElement(){
  return {
    textContent:'',innerHTML:'',className:'',style:{},dataset:{},open:false,
    classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(){},removeEventListener(){},appendChild(){},append(){},remove(){},
    setAttribute(){},removeAttribute(){},contains(){return false;},querySelector(){return null;},querySelectorAll(){return [];},
    getBoundingClientRect(){return {left:0,top:0,right:500,bottom:300,width:100,height:100};},
    show(){this.open=true;},showModal(){this.open=true;},close(){this.open=false;}
  };
}

function loadCurrentGame(){
  const elements = new Map();
  const selectors = new Map();
  const document = {
    getElementById(id){
      if(!elements.has(id))elements.set(id,fakeElement());
      return elements.get(id);
    },
    addEventListener(){},querySelector(selector){if(!selectors.has(selector))selectors.set(selector,fakeElement());return selectors.get(selector);},querySelectorAll(){return [];},createElement(){return fakeElement();},
    body:fakeElement(),documentElement:fakeElement()
  };
  const context = {
    GOSTOP_TEST_MODE:true,document,console:{info(){},error(){},warn(){}},
    crypto:require('node:crypto').webcrypto,
    matchMedia(){return {matches:true};},
    requestAnimationFrame(fn){fn();},setTimeout(fn){fn();return 0;},clearTimeout(){},
    getComputedStyle(){return {getPropertyValue(){return '';}};},
    Audio:function(){return {preload:'',crossOrigin:'',cloneNode(){return this;},play(){return Promise.resolve();},pause(){}};},
    GOSTOP_AUDIO_PPEOK:'',GOSTOP_AUDIO_SHAKE:'',GOSTOP_AUDIO_FANFARE:''
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  const i18nSource=fs.readFileSync(path.join(__dirname,'..','i18n.js'),'utf8');
  vm.runInContext(i18nSource,context,{filename:'i18n.js'});
  const engineSource=fs.readFileSync(path.join(__dirname,'..','game-engine.js'),'utf8');
  vm.runInContext(engineSource,context,{filename:'game-engine.js'});
  const authoritySource=fs.readFileSync(path.join(__dirname,'..','session-authority.js'),'utf8');
  vm.runInContext(authoritySource,context,{filename:'session-authority.js'});
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  vm.runInContext(source,context,{filename:'app.js'});
  return {api:context.GOSTOP_TEST_API,elements,selectors,document};
}

const {api,elements,selectors,document}=loadCurrentGame();
const card=id=>api.card(id);
const cards=(...ids)=>ids.map(card);

function stateWith(overrides={}){
  return api.makeState({
    human:api.makePlayer(),
    ai:api.makePlayer(),
    ...overrides
  });
}

function useState(state){api.setState(state);return state;}

test('extracted engine exposes a frozen classic-script-compatible API',()=>{
  assert.equal(Object.isFrozen(extractedEngine),true);
  assert.equal(Object.isFrozen(extractedEngine.masterDeck),true);
  assert.equal(extractedEngine.masterDeck.length,48);
});

test('playerA viewer maps playerA to bottom and playerB to top',()=>{
  const state=stateWith({
    human:api.makePlayer({hand:[card('m1-1')]}),
    ai:api.makePlayer({hand:[card('m2-1')]})
  });
  const view=api.viewerRelativePlayers(state,api.playerIds.playerA);
  assert.equal(view.bottom.id,'playerA');
  assert.equal(view.bottom.player,state.human);
  assert.equal(view.top.id,'playerB');
  assert.equal(view.top.player,state.ai);
});

test('playerB viewer maps playerB to bottom and playerA to top',()=>{
  const state=stateWith({
    human:api.makePlayer({hand:[card('m1-1')]}),
    ai:api.makePlayer({hand:[card('m2-1')]})
  });
  const view=api.viewerRelativePlayers(state,api.playerIds.playerB);
  assert.equal(view.bottom.id,'playerB');
  assert.equal(view.bottom.player,state.ai);
  assert.equal(view.top.id,'playerA');
  assert.equal(view.top.player,state.human);
});

test('otherPlayerId returns the opposite stable neutral identity',()=>{
  assert.equal(api.otherPlayerId(api.playerIds.playerA),api.playerIds.playerB);
  assert.equal(api.otherPlayerId(api.playerIds.playerB),api.playerIds.playerA);
  assert.throws(()=>api.otherPlayerId('human'),/Unknown player ID/);
});

test('Solo compatibility maps playerA to human and playerB to AI',()=>{
  assert.equal(api.soloViewerId,api.playerIds.playerA);
  assert.equal(api.legacySideForPlayerId(api.playerIds.playerA),'human');
  assert.equal(api.legacySideForPlayerId(api.playerIds.playerB),'ai');
  assert.equal(api.playerIdForLegacySide('human'),api.playerIds.playerA);
  assert.equal(api.playerIdForLegacySide('ai'),api.playerIds.playerB);
  assert.equal(api.seatForLegacySide('human'),'bottom');
  assert.equal(api.seatForLegacySide('ai'),'top');
});

test('traditional deck has 48 unique cards and exactly four cards per month',()=>{
  const deck=api.masterDeck();
  assert.doesNotThrow(()=>api.assertDeckIntegrity(deck));
  assert.equal(deck.length,48);
  assert.equal(new Set(deck.map(c=>c.id)).size,48);
  for(let month=1;month<=12;month++)assert.equal(deck.filter(c=>c.month===month).length,4);
  const duplicate=deck.slice(); duplicate[47]={...duplicate[0]};
  assert.throws(()=>api.assertDeckIntegrity(duplicate),/duplicate card IDs/);
});

test('extracted month helpers preserve matching and triple/four detection',()=>{
  const sample=cards('m1-1','m1-2','m1-3','m2-1');
  assert.equal(extractedEngine.matchingCards(sample,1).map(c=>c.id).join(','),'m1-1,m1-2,m1-3');
  assert.deepEqual(extractedEngine.tripleMonths(sample),[1]);
  assert.deepEqual(extractedEngine.fourMonths(sample.concat(card('m1-4'))),[1]);
  assert.equal(extractedEngine.hasFourOfMonth(sample),false);
  assert.equal(extractedEngine.hasFourOfMonth(sample.concat(card('m1-4'))),true);
});

test('matching is by month and a three-card floor stack exposes only its top card',()=>{
  const floor=cards('m1-1','m1-2','m2-1');
  const state=useState(stateWith({floor}));
  assert.equal(api.effectiveFloorMatchCards(card('m1-3')).map(c=>c.id).join(','),'m1-1,m1-2');
  api.makePpeokStack('human',floor.slice(0,2).concat(card('m1-3')));
  assert.equal(api.effectiveFloorMatchCards(card('m1-4')).map(c=>c.id).join(','),'m1-3');
  assert.equal(api.expandedTargetCards(card('m1-3')).map(c=>c.id).join(','),'m1-1,m1-2,m1-3');
  assert.equal(state.floorStacks[1].source,'ppeok');
});

test('Online semantic floor candidates collapse every registered stack but retain ordinary match counts',()=>{
  const stackCards=cards('m2-1','m2-2','m2-3'),played=card('m2-4');
  for(const [source,owner] of [['ppeok','playerA'],['ppeok','playerB'],['initial',null]]){
    useState(stateWith({floor:stackCards,floorStacks:{2:{month:2,cardIds:stackCards.map(item=>item.id),source,owner}}}));
    assert.equal(api.effectiveFloorMatchCards(played).map(item=>item.id).join(','),'m2-3');
  }
  useState(stateWith({floor:cards('m2-1','m2-2')}));
  assert.equal(api.effectiveFloorMatchCards(played).map(item=>item.id).join(','),'m2-1,m2-2');
  useState(stateWith({floor:[card('m2-1')]}));assert.equal(api.effectiveFloorMatchCards(played).map(item=>item.id).join(','),'m2-1');
  useState(stateWith({floor:[card('m3-1')]}));assert.equal(api.effectiveFloorMatchCards(played).length,0);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),submit=source.slice(source.indexOf('async function submitOnlineCardPlay'),source.indexOf('const beginOnline'));
  // Ranked play still resolves on the authority, but an ordinary two-target hand card
  // stays uncommitted until the player chooses one highlighted legal target.
  assert.match(submit,/let targetId=null/);
  assert.match(submit,/const matches=matchesFor\(card\)/);
  assert.match(submit,/if\(matches\.length===2\)[\s\S]*chooseFloorTarget\(matches,'Choose which floor card to hit',\{cancelable:true\}\)/);
  assert.match(submit,/targetId=target\.id/);
  assert.match(submit,/onlineSubmit\(\{type:'playCard',cardId,targetId\}\)/);
  assert.doesNotMatch(submit,/state\.floor\.filter\(item=>item\.month===card\.month\)/);
});

test('scoring covers Brights, Godori, ribbon sets, Singles, and Gukjin optimization',()=>{
  assert.equal(api.score(cards('m1-1','m3-1','m8-1')).brightPts,3);
  assert.equal(api.score(cards('m1-1','m3-1','m12-1')).brightPts,2);
  assert.equal(api.score(cards('m2-1','m4-1','m8-2')).godori,true);
  assert.equal(api.score(cards('m2-1','m4-1','m8-2')).animalPts,5);
  assert.equal(api.score(cards('m1-2','m2-2','m3-2')).ribbonPts,3);
  const tenPi=cards('m1-3','m1-4','m2-3','m2-4','m3-3','m3-4','m4-3','m4-4','m5-3','m5-4');
  assert.equal(api.score(tenPi).piPts,1);
  const gukjinWithNinePi=[card('m9-1'),...tenPi.slice(0,9)];
  const optimized=api.score(gukjinWithNinePi);
  assert.equal(optimized.gukjinAsPi,true);
  assert.equal(optimized.piCount,11);
  assert.equal(optimized.piPts,2);
});

test('settlement applies Go bonuses and all current doubling multipliers',()=>{
  const scoring=cards('m1-1','m3-1','m8-1','m2-1','m4-1','m5-1','m6-1','m7-1','m8-2','m9-1');
  const loserPi=cards('m1-3','m2-3','m3-3','m4-3','m5-3','m6-3','m7-3');
  const state=useState(stateWith({
    human:api.makePlayer({captured:scoring,go:3,shakes:1,bombs:1}),
    ai:api.makePlayer({captured:loserPi,go:1,lastGoScore:1})
  }));
  api.setNagariCarryPower(1);
  const settled=api.calculateFinalScore('human');
  assert.equal(settled.baseTotal,11);
  assert.equal(settled.goBonus,0);
  assert.equal(settled.total,704);
  assert.deepEqual([...settled.formulaSteps],[
    'Base 11','3 Go ×2','Shake ×2',
    'Meong-bak ×2','Gwang-bak ×2','Go-bak ×2','Nagari carry ×2'
  ]);
  api.setNagariCarryPower(0);
  assert.equal(state.winner,null);
});

test('extracted settlement preserves each current bonus and bak multiplier',()=>{
  const player=(captured,overrides={})=>({captured,go:0,shakes:0,bombs:0,lastGoScore:0,...overrides});
  const threeBright=cards('m1-1','m3-1','m8-1');
  const defendingBright=[card('m12-1')];
  const settle=(winner,loser=player(defendingBright),nagariCarryPower=0)=>
    extractedEngine.calculateSettlement({winner,loser,nagariCarryPower});

  assert.equal(settle(player(threeBright,{go:2})).total,5);
  assert.equal(settle(player(threeBright,{shakes:1})).total,6);
  assert.equal(settle(player(threeBright,{bombs:1})).total,3);
  assert.equal(settle(player(threeBright),player([])).total,6);
  assert.equal(settle(player(threeBright),player([],{go:1,lastGoScore:0})).total,12);
  assert.equal(settle(player(threeBright),player(defendingBright),1).total,6);

  const tenPi=cards('m1-3','m1-4','m2-3','m2-4','m3-3','m3-4','m4-3','m4-4','m5-3','m5-4');
  const sevenPi=cards('m6-3','m6-4','m7-3','m7-4','m8-3','m8-4','m9-3');
  assert.equal(settle(player(tenPi),player(sevenPi)).total,2);

  const sevenAnimals=cards('m2-1','m4-1','m5-1','m6-1','m7-1','m8-2','m9-1');
  assert.equal(settle(player(sevenAnimals)).total,16);
});

test('Shake eligibility is hidden-triple gated and each declaration doubles settlement',()=>{
  api.setNagariCarryPower(0);
  const player=api.makePlayer({hand:cards('m5-1','m5-2','m5-3'),hiddenTripleMonths:[5]});
  assert.equal(api.canDeclareShake(player,5),true);
  api.monthListAdd(player,'hiddenTripleMonths',5);
  assert.equal(player.hiddenTripleMonths.join(','),'5');
  api.monthListDelete(player,'hiddenTripleMonths',5);
  assert.equal(api.canDeclareShake(player,5),false);
  const state=useState(stateWith({
    human:api.makePlayer({captured:cards('m1-1','m3-1','m8-1'),shakes:2}),
    ai:api.makePlayer({captured:[card('m12-1')]})
  }));
  assert.equal(api.calculateFinalScore('human').total,12);
  assert.equal(state.human.shakes,2);
});

test('Bomb captures the four-card month, steals Pi, and grants two blank turns',async()=>{
  const triple=cards('m6-1','m6-2','m6-3');
  const floorCard=card('m6-4');
  const state=useState(stateWith({
    deck:[card('m7-3')],floor:[floorCard],
    human:api.makePlayer({hand:[...triple,card('m8-3')],hiddenTripleMonths:[6]}),
    ai:api.makePlayer({hand:[card('m9-3')],captured:[card('m10-3')]})
  }));
  api.initFloorSlots(state);
  const offered=extractedEngine.applyNormalTurnAction(state,{type:'requestBombDecision',actorId:'playerA',cardId:'m6-1'});
  api.setState(offered.state);
  await api.executeBombTurn('human',6);
  const resolved=api.getState();
  assert.equal(resolved.human.bombs,1);
  assert.equal(resolved.human.bombFreeTurns,2);
  assert.equal(resolved.human.captured.filter(c=>c.month===6).length,4);
  assert.ok(resolved.human.captured.some(c=>c.id==='m10-3'));
  assert.equal(resolved.ai.captured.length,0);
  assert.equal(resolved.floor.some(c=>c.id==='m7-3'),true);
});

test('a Bomb blank turn is consumed without going below zero',()=>{
  const player=api.makePlayer({bombFreeTurns:2});
  api.consumeBombBlank(player); api.consumeBombBlank(player); api.consumeBombBlank(player);
  assert.equal(player.bombFreeTurns,0);
});

test('Ppeok/Ssa-da forms a three-card stack and increments the actor count',async()=>{
  const target=card('m4-1'),played=card('m4-2'),draw=card('m4-3');
  let classified=stateWith({floor:[target],deck:[draw],human:api.makePlayer({hand:[played]})});
  classified=extractedEngine.applyNormalTurnAction(classified,{type:'playCard',actorId:'playerA',cardId:played.id}).state;
  classified=extractedEngine.applyNormalTurnAction(classified,{type:'drawNextCard',actorId:'playerA'}).state;
  assert.equal(extractedEngine.classifyTurnOutcome(classified,{actorId:'playerA'}).kind,'ppeokSsaDaCandidate');
  const engineResult=extractedEngine.applySpecialTurnAction(classified,{type:'resolveSpecialTurn',actorId:'playerA'});
  const state=useState(stateWith({floor:[target]})); api.initFloorSlots(state);
  await api.resolveCombinedTurn('human',{card:played,target,matchCount:1},{card:draw,target:played,matchCount:2});
  assert.equal(state.human.ppeoks,1);
  assert.deepEqual([...state.floorStacks[4].cardIds],[target.id,played.id,draw.id]);
  assert.equal(new Set(state.floorStacks[4].cardIds.map(id=>state.floorSlotByCard[id])).size,1);
  assert.deepEqual(engineResult.events[0].cardIds,[...state.floorStacks[4].cardIds]);
  assert.equal(engineResult.events[0].type,'ppeokFormed');
});

test('Self-Ppeok capture takes the full stack and transfers one physical Pi',async()=>{
  const stack=cards('m2-1','m2-2','m2-3');
  const state=useState(stateWith({
    floor:[...stack],
    human:api.makePlayer(),
    ai:api.makePlayer({captured:cards('m7-3','m8-3')})
  }));
  api.initFloorSlots(state); api.makePpeokStack('human',stack);
  await api.resolveSingleCard('human',{card:card('m2-4'),target:stack[2],matchCount:1},false);
  assert.equal(state.floor.length,0);
  assert.equal(state.human.captured.filter(c=>c.month===2).length,4);
  assert.equal(state.human.captured.filter(c=>c.type==='pi').length,3);
  assert.equal(state.ai.captured.length,1);
});

test('Ttadak captures two floor cards plus the played and drawn cards and steals Pi',async()=>{
  const floor=cards('m3-1','m3-2');
  const state=useState(stateWith({floor,ai:api.makePlayer({captured:[card('m7-3')]})}));
  api.initFloorSlots(state);
  await api.resolveCombinedTurn('human',{card:card('m3-3'),target:floor[0],matchCount:2},{card:card('m3-4'),target:card('m3-3'),matchCount:3});
  assert.equal(state.human.captured.filter(c=>c.month===3).length,4);
  assert.ok(state.human.captured.some(c=>c.id==='m7-3'));
  assert.equal(state.floor.length,0);
});

test('Jjok captures an otherwise unmatched played/drawn pair and steals Pi',async()=>{
  const state=useState(stateWith({
    floor:[card('m8-1')],
    ai:api.makePlayer({captured:[card('m7-3')]})
  })); api.initFloorSlots(state);
  await api.resolveCombinedTurn('human',{card:card('m5-1'),target:null,matchCount:0},{card:card('m5-2'),target:card('m5-1'),matchCount:1});
  assert.equal(state.human.captured.filter(c=>c.month===5).map(c=>c.id).join(','),'m5-1,m5-2');
  assert.ok(state.human.captured.some(c=>c.id==='m7-3'));
  assert.equal(state.floor.map(c=>c.id).join(','),'m8-1');
});

test('Sweep transfers one Pi when a capture empties a live floor',async()=>{
  const target=card('m10-1');
  const state=useState(stateWith({
    deck:[card('m12-3')],floor:[target],
    human:api.makePlayer({hand:[card('m1-3')]}),
    ai:api.makePlayer({hand:[card('m2-3')],captured:[card('m7-3')]})
  })); api.initFloorSlots(state);
  await api.resolveSingleCard('human',{card:card('m10-2'),target,matchCount:1},false);
  await api.applySweepIfNeeded('human');
  const swept=api.getState();
  assert.equal(swept.floor.length,0);
  assert.ok(swept.human.captured.some(c=>c.id==='m7-3'));
});

test('Chongtong recognizes four of a month and awards the current opening win',async()=>{
  const state=useState(stateWith({human:api.makePlayer({hand:cards('m11-1','m11-2','m11-3','m11-4')})}));
  api.setNagariCarryPower(0);
  assert.deepEqual([...api.fourMonths(state.human.hand)],[11]);
  await api.processOpeningSpecials();
  const opened=api.getState();
  assert.equal(opened.winner,'playerA');
  assert.equal(opened.specialWinner,'playerA');
  assert.equal(elements.get('resultScore').textContent,'7 Points');
});

test('Go/Stop eligibility requires threshold and a strict score increase',()=>{
  assert.equal(api.reachedNewFinishScore(6,0),false);
  assert.equal(api.reachedNewFinishScore(7,7),false);
  assert.equal(api.reachedNewFinishScore(8,7),true);
});

test('Pi transfer prefers ordinary Pi and falls back to double Pi',async()=>{
  const state=useState(stateWith({
    ai:api.makePlayer({captured:cards('m11-3','m4-3')})
  }));
  await api.stealPiAnimated('human',1);
  assert.equal(state.human.captured.map(c=>c.id).join(','),'m4-3');
  await api.stealPiAnimated('human',1);
  assert.equal(state.human.captured.map(c=>c.id).join(','),'m4-3,m11-3');
});

test('Nagari increments and caps carry power at three',async()=>{
  let state=useState(stateWith());
  api.setNagariCarryPower(2);
  await api.finishNagari();
  state=api.getState();
  assert.equal(state.winner,'nagari');
  assert.equal(api.getNagariCarryPower(),3);
  state=useState(stateWith({matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:3}}));
  await api.finishNagari();
  assert.equal(api.getNagariCarryPower(),3);
  api.setNagariCarryPower(0);
});

test('floor slots remain stable after captures and unmatched cards fill holes',()=>{
  const floor=cards('m1-1','m2-1','m3-1','m4-1');
  const state=useState(stateWith({floor})); api.initFloorSlots(state);
  const original=Object.fromEntries(floor.map(c=>[c.id,state.floorSlotByCard[c.id]]));
  api.removeFloorCards([floor[1]]);
  assert.equal(state.floorSlotByCard[floor[0].id],original[floor[0].id]);
  assert.equal(state.floorSlotByCard[floor[2].id],original[floor[2].id]);
  assert.equal(state.floorSlotByCard[floor[3].id],original[floor[3].id]);
  const landed=card('m5-1'); api.addFloorCard(landed);
  assert.equal(state.floorSlotByCard[landed.id],original[floor[1].id]);
});

test('in-flight floor reservations prevent duplicate occupancy without entering authoritative state',()=>{
  const deck=api.masterDeck();
  const floor=deck.slice(0,12);
  const state=useState(stateWith({floor})); api.initFloorSlots(state);
  const first=deck[12],second=deck[13];
  const firstSlot=api.reserveFloorSlot(first);
  const secondSlot=api.reserveFloorSlot(second);
  assert.notEqual(firstSlot,secondSlot);
  assert.equal(firstSlot,12);
  assert.equal(secondSlot,13);
  assert.equal(state.floorSlotCount,12);
  assert.equal(state.floorSlotByCard[first.id],undefined);
  assert.equal(state.floorSlotByCard[second.id],undefined);
  assert.equal(JSON.stringify(api.getPresentationSnapshot().floorSlotReservations),JSON.stringify({[first.id]:firstSlot,[second.id]:secondSlot}));
  api.addFloorCard(first); api.addFloorCard(second);
  assert.equal(state.floorSlotByCard[first.id],firstSlot);
  assert.equal(state.floorSlotByCard[second.id],secondSlot);
  assert.equal(JSON.stringify(api.getPresentationSnapshot().floorSlotReservations),'{}');
});

test('stack angles and card tilt are deterministic presentation decoration only',()=>{
  const stackCards=cards('m4-1','m4-2','m4-3');
  const state=useState(stateWith({floor:[...stackCards]})); api.initFloorSlots(state);
  api.makePpeokStack('human',stackCards);
  const before=JSON.stringify(state);
  const stack=state.floorStacks[4];
  const firstAngles=stackCards.map((item,index)=>api.stableStackAngle(stack,item,index));
  const secondAngles=stackCards.map((item,index)=>api.stableStackAngle(stack,item,index));
  assert.deepEqual(firstAngles,secondAngles);
  assert.equal(api.stableFloorTilt(stackCards[0]),api.stableFloorTilt(stackCards[0]));
  assert.equal(Object.hasOwn(stack,'angles'),false);
  assert.equal(JSON.stringify(state),before);
});

test('authoritative state is entirely JSON-safe and contains no presentation objects',()=>{
  const state=stateWith({floor:[card('m1-1')]});
  const blockers=[];
  function visit(value,path){
    const tag=Object.prototype.toString.call(value);
    if(tag==='[object Set]'||tag==='[object Map]'||typeof value==='function'){
      blockers.push(`${path}:${tag==='[object Set]'?'Set':tag==='[object Map]'?'Map':'function'}`);
      return;
    }
    if(!value||typeof value!=='object')return;
    Object.entries(value).forEach(([key,item])=>visit(item,path?`${path}.${key}`:key));
  }
  visit(state,'');
  assert.deepEqual(blockers,[]);
  assert.equal('floorSlotReservations' in state,false);
  assert.equal('stagedCards' in state,false);
  assert.equal('locked' in state,false);
  const parsed=JSON.parse(JSON.stringify(state));
  assert.equal(JSON.stringify(parsed),JSON.stringify(state));
});

test('authoritative match state survives a lossless serialize/JSON/deserialize round trip',()=>{
  const deck=cards('m12-4','m11-4','m10-4','m9-4');
  const floor=cards('m4-1','m4-2','m4-3','m8-1');
  const state=stateWith({
    deck,
    floor,
    human:api.makePlayer({
      hand:cards('m1-1','m2-1'),captured:cards('m3-1','m5-3'),go:2,shakes:1,bombs:1,
      bombFreeTurns:2,ppeoks:1,hiddenTripleMonths:[6],shakenMonths:[7],lastGoScore:5
    }),
    ai:api.makePlayer({
      hand:cards('m9-1','m10-1'),captured:cards('m12-1','m6-3'),go:1,
      hiddenTripleMonths:[10,11],shakenMonths:[2],lastGoScore:3
    }),
    floorStacks:{4:{month:4,cardIds:['m4-1','m4-2','m4-3'],source:'ppeok',owner:'playerA'}},
    floorSlotCount:12,
    floorSlotByCard:{'m4-1':2,'m4-2':2,'m4-3':2,'m8-1':7},
    turn:'playerB',winner:null,specialWinner:null,
    matchContext:{lastScoreBySide:{playerA:6,playerB:4},nagariCarryPower:2}
  });
  const beforeSettlement=extractedEngine.calculateSettlement({
    winner:state.human,loser:state.ai,nagariCarryPower:state.matchContext.nagariCarryPower
  });
  const plain=api.serializeGameState(state);
  const wire=JSON.parse(JSON.stringify(plain));
  const restored=api.deserializeGameState(wire);

  assert.equal(JSON.stringify(restored),JSON.stringify(state));
  assert.equal(restored.deck.map(item=>item.id).join(','),deck.map(item=>item.id).join(','));
  assert.equal(restored.human.hiddenTripleMonths.join(','),'6');
  assert.equal(restored.human.shakenMonths.join(','),'7');
  assert.equal(restored.ai.hiddenTripleMonths.join(','),'10,11');
  assert.equal(restored.ai.shakenMonths.join(','),'2');
  assert.equal(restored.human.bombFreeTurns,2);
  assert.equal(JSON.stringify(restored.floorStacks),JSON.stringify(state.floorStacks));
  assert.equal(JSON.stringify(restored.floorSlotByCard),JSON.stringify(state.floorSlotByCard));
  assert.equal(JSON.stringify(restored.matchContext),JSON.stringify(state.matchContext));
  const afterSettlement=extractedEngine.calculateSettlement({
    winner:restored.human,loser:restored.ai,nagariCarryPower:restored.matchContext.nagariCarryPower
  });
  assert.equal(JSON.stringify(afterSettlement),JSON.stringify(beforeSettlement));
});

async function legacyNormalOutcome(initial,playedId,playTargetId=null){
  const legacy=api.deserializeGameState(JSON.parse(JSON.stringify(initial)));
  const legacySide=legacy.turn==='playerA'?'human':'ai';
  const played=legacy[legacySide].hand.find(item=>item.id===playedId);
  legacy[legacySide].hand=legacy[legacySide].hand.filter(item=>item.id!==playedId);
  const drawn=legacy.deck.shift()||null;
  useState(legacy);
  const playMatches=api.effectiveFloorMatchCards(played);
  const playTarget=playTargetId?legacy.floor.find(item=>item.id===playTargetId):playMatches[0]||null;
  const drawMatches=drawn?api.effectiveFloorMatchCards(drawn):[];
  const drawTarget=drawMatches[0]||null;
  if(playMatches.length===0)api.reserveFloorSlot(played);
  if(drawn&&drawMatches.length===0)api.reserveFloorSlot(drawn);
  await api.resolveCombinedTurn(
    legacySide,{card:played,target:playTarget,matchCount:playMatches.length},
    drawn?{card:drawn,target:drawTarget,matchCount:drawMatches.length}:null
  );
  return legacy;
}

function engineNormalOutcome(initial,playedId,playTargetId=null,drawTargetId=null){
  let result=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:initial.turn,cardId:playedId,targetId:playTargetId});
  const events=[...result.events];
  let state=result.state;
  if(state.deck.length){
    result=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:initial.turn,targetId:drawTargetId});
    state=result.state; events.push(...result.events);
  }
  for(const source of ['played','drawn']){
    if(source==='drawn'&&!state.pendingTurn.drawn)continue;
    result=extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:initial.turn,source});
    state=result.state; events.push(...result.events);
  }
  result=extractedEngine.applyNormalTurnAction(state,{type:'completeTurn',actorId:initial.turn});
  return {state:result.state,events:events.concat(result.events)};
}

test('normal unmatched play/draw engine actions match the legacy outcome and event order',async()=>{
  const initial=stateWith({
    deck:[card('m3-1')],floor:[card('m1-1')],
    human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m1-1':0}
  });
  const legacy=await legacyNormalOutcome(initial,'m2-1');
  const actual=engineNormalOutcome(initial,'m2-1');
  legacy.human.turnsTaken=1;
  assert.equal(JSON.stringify(actual.state),JSON.stringify(legacy));
  assert.deepEqual(actual.events.map(event=>event.type),[
    'cardPlayed','deckCardRevealed','cardLanded','cardLanded','turnCompleted'
  ]);
  assert.equal(actual.events.every(event=>event.audience==='public'),true);
  assert.equal(actual.events.every(event=>event.actorId==='playerA'),true);
});

test('normal single captures engine actions match the legacy outcome',async()=>{
  const initial=stateWith({
    deck:[card('m3-2')],floor:cards('m2-2','m3-1','m8-1'),
    human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m2-2':0,'m3-1':1,'m8-1':2}
  });
  const legacy=await legacyNormalOutcome(initial,'m2-1');
  const actual=engineNormalOutcome(initial,'m2-1');
  legacy.human.turnsTaken=1;
  assert.equal(JSON.stringify(actual.state),JSON.stringify(legacy));
  assert.deepEqual(actual.events.map(event=>event.type),[
    'cardPlayed','deckCardRevealed','cardsCaptured','cardsCaptured','turnCompleted'
  ]);
});

test('normal engine preserves a pre-reserved unmatched slot when the played capture opens an earlier hole',async()=>{
  const initial=stateWith({
    deck:[card('m3-1')],floor:cards('m2-2','m8-1'),
    human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m2-2':0,'m8-1':1}
  });
  const legacy=await legacyNormalOutcome(initial,'m2-1');
  const actual=engineNormalOutcome(initial,'m2-1');
  legacy.human.turnsTaken=1;
  assert.equal(JSON.stringify(actual.state),JSON.stringify(legacy));
  assert.equal(actual.state.floorSlotByCard['m3-1'],2);
});

test('normal chosen-target action matches the legacy two-target outcome',async()=>{
  const initial=stateWith({
    deck:[card('m4-3')],floor:cards('m2-2','m2-3','m8-1'),
    human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m2-2':0,'m2-3':1,'m8-1':2}
  });
  const legacy=await legacyNormalOutcome(initial,'m2-1','m2-3');
  const actual=engineNormalOutcome(initial,'m2-1','m2-3');
  legacy.human.turnsTaken=1;
  assert.equal(JSON.stringify(actual.state),JSON.stringify(legacy));
  assert.equal(actual.state.human.captured.some(item=>item.id==='m2-3'),true);
  assert.equal(actual.state.floor.some(item=>item.id==='m2-2'),true);
});

test('normal actions validate actor, ownership, and legal chosen target',()=>{
  const initial=stateWith({
    floor:cards('m2-2','m2-3'),human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m2-2':0,'m2-3':1}
  });
  assert.throws(()=>extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerB',cardId:'m2-1'}),/not playerB's turn/);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m9-1'}),/not owned/);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m2-1',targetId:'m8-1'}),/Illegal floor target/);
  const pending=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m2-1'});
  assert.equal(pending.pendingDecision.type,'chooseFloorTarget');
  const chosen=extractedEngine.applyNormalTurnAction(pending.state,{type:'chooseFloorTarget',actorId:'playerA',source:'played',targetId:'m2-3'});
  assert.equal(chosen.state.pendingTurn.played.targetId,'m2-3');
  assert.equal(pending.pendingDecision.audience,'player-private');
  assert.equal(pending.pendingDecision.playerId,'playerA');
  assert.deepEqual(pending.pendingDecision.legalTargetIds,['m2-2','m2-3']);
});

test('normal engine rejects same-month and floor-stack special resolution',()=>{
  let state=stateWith({
    deck:[card('m5-2')],floor:[card('m8-1')],human:api.makePlayer({hand:[card('m5-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m8-1':0}
  });
  state=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m5-1'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'}).state;
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'played'}),/Same-month turn/);

  state=stateWith({
    floor:cards('m4-1','m4-2','m4-3'),
    human:api.makePlayer({hand:[card('m4-4')]}),
    floorStacks:{4:{month:4,cardIds:['m4-1','m4-2','m4-3'],source:'ppeok',owner:'playerB'}},
    floorSlotCount:12,floorSlotByCard:{'m4-1':0,'m4-2':0,'m4-3':0}
  });
  state=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m4-4',targetId:'m4-3'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'}).state;
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'played'}),/non-normal resolution|Stack capture/);
});

test('public normal-turn actions reject legacy actor identities',()=>{
  const initial=stateWith({human:api.makePlayer({hand:[card('m2-1')]})});
  for(const actorId of ['human','ai']){
    assert.throws(()=>extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId,cardId:'m2-1'}),/Unknown actorId/);
  }
  assert.throws(()=>extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actor:'human',cardId:'m2-1'}),/neutral actorId/);
});

test('playerB performs the AI-side normal action sequence with neutral event identities',()=>{
  const initial=stateWith({
    turn:'playerB',deck:[card('m3-1')],floor:[card('m1-1')],
    ai:api.makePlayer({hand:[card('m2-1')]}),floorSlotCount:12,floorSlotByCard:{'m1-1':0}
  });
  const actual=engineNormalOutcome(initial,'m2-1');
  assert.equal(actual.state.ai.hand.length,0);
  assert.equal(actual.state.floor.some(item=>item.id==='m2-1'),true);
  assert.equal(actual.events.every(event=>event.actorId==='playerB'),true);
  assert.equal(actual.events.some(event=>Object.hasOwn(event,'actor')),false);
});

test('awaiting-target state round-trips with the exact neutral private decision',()=>{
  const initial=stateWith({
    floor:cards('m2-2','m2-3'),human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m2-2':0,'m2-3':1}
  });
  const result=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m2-1'});
  assert.equal(result.state.pendingTurn.phase,'awaitingFloorTarget');
  assert.equal(result.state.pendingTurn.actorId,'playerA');
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(result.state))));
  assert.deepEqual(restored.pendingTurn,result.state.pendingTurn);
  assert.deepEqual(result.pendingDecision,{
    type:'chooseFloorTarget',audience:'player-private',playerId:'playerA',actorId:'playerA',source:'played',
    cardId:'m2-1',legalTargetIds:['m2-2','m2-3'],phase:'awaitingFloorTarget'
  });
  assert.throws(()=>extractedEngine.applyNormalTurnAction(restored,{type:'drawNextCard',actorId:'playerA'}),/not awaiting a deck draw/);
  const chosen=extractedEngine.applyNormalTurnAction(restored,{type:'chooseFloorTarget',actorId:'playerA',source:'played',targetId:'m2-2'});
  assert.equal(chosen.state.pendingTurn.phase,'awaitingDraw');
});

test('awaiting-draw state round-trips with exactly draw as its next action',()=>{
  const initial=stateWith({
    deck:[card('m3-1')],floor:[card('m1-1')],human:api.makePlayer({hand:[card('m2-1')]}),
    floorSlotCount:12,floorSlotByCard:{'m1-1':0}
  });
  const played=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m2-1'});
  assert.equal(played.state.pendingTurn.phase,'awaitingDraw');
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(played.state)));
  assert.deepEqual(restored.pendingTurn,played.state.pendingTurn);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(restored,{type:'resolveNormalCard',actorId:'playerA',source:'played'}),/not awaiting normal resolution/);
  const drawn=extractedEngine.applyNormalTurnAction(restored,{type:'drawNextCard',actorId:'playerA'});
  assert.equal(drawn.state.pendingTurn.phase,'awaitingNormalResolution');
  assert.equal(drawn.state.pendingTurn.nextResolution,'played');
});

test('normal-turn phases enforce ordered resolution and completion',()=>{
  const initial=stateWith({deck:[card('m3-1')],human:api.makePlayer({hand:[card('m2-1')]})});
  let state=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m2-1'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'}).state;
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'drawn'}),/must be played/);
  state=extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'played'}).state;
  assert.equal(state.pendingTurn.nextResolution,'drawn');
  state=extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'drawn'}).state;
  assert.equal(state.pendingTurn.phase,'awaitingTurnCompletion');
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'}),/not awaiting a deck draw/);
});

function classifyPlayedAndDrawn(initial,actorId,cardId,targetId=null){
  let state=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId,cardId,targetId}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId}).state;
  return {state,outcome:extractedEngine.classifyTurnOutcome(state,{actorId})};
}

test('classifier distinguishes unmatched and ordinary capture normal outcomes',()=>{
  let result=classifyPlayedAndDrawn(stateWith({
    deck:[card('m3-1')],floor:[card('m1-1')],human:api.makePlayer({hand:[card('m2-1')]})
  }),'playerA','m2-1');
  assert.equal(result.outcome.kind,'normal');
  assert.deepEqual(result.outcome.cardOutcomes.map(item=>item.kind),['unmatchedLanding','unmatchedLanding']);

  result=classifyPlayedAndDrawn(stateWith({
    deck:[card('m3-2')],floor:cards('m2-2','m3-1'),human:api.makePlayer({hand:[card('m2-1')]})
  }),'playerA','m2-1');
  assert.equal(result.outcome.kind,'normal');
  assert.deepEqual(result.outcome.cardOutcomes.map(item=>item.kind),['singleMatchCapture','singleMatchCapture']);
});

test('classifier exposes two legal floor targets as a neutral private decision',()=>{
  const initial=stateWith({floor:cards('m2-2','m2-3'),human:api.makePlayer({hand:[card('m2-1')]})});
  const state=extractedEngine.applyNormalTurnAction(initial,{type:'playCard',actorId:'playerA',cardId:'m2-1'}).state;
  const outcome=extractedEngine.classifyTurnOutcome(state,{actorId:'playerA'});
  assert.equal(outcome.kind,'floorTargetDecision');
  assert.equal(outcome.requiresDecision,true);
  assert.deepEqual(outcome.targetIds,['m2-2','m2-3']);
  assert.equal(outcome.actorId,'playerA');
});

test('classifier distinguishes Jjok, Ppeok/Ssa-da, and Ttadak candidates',()=>{
  const cases=[
    {kind:'jjokCandidate',floor:[card('m8-1')],played:'m5-1',drawn:'m5-2'},
    {kind:'ppeokSsaDaCandidate',floor:[card('m4-1')],played:'m4-2',drawn:'m4-3'},
    {kind:'ttadakCandidate',floor:cards('m3-1','m3-2'),played:'m3-3',drawn:'m3-4',target:'m3-1'}
  ];
  for(const fixture of cases){
    const result=classifyPlayedAndDrawn(stateWith({
      deck:[card(fixture.drawn)],floor:fixture.floor,human:api.makePlayer({hand:[card(fixture.played)]})
    }),'playerA',fixture.played,fixture.target||null);
    assert.equal(result.outcome.kind,fixture.kind);
  }
});

test('classifier distinguishes self-Ppeok and other floor-stack interactions',()=>{
  for(const [owner,kind] of [['playerA','selfPpeokCandidate'],['playerB','floorStackInteraction']]){
    const stack=cards('m2-1','m2-2','m2-3');
    const result=classifyPlayedAndDrawn(stateWith({
      deck:[card('m8-1')],floor:stack,human:api.makePlayer({hand:[card('m2-4')]}),
      floorStacks:{2:{month:2,cardIds:stack.map(item=>item.id),source:'ppeok',owner}}
    }),'playerA','m2-4','m2-3');
    assert.equal(result.outcome.kind,kind);
    assert.equal(result.outcome.stackMonth,2);
  }
});

test('registered floor stacks are one automatic semantic target for hand plays and deck draws',()=>{
  for(const source of ['initial','ppeok'])for(const owner of source==='initial'?[null]:['playerA','playerB']){
    const stack=cards('m2-1','m2-2','m2-3'),floorStacks={2:{month:2,cardIds:stack.map(item=>item.id),source,owner}};
    let handState=stateWith({turn:'playerA',deck:[card('m8-1')],floor:stack,human:api.makePlayer({hand:[card('m2-4')]}),floorStacks});
    api.initFloorSlots(handState);
    const played=extractedEngine.applyNormalTurnAction(handState,{type:'playCard',actorId:'playerA',cardId:'m2-4'});
    assert.equal(played.pendingDecision,null);assert.equal(played.state.pendingTurn.phase,'awaitingDraw');
    assert.equal(played.events[0].targetId,'m2-3');

    let drawState=stateWith({turn:'playerA',deck:[card('m2-4')],floor:stack,human:api.makePlayer({bombFreeTurns:1}),floorStacks});
    api.initFloorSlots(drawState);
    drawState=extractedEngine.applyNormalTurnAction(drawState,{type:'useBombBlank',actorId:'playerA'}).state;
    const drawn=extractedEngine.applyNormalTurnAction(drawState,{type:'drawNextCard',actorId:'playerA'});
    assert.equal(drawn.pendingDecision,null);assert.equal(drawn.state.pendingTurn.phase,'awaitingNormalResolution');
    assert.equal(drawn.events[0].targetId,'m2-3');
    assert.equal(extractedEngine.classifyTurnOutcome(drawn.state,{actorId:'playerA'}).kind,source==='ppeok'&&owner==='playerA'?'selfPpeokCandidate':'floorStackInteraction');
  }
});

test('two ordinary same-month floor cards still require an authoritative target choice',()=>{
  const state=stateWith({turn:'playerA',floor:cards('m2-2','m2-3'),human:api.makePlayer({hand:[card('m2-1')]})});
  api.initFloorSlots(state);
  const played=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m2-1'});
  assert.equal(played.state.pendingTurn.phase,'awaitingFloorTarget');
  assert.equal(played.pendingDecision.type,'chooseFloorTarget');
  assert.deepEqual(played.pendingDecision.legalTargetIds,['m2-2','m2-3']);
});

test('classifier identifies Bomb eligibility without mutating the hand',()=>{
  const hand=cards('m6-1','m6-2','m6-3');
  const state=stateWith({floor:[card('m6-4')],human:api.makePlayer({hand,hiddenTripleMonths:[6]})});
  const before=JSON.stringify(state);
  const outcome=extractedEngine.classifyTurnOutcome(state,{actorId:'playerA',cardId:'m6-1'});
  assert.equal(outcome.kind,'bombEligible');
  assert.equal(outcome.actorId,'playerA');
  assert.equal(JSON.stringify(state),before);
});

test('classification survives JSON round-trip and contains only neutral identities',()=>{
  const pending=classifyPlayedAndDrawn(stateWith({
    deck:[card('m5-2')],floor:[card('m8-1')],human:api.makePlayer({hand:[card('m5-1')]})
  }),'playerA','m5-1').state;
  const before=extractedEngine.classifyTurnOutcome(pending,{actorId:'playerA'});
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(pending))));
  const after=extractedEngine.classifyTurnOutcome(restored,{actorId:'playerA'});
  assert.deepEqual(after,before);
  assert.equal(after.kind,'jjokCandidate');
  assert.equal(JSON.stringify(after).includes('human'),false);
  assert.equal(JSON.stringify(after).includes('ai'),false);
});

test('playerA and playerB receive equivalent neutral classifications',()=>{
  const playerA=classifyPlayedAndDrawn(stateWith({
    deck:[card('m3-1')],floor:[card('m1-1')],human:api.makePlayer({hand:[card('m2-1')]})
  }),'playerA','m2-1').outcome;
  const playerB=classifyPlayedAndDrawn(stateWith({
    turn:'playerB',deck:[card('m3-1')],floor:[card('m1-1')],ai:api.makePlayer({hand:[card('m2-1')]})
  }),'playerB','m2-1').outcome;
  assert.deepEqual({...playerA,actorId:'neutral'},{...playerB,actorId:'neutral'});
});

test('fresh authoritative turn and action validation use neutral player IDs',()=>{
  const playerAState=stateWith({human:api.makePlayer({hand:[card('m2-1')]})});
  assert.equal(playerAState.turn,'playerA');
  assert.doesNotThrow(()=>extractedEngine.applyNormalTurnAction(playerAState,{type:'playCard',actorId:'playerA',cardId:'m2-1'}));
  assert.throws(()=>extractedEngine.applyNormalTurnAction(playerAState,{type:'playCard',actorId:'playerB',cardId:'m2-1'}),/not playerB's turn/);

  const playerBState=stateWith({turn:'playerB',ai:api.makePlayer({hand:[card('m3-1')]})});
  assert.doesNotThrow(()=>extractedEngine.applyNormalTurnAction(playerBState,{type:'playCard',actorId:'playerB',cardId:'m3-1'}));
  assert.throws(()=>extractedEngine.applyNormalTurnAction(playerBState,{type:'playCard',actorId:'playerA',cardId:'m3-1'}),/not playerA's turn/);
});

test('new Ppeok stacks store a neutral owner and preserve Self-Ppeok ownership',()=>{
  const stackCards=cards('m4-1','m4-2','m4-3');
  const state=useState(stateWith({floor:[stackCards[0]]}));
  api.initFloorSlots(state);
  api.makePpeokStack('human',stackCards);
  assert.equal(state.floorStacks[4].owner,'playerA');

  const pending=classifyPlayedAndDrawn(stateWith({
    deck:[card('m8-1')],floor:stackCards,human:api.makePlayer({hand:[card('m4-4')]}),
    floorStacks:state.floorStacks
  }),'playerA','m4-4','m4-3');
  assert.equal(pending.outcome.kind,'selfPpeokCandidate');
});

test('neutral turn and stack owner survive serialization exactly',()=>{
  const state=stateWith({
    turn:'playerB',floor:cards('m7-1','m7-2','m7-3'),
    floorStacks:{7:{month:7,cardIds:['m7-1','m7-2','m7-3'],source:'ppeok',owner:'playerB'}}
  });
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(state))));
  assert.equal(restored.turn,'playerB');
  assert.equal(restored.floorStacks[7].owner,'playerB');
  assert.equal(JSON.stringify(restored),JSON.stringify(state));
});

test('deserialization strictly rejects legacy authoritative identity values',()=>{
  assert.throws(()=>extractedEngine.deserializeGameState({...stateWith(),turn:'human'}),/state.turn must be playerA or playerB/);
  assert.throws(()=>extractedEngine.deserializeGameState({
    ...stateWith(),floorStacks:{2:{month:2,cardIds:[],source:'ppeok',owner:'ai'}}
  }),/Floor stack owner must be a neutral player ID/);
  assert.throws(()=>extractedEngine.deserializeGameState({
    ...stateWith(),matchContext:{lastScoreBySide:{human:0,ai:0},nagariCarryPower:0}
  }),/lastScoreBySide.*neutral player IDs/);
});

test('authoritative identity-bearing fields contain no human or ai values',()=>{
  const state=stateWith({
    turn:'playerA',winner:'playerB',specialWinner:'playerB',
    floorStacks:{5:{month:5,cardIds:['m5-1','m5-2','m5-3'],source:'ppeok',owner:'playerA'}},
    pendingTurn:{phase:'awaitingDraw',actorId:'playerA',nextResolution:null,played:{card:card('m2-1'),matchIds:[],targetId:null,landingSlot:0,resolved:false},drawn:null}
  });
  const legacyIdentityPaths=[];
  function scan(value,path='state'){
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      const itemPath=`${path}.${key}`;
      if(['turn','winner','specialWinner','owner','actorId','playerId'].includes(key)&&(item==='human'||item==='ai'))legacyIdentityPaths.push(itemPath);
      if(key==='lastScoreBySide'){
        for(const playerId of Object.keys(item))if(playerId==='human'||playerId==='ai')legacyIdentityPaths.push(`${itemPath}.${playerId}`);
      }
      scan(item,itemPath);
    }
  }
  scan(state);
  assert.deepEqual(legacyIdentityPaths,[]);
  assert.deepEqual(Object.keys(state.matchContext.lastScoreBySide).sort(),['playerA','playerB']);
});

function specialFixture(actorId,{floor,handCard,drawCard,captured=[],floorStacks={},targetId=null,remainingHand=[]}){
  const side=actorId==='playerA'?'human':'ai';
  const other=side==='human'?'ai':'human';
  let state=stateWith({
    turn:actorId,deck:drawCard?[drawCard]:[],floor,
    [side]:api.makePlayer({hand:[handCard,...remainingHand]}),[other]:api.makePlayer({captured}),floorStacks
  });
  if(!Object.keys(state.floorSlotByCard).length)api.initFloorSlots(state);
  state=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId,cardId:handCard.id,targetId}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId}).state;
  return extractedEngine.applySpecialTurnAction(state,{type:'resolveSpecialTurn',actorId});
}

function assertSpecialWireSafe(result,actorId){
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(result.state))));
  assert.equal(JSON.stringify(restored),JSON.stringify(result.state));
  assert.equal(result.events.every(event=>event.audience==='public'),true);
  assert.equal(result.events.every(event=>event.actorId===actorId),true);
  assert.equal(result.events.some(event=>Object.hasOwn(event,'hand')),false);
  assert.doesNotThrow(()=>JSON.stringify(result.events));
}

test('engine forms Ppeok/Ssa-da stacks for both neutral players with legacy ordering and slots',()=>{
  for(const actorId of ['playerA','playerB']){
    const result=specialFixture(actorId,{
      floor:[card('m4-1')],handCard:card('m4-2'),drawCard:card('m4-3')
    });
    const stack=result.state.floorStacks[4];
    const side=actorId==='playerA'?'human':'ai';
    assert.deepEqual(stack.cardIds,['m4-1','m4-2','m4-3']);
    assert.equal(stack.owner,actorId);
    assert.equal(result.state[side].ppeoks,1);
    assert.equal(new Set(stack.cardIds.map(id=>result.state.floorSlotByCard[id])).size,1);
    assert.deepEqual(result.events.map(event=>event.type),['ppeokFormed','firstPpeokAwarded','specialResolved']);
    assertSpecialWireSafe(result,actorId);
  }
});

test('engine Self-Ppeok captures the full own stack and transfers exactly one physical Pi',()=>{
  for(const actorId of ['playerA','playerB']){
    const stackCards=cards('m2-1','m2-2','m2-3');
    const result=specialFixture(actorId,{
      floor:stackCards,handCard:card('m2-4'),drawCard:card('m8-1'),
      captured:cards('m12-4','m7-3'),
      floorStacks:{2:{month:2,cardIds:stackCards.map(item=>item.id),source:'ppeok',owner:actorId}},targetId:'m2-3'
    });
    const side=actorId==='playerA'?'human':'ai';
    const other=side==='human'?'ai':'human';
    assert.equal(result.state.floorStacks[2],undefined);
    assert.equal(result.state[side].captured.filter(item=>item.month===2).length,4);
    assert.deepEqual(result.events.filter(event=>event.type==='piTransferred').map(event=>event.cardId),['m7-3']);
    assert.deepEqual(result.state[other].captured.map(item=>item.id),['m12-4']);
    assert.deepEqual(result.events.map(event=>event.type),['floorStackRemoved','cardsCaptured','piTransferred','cardLanded','specialResolved']);
    assertSpecialWireSafe(result,actorId);
  }
});

test('engine Self-Ppeok gracefully transfers only available Pi',()=>{
  const stackCards=cards('m6-1','m6-2','m6-3');
  const result=specialFixture('playerA',{
    floor:stackCards,handCard:card('m6-4'),drawCard:card('m8-1'),captured:[card('m12-4')],
    floorStacks:{6:{month:6,cardIds:stackCards.map(item=>item.id),source:'ppeok',owner:'playerA'}},targetId:'m6-3'
  });
  assert.deepEqual(result.events.filter(event=>event.type==='piTransferred').map(event=>event.cardId),['m12-4']);
});

test('capturing a Ppeok stack emits no transfer when the opponent has no eligible Single',()=>{
  const stack=cards('m6-1','m6-2','m6-3');
  const result=specialFixture('playerA',{floor:stack,handCard:card('m6-4'),drawCard:card('m8-1'),captured:[],floorStacks:{6:{month:6,cardIds:stack.map(item=>item.id),source:'ppeok',owner:'playerA'}},targetId:'m6-3'});
  assert.equal(result.events.filter(event=>event.type==='piTransferred').length,0);
  assert.equal(result.state.human.captured.filter(item=>item.month===6).length,4);
});

test('engine Jjok captures its pair and transfers one Pi for both players',()=>{
  for(const actorId of ['playerA','playerB']){
    const result=specialFixture(actorId,{
      floor:[card('m8-1')],handCard:card('m5-1'),drawCard:card('m5-2'),captured:cards('m12-4','m7-3')
    });
    const side=actorId==='playerA'?'human':'ai';
    assert.deepEqual(result.state[side].captured.filter(item=>item.month===5).map(item=>item.id),['m5-1','m5-2']);
    assert.deepEqual(result.events.map(event=>event.type),['cardsCaptured','piTransferred','specialResolved']);
    assert.equal(result.events.find(event=>event.type==='piTransferred').cardId,'m7-3');
    assertSpecialWireSafe(result,actorId);
  }
});

test('engine Ttadak takes four cards without an intermediate drawn-target decision',()=>{
  for(const actorId of ['playerA','playerB']){
    const result=specialFixture(actorId,{
      floor:cards('m3-1','m3-2'),handCard:card('m3-3'),drawCard:card('m3-4'),captured:[card('m7-3')],targetId:'m3-1'
    });
    const side=actorId==='playerA'?'human':'ai';
    assert.equal(result.outcome.kind,'ttadakCandidate');
    assert.equal(result.state[side].captured.filter(item=>item.month===3).length,4);
    assert.equal(result.state.floor.some(item=>item.month===3),false);
    assert.deepEqual(result.events.map(event=>event.type),['cardsCaptured','piTransferred','specialResolved']);
    assertSpecialWireSafe(result,actorId);
  }
});

test('Jjok applies Sweep once in rule order with ordinary then double-Pi fallback',()=>{
  for(const actorId of ['playerA','playerB']){
    const result=specialFixture(actorId,{
      floor:[],handCard:card('m5-1'),drawCard:card('m5-2'),remainingHand:[card('m9-3')],
      captured:cards('m7-3','m12-4')
    });
    const transfers=result.events.filter(event=>event.type==='piTransferred');
    assert.deepEqual(transfers.map(event=>[event.reason,event.cardId]),[['jjok','m7-3'],['sweep','m12-4']]);
    assert.deepEqual(result.events.map(event=>event.type),['cardsCaptured','piTransferred','sweepTriggered','piTransferred','specialResolved']);
    assert.equal(Object.keys(result.state.floorSlotByCard).length,0);
    assertSpecialWireSafe(result,actorId);

    const completed=extractedEngine.applyNormalTurnAction(result.state,{type:'completeTurn',actorId});
    assert.equal(completed.events.some(event=>event.type==='sweepTriggered'||event.type==='piTransferred'),false);
  }
});

test('Ttadak applies Sweep when its capture empties a live floor',()=>{
  const result=specialFixture('playerA',{
    floor:cards('m3-1','m3-2'),handCard:card('m3-3'),drawCard:card('m3-4'),targetId:'m3-1',
    remainingHand:[card('m9-3')],captured:cards('m7-3','m8-3')
  });
  assert.deepEqual(result.events.filter(event=>event.type==='piTransferred').map(event=>event.reason),['ttadak','sweep']);
  assert.deepEqual(result.events.map(event=>event.type),['cardsCaptured','piTransferred','sweepTriggered','piTransferred','specialResolved']);
});

test('Self-Ppeok resolves its remaining capture before Sweep',()=>{
  const stack=cards('m2-1','m2-2','m2-3');
  const result=specialFixture('playerA',{
    floor:[...stack,card('m8-2')],handCard:card('m2-4'),drawCard:card('m8-1'),targetId:'m2-3',
    remainingHand:[card('m9-3')],captured:cards('m7-3','m10-3','m11-3'),
    floorStacks:{2:{month:2,cardIds:stack.map(item=>item.id),source:'ppeok',owner:'playerA'}}
  });
  assert.deepEqual(result.events.map(event=>event.type),[
    'floorStackRemoved','cardsCaptured','piTransferred','cardsCaptured','sweepTriggered','piTransferred','specialResolved'
  ]);
  assert.deepEqual(result.events.filter(event=>event.type==='piTransferred').map(event=>event.reason),['selfPpeok','sweep']);
  assert.equal(result.state.floor.length,0);
});

test('Sweep triggers without fabricating a transfer when the opponent has no Pi',()=>{
  const result=specialFixture('playerA',{
    floor:[],handCard:card('m5-1'),drawCard:card('m5-2'),remainingHand:[card('m9-3')],captured:[]
  });
  assert.deepEqual(result.events.map(event=>event.type),['cardsCaptured','sweepTriggered','specialResolved']);
  assert.equal(result.events.some(event=>event.type==='piTransferred'),false);
});

test('production extracted-special presenter cannot invoke the legacy Sweep bridge',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const presenter=source.slice(source.indexOf('async function resolveExtractedSpecialTurn'),source.indexOf('async function playFullTurn'));
  assert.equal(presenter.includes('applySweepIfNeeded'),false);
  assert.equal(presenter.includes('applySpecialAction'),true);
});

function shakeState(actorId='playerA',{floor=[],extraHand=[]}={}){
  const side=actorId==='playerA'?'human':'ai';
  const month=actorId==='playerA'?6:7;
  const triple=cards(`m${month}-1`,`m${month}-2`,`m${month}-3`);
  const state=stateWith({turn:actorId,floor,[side]:api.makePlayer({hand:[...triple,...extraHand]})});
  return {state:extractedEngine.initializeShakeEligibility(state),side,month,triple};
}

test('initial triples become eligible without creating an opening Shake prompt',()=>{
  for(const actorId of ['playerA','playerB']){
    const {state,side,month}=shakeState(actorId);
    assert.deepEqual(state[side].hiddenTripleMonths,[month]);
    assert.equal(state.pendingDecision,undefined);
  }
});

test('attempting a triple card creates a private serializable Shake decision',()=>{
  const {state,month,triple}=shakeState();
  const result=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:triple[0].id});
  assert.deepEqual(result.pendingDecision,{
    type:'shakeDecision',audience:'player-private',playerId:'playerA',month,cardId:triple[0].id,choices:['shake','keepSecret']
  });
  assert.deepEqual(result.events,[]);
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(result.state))));
  assert.deepEqual(restored.pendingDecision,result.state.pendingDecision);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(restored,{type:'declareShake',actorId:'playerB'}),/not playerB's turn|another player/);
});

test('attempting an unrelated card does not create a Shake decision',()=>{
  const unrelated=card('m9-3');
  const {state}=shakeState('playerA',{extraHand:[unrelated]});
  const result=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:unrelated.id});
  assert.equal(result.pendingDecision,null);
  assert.equal(result.state.pendingDecision,undefined);
});

test('declaring Shake mutates authority, emits public neutral event, and resumes play for both players',()=>{
  for(const actorId of ['playerA','playerB']){
    const {state,side,month,triple}=shakeState(actorId);
    const attempted=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId,cardId:triple[0].id});
    const declared=extractedEngine.applyNormalTurnAction(attempted.state,{type:'declareShake',actorId});
    assert.equal(declared.state[side].shakes,1);
    assert.deepEqual(declared.state[side].shakenMonths,[month]);
    assert.deepEqual(declared.state[side].hiddenTripleMonths,[]);
    assert.deepEqual(declared.events,[{type:'shakeDeclared',audience:'public',actorId,month,cardIds:triple.map(card=>card.id),shakeCount:1,declarationMultiplier:2,multiplier:2}]);
    assert.deepEqual(declared.state[side].revealedShakeSets,[{month,cardIds:triple.map(card=>card.id),declarationMultiplier:2}]);
    assert.equal(declared.resumePlay.cardId,triple[0].id);
    const played=extractedEngine.applyNormalTurnAction(declared.state,{type:'playCard',actorId,cardId:declared.resumePlay.cardId});
    assert.equal(played.events[0].type,'cardPlayed');
    assert.throws(()=>extractedEngine.applyNormalTurnAction(declared.state,{type:'declareShake',actorId}),/No Shake decision/);
  }
});

test('KEEP SECRET is silent, resumes play, and preserves immediate Bomb eligibility',()=>{
  const {state,side,month,triple}=shakeState('playerA',{floor:[card('m6-4')]});
  const attempted=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:triple[0].id});
  const kept=extractedEngine.applyNormalTurnAction(attempted.state,{type:'keepShakeSecret',actorId:'playerA'});
  assert.equal(kept.state[side].shakes,0);
  assert.deepEqual(kept.state[side].hiddenTripleMonths,[month]);
  assert.deepEqual(kept.events,[]);
  assert.equal(
    JSON.stringify(extractedEngine.projectStateForViewer(kept.state,'playerB')),
    JSON.stringify(extractedEngine.projectStateForViewer(state,'playerB'))
  );
  assert.equal(extractedEngine.classifyTurnOutcome(kept.state,{actorId:'playerA',cardId:triple[0].id}).kind,'bombEligible');
  const declined=extractedEngine.applyNormalTurnAction(kept.state,{type:'declineBomb',actorId:'playerA'});
  const played=extractedEngine.applyNormalTurnAction(declined.state,{type:'playCard',actorId:'playerA',cardId:declined.resumePlay.cardId,targetId:'m6-4'});
  assert.equal(played.events[0].type,'cardPlayed');
});

test('Shake viewer projection reveals the decision only to its acting player',()=>{
  const opponentCard=card('m10-1');
  const {state,triple,month}=shakeState('playerA');
  state.ai.hand=[opponentCard];
  const pending=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:triple[0].id}).state;
  const actorView=extractedEngine.projectStateForViewer(pending,'playerA');
  const opponentView=extractedEngine.projectStateForViewer(pending,'playerB');
  assert.equal(actorView.pendingDecision.month,month);
  assert.equal(actorView.pendingDecision.cardId,triple[0].id);
  assert.equal(JSON.stringify(actorView).includes(opponentCard.id),false);
  assert.equal(actorView.ai.hand,undefined);
  assert.equal(actorView.ai.handCount,1);
  assert.equal(opponentView.pendingDecision,undefined);
  assert.equal(opponentView.human.hiddenTripleMonths.length,0);
  assert.equal(opponentView.human.hand,undefined);
  assert.equal(opponentView.human.handCount,triple.length);
  assert.equal(opponentView.deck,undefined);
  for(const hiddenCard of triple)assert.equal(JSON.stringify(opponentView).includes(hiddenCard.id),false);
});

test('Shake sound presentation is driven only by public shakeDeclared events',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const humanFlow=source.slice(source.indexOf("const attempted=applyNormalAction(normalAction('human'"),source.indexOf('const matches=matchesFor(card)'));
  const shakeButton=source.slice(source.indexOf("if(els.shakeBtn)"),source.indexOf("if(els.keepSecretBtn)"));
  assert.match(humanFlow,/presentShakeDeclaration\(declared\.events(?:,epoch)?\)/);
  assert.equal(shakeButton.includes('playShakeSound'),false);
});

test('Shake responses reject missing and duplicate decisions',()=>{
  const {state,triple}=shakeState();
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'keepShakeSecret',actorId:'playerA'}),/No Shake decision/);
  const pending=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:triple[0].id}).state;
  const answered=extractedEngine.applyNormalTurnAction(pending,{type:'keepShakeSecret',actorId:'playerA'}).state;
  assert.throws(()=>extractedEngine.applyNormalTurnAction(answered,{type:'keepShakeSecret',actorId:'playerA'}),/No Shake decision/);
});

function pendingBomb(actorId='playerA',{captured=[],extraHand=[],deck=[]}={}){
  const side=actorId==='playerA'?'human':'ai';
  const other=side==='human'?'ai':'human';
  const month=actorId==='playerA'?6:7;
  const triple=cards(`m${month}-1`,`m${month}-2`,`m${month}-3`);
  let state=stateWith({
    turn:actorId,deck,floor:[card(`m${month}-4`)],
    [side]:api.makePlayer({hand:[...triple,...extraHand]}),[other]:api.makePlayer({captured})
  });
  api.initFloorSlots(state);
  state=extractedEngine.initializeShakeEligibility(state);
  state=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId,cardId:triple[0].id}).state;
  const kept=extractedEngine.applyNormalTurnAction(state,{type:'keepShakeSecret',actorId});
  return {state:kept.state,decision:kept.pendingDecision,side,other,month,triple};
}

function assertBombWireSafe(state){
  const restored=extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(state))));
  assert.equal(JSON.stringify(restored),JSON.stringify(state));
  return restored;
}

test('KEEP SECRET creates a private Bomb decision for both neutral players',()=>{
  for(const actorId of ['playerA','playerB']){
    const {state,decision,month,triple}=pendingBomb(actorId);
    assert.deepEqual(decision,{
      type:'bombDecision',audience:'player-private',playerId:actorId,month,
      cardIds:triple.map(item=>item.id),floorCardId:`m${month}-4`,choices:['bomb','playNormally']
    });
    assertBombWireSafe(state);
    const actorView=extractedEngine.projectStateForViewer(state,actorId);
    const opponentView=extractedEngine.projectStateForViewer(state,actorId==='playerA'?'playerB':'playerA');
    assert.equal(actorView.pendingDecision.type,'bombDecision');
    assert.deepEqual(actorView.legalActions,['declareBomb','declineBomb']);
    assert.equal(opponentView.pendingDecision,undefined);
    for(const hidden of triple)assert.equal(JSON.stringify(opponentView).includes(hidden.id),false);
  }
});

test('declared Bomb atomically captures four cards, frees its slot, and grants two blanks',()=>{
  for(const actorId of ['playerA','playerB']){
    const {state,side,other,month,triple}=pendingBomb(actorId,{captured:[card('m10-3')],extraHand:[card('m9-3')]});
    const floorId=`m${month}-4`,floorSlot=state.floorSlotByCard[floorId];
    assert.equal(Number.isInteger(floorSlot),true);
    const result=extractedEngine.applyNormalTurnAction(state,{type:'declareBomb',actorId});
    assert.equal(result.state[side].hand.length,1);
    assert.deepEqual(result.state[side].captured.filter(item=>item.month===month).map(item=>item.id),[...triple.map(item=>item.id),floorId]);
    assert.equal(result.state.floorSlotByCard[floorId],undefined);
    assert.equal(result.state[side].bombs,1);
    assert.equal(result.state[side].bombFreeTurns,2);
    assert.equal(result.state[other].captured.length,0);
    assert.deepEqual(result.events.map(event=>event.type),[
      'bombDeclared','bombCardsPlayed','cardsCaptured','piTransferred','bombBlankTurnsGranted','specialResolved'
    ]);
    assert.equal(result.events.find(event=>event.type==='piTransferred').reason,'bomb');
    assert.equal(result.events.every(event=>event.audience==='public'&&event.actorId===actorId),true);
    assert.equal(result.state.pendingTurn.phase,'awaitingDraw');
    assertBombWireSafe(result.state);
  }
});

test('Bomb Pi transfer falls back to double Pi and never fabricates a transfer',()=>{
  let bomb=pendingBomb('playerA',{captured:[card('m12-4')]}).state;
  let result=extractedEngine.applyNormalTurnAction(bomb,{type:'declareBomb',actorId:'playerA'});
  assert.equal(result.events.find(event=>event.type==='piTransferred').cardId,'m12-4');

  bomb=pendingBomb('playerA',{captured:[]}).state;
  result=extractedEngine.applyNormalTurnAction(bomb,{type:'declareBomb',actorId:'playerA'});
  assert.equal(result.events.some(event=>event.type==='piTransferred'),false);
});

test('declining Bomb is opponent-invisible and resumes the intended real-card play',()=>{
  const initial=pendingBomb('playerA',{extraHand:[card('m9-3')]}).state;
  const baseline={...initial}; delete baseline.pendingDecision;
  const declined=extractedEngine.applyNormalTurnAction(initial,{type:'declineBomb',actorId:'playerA'});
  assert.deepEqual(declined.events,[]);
  assert.equal(JSON.stringify(extractedEngine.projectStateForViewer(declined.state,'playerB')),JSON.stringify(extractedEngine.projectStateForViewer(baseline,'playerB')));
  const played=extractedEngine.applyNormalTurnAction(declined.state,{type:'playCard',actorId:'playerA',cardId:declined.resumePlay.cardId,targetId:'m6-4'});
  assert.equal(played.events[0].type,'cardPlayed');
});

test('Bomb decisions reject wrong, duplicate, missing, and stale responses',()=>{
  const {state}=pendingBomb();
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'declareBomb',actorId:'playerB'}),/not playerB's turn|another player/);
  const declared=extractedEngine.applyNormalTurnAction(state,{type:'declareBomb',actorId:'playerA'});
  assert.throws(()=>extractedEngine.applyNormalTurnAction(declared.state,{type:'declareBomb',actorId:'playerA'}),/No Bomb decision/);
  const stale=JSON.parse(JSON.stringify(state)); stale.floor=[]; stale.floorSlotByCard={};
  assert.throws(()=>extractedEngine.applyNormalTurnAction(stale,{type:'declareBomb',actorId:'playerA'}),/stale/);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(stateWith(),{type:'declineBomb',actorId:'playerA'}),/No Bomb decision/);
});

test('Shake declaration consumes Bomb eligibility',()=>{
  const {state,triple}=shakeState('playerA',{floor:[card('m6-4')]});
  const attempted=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:triple[0].id});
  const declared=extractedEngine.applyNormalTurnAction(attempted.state,{type:'declareShake',actorId:'playerA'});
  assert.equal(extractedEngine.classifyTurnOutcome(declared.state,{actorId:'playerA',cardId:triple[0].id}).kind,'playReady');
  assert.throws(()=>extractedEngine.applyNormalTurnAction(declared.state,{type:'requestBombDecision',actorId:'playerA',cardId:triple[0].id}),/not Bomb eligible/);
});

test('Bomb blanks are optional, consume exactly twice, keep the hand, and enter deck draw',()=>{
  let state=stateWith({
    deck:cards('m8-1','m9-1'),human:api.makePlayer({hand:[card('m10-1')],bombFreeTurns:2})
  });
  let view=extractedEngine.projectStateForViewer(state,'playerA');
  assert.deepEqual(view.legalActions,['attemptPlayCard','useBombBlank']);
  const realPlay=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m10-1'});
  assert.equal(realPlay.state.human.bombFreeTurns,2);
  const handBefore=state.human.hand.map(item=>item.id);
  for(const remaining of [1,0]){
    let used=extractedEngine.applyNormalTurnAction(state,{type:'useBombBlank',actorId:'playerA'});
    assert.equal(used.state.human.bombFreeTurns,remaining);
    assert.deepEqual(used.state.human.hand.map(item=>item.id),handBefore);
    assert.equal(used.state.pendingTurn.phase,'awaitingDraw');
    state=assertBombWireSafe(used.state);
    let drawn=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'});
    assert.equal(drawn.events[0].type,'deckCardRevealed');
    assert.equal(drawn.state.pendingTurn.nextResolution,'drawn');
    state=assertBombWireSafe(drawn.state);
    let resolved=extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'drawn'});
    state=extractedEngine.applyNormalTurnAction(resolved.state,{type:'completeTurn',actorId:'playerA'}).state;
  }
  assert.equal(state.human.bombFreeTurns,0);
  state=assertBombWireSafe(state);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(state,{type:'useBombBlank',actorId:'playerA'}),/No Bomb blank turns/);
  assert.deepEqual(state.human.hand.map(item=>item.id),handBefore);
});

test('Bomb sound can run only after an accepted public bombDeclared event',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const wrapper=source.slice(source.indexOf('async function executeBombTurn'),source.indexOf('async function resolveCombinedTurn'));
  assert.equal(wrapper.indexOf("type:'declareBomb'")<wrapper.indexOf('animateBombSlap'),true);
  assert.equal(source.slice(source.indexOf('if(els.bombBtn)'),source.indexOf('if(els.playOneBtn)')).includes('playBombSound'),false);
});

function openingState({humanHand=[],aiHand=[]}={}){
  return stateWith({human:api.makePlayer({hand:humanHand}),ai:api.makePlayer({hand:aiHand})});
}

test('opening without Chongtong remains non-terminal and initializes hidden triples',()=>{
  const initial=openingState({humanHand:cards('m5-1','m5-2','m5-3','m8-1')});
  const before=assertBombWireSafe(initial);
  const result=extractedEngine.resolveOpeningState(before);
  assert.deepEqual(result.events,[]);
  assert.equal(result.state.winner,null);
  assert.equal(result.state.specialWinner,null);
  assert.equal(result.state.openingResolved,true);
  assert.equal(result.state.openingOutcome,null);
  assert.deepEqual(result.state.human.hiddenTripleMonths,[5]);
  assert.equal(result.state.pendingDecision.type,'openingTripleDecision');
  assert.deepEqual(result.state.pendingDecision.choices,['shake','keepSecret']);
  assertBombWireSafe(result.state);
});

test('Conquer gives Player A an immediate neutral 7-point terminal result',()=>{
  const unrelated=card('m9-1');
  const result=extractedEngine.resolveOpeningState(openingState({
    humanHand:cards('m6-1','m6-2','m6-3','m6-4'),aiHand:[unrelated]
  }));
  assert.equal(result.state.winner,'playerA');
  assert.equal(result.state.specialWinner,'playerA');
  assert.deepEqual(result.state.openingOutcome,{type:'chongtong',actorId:'playerA',month:6,points:7,cardIds:['m6-1','m6-2','m6-3','m6-4']});
  assert.deepEqual(result.events,[{type:'chongtongDeclared',audience:'public',actorId:'playerA',month:6,points:7,cardIds:['m6-1','m6-2','m6-3','m6-4']}]);
  assert.equal(JSON.stringify(result.events).includes(unrelated.id),false);
  assertBombWireSafe(result.state);
});

test('Chongtong gives Player B the equivalent immediate terminal result',()=>{
  const result=extractedEngine.resolveOpeningState(openingState({
    humanHand:[card('m9-1')],aiHand:cards('m7-1','m7-2','m7-3','m7-4')
  }));
  assert.equal(result.state.winner,'playerB');
  assert.equal(result.state.specialWinner,'playerB');
  assert.deepEqual(result.events,[{type:'chongtongDeclared',audience:'public',actorId:'playerB',month:7,points:7,cardIds:['m7-1','m7-2','m7-3','m7-4']}]);
});

test('simultaneous representable Chongtong preserves current Player A precedence',()=>{
  const result=extractedEngine.resolveOpeningState(openingState({
    humanHand:cards('m6-1','m6-2','m6-3','m6-4'),aiHand:cards('m7-1','m7-2','m7-3','m7-4')
  }));
  assert.equal(result.state.winner,'playerA');
  assert.equal(result.state.openingOutcome.month,6);
  assert.equal(result.events[0].actorId,'playerA');
});

test('terminal Chongtong exposes no normal, Shake, or Bomb actions',()=>{
  const result=extractedEngine.resolveOpeningState(openingState({humanHand:cards('m6-1','m6-2','m6-3','m6-4')}));
  for(const viewerId of ['playerA','playerB']){
    const view=extractedEngine.projectStateForViewer(result.state,viewerId);
    assert.equal(view.winner,'playerA');
    assert.equal(view.specialWinner,'playerA');
    assert.deepEqual(view.openingOutcome,{type:'chongtong',actorId:'playerA',month:6,points:7,cardIds:['m6-1','m6-2','m6-3','m6-4']});
    assert.deepEqual(view.legalActions,[]);
    for(const id of ['m6-1','m6-2','m6-3','m6-4'])assert.equal(view.openingOutcome.cardIds.includes(id),true);
  }
  assert.throws(()=>extractedEngine.applyNormalTurnAction(result.state,{type:'attemptPlayCard',actorId:'playerA',cardId:'m6-1'}),/already complete/);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(result.state,{type:'requestBombDecision',actorId:'playerA',cardId:'m6-1'}),/already complete/);
});

test('Chongtong fanfare and result presentation require the authoritative event',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const opening=source.slice(source.indexOf('async function processOpeningSpecials'),source.indexOf('async function revealAiShake'));
  assert.equal(opening.includes('fourMonths('),false);
  assert.equal(opening.includes("event=>event.type==='chongtongDeclared'"),true);
  assert.equal(opening.indexOf('presentChongtong(chongtong,epoch)')<opening.indexOf('function presentChongtong'),true);
  const presenter=opening.slice(opening.indexOf('function presentChongtong'));
  assert.equal(presenter.includes('playChongtongFanfare()'),true);
  assert.equal(presenter.includes('if(event.actorId===PLAYER_A)playChongtongFanfare()'),true);
  assert.equal(presenter.includes('state.winner='),false);
});

const sevenPointPi=()=>cards(
  'm1-3','m1-4','m2-3','m2-4','m3-3','m3-4','m4-3','m4-4',
  'm5-3','m5-4','m6-3','m6-4','m7-3','m7-4','m8-3','m8-4'
);
const goStopState=(actorId='playerA',captured=sevenPointPi(),overrides={})=>{
  const side=actorId==='playerA'?'human':'ai';
  return stateWith({turn:actorId,deck:[card('m12-1')],[side]:api.makePlayer({hand:[card('m11-3')],captured,...overrides})});
};
const wireRoundTrip=state=>extractedEngine.deserializeGameState(JSON.parse(JSON.stringify(extractedEngine.serializeGameState(state))));

test('Go/Stop eligibility uses seven points and strict improvement for both players',()=>{
  for(const actorId of ['playerA','playerB']){
    const below=extractedEngine.evaluateGoStop(goStopState(actorId,sevenPointPi().slice(0,15)),{actorId});
    assert.equal(below.pendingDecision,null);
    assert.equal(below.state.turn,actorId==='playerA'?'playerB':'playerA');

    let eligible=extractedEngine.evaluateGoStop(goStopState(actorId),{actorId});
    assert.deepEqual(eligible.pendingDecision,{type:'goStopDecision',audience:'player-private',playerId:actorId,score:7,previousGoScore:0,choices:['go','stop']});
    eligible=extractedEngine.evaluateGoStop(goStopState(actorId,sevenPointPi(),{lastGoScore:7}),{actorId});
    // The neutral match context is authoritative for the prior accepted GO.
    assert.equal(eligible.pendingDecision.score,7);
    const equal=goStopState(actorId); equal.matchContext.lastScoreBySide[actorId]=7;
    assert.equal(extractedEngine.evaluateGoStop(equal,{actorId}).pendingDecision,null);
    const lower=goStopState(actorId,sevenPointPi().slice(0,15)); lower.matchContext.lastScoreBySide[actorId]=7;
    assert.equal(extractedEngine.evaluateGoStop(lower,{actorId}).pendingDecision,null);
    const improved=goStopState(actorId,[...sevenPointPi(),card('m9-3')]); improved.matchContext.lastScoreBySide[actorId]=7;
    assert.equal(extractedEngine.evaluateGoStop(improved,{actorId}).pendingDecision.score,8);
  }
});

test('GO mutates authority once, emits a neutral public event, and hands off',()=>{
  for(const actorId of ['playerA','playerB']){
    const side=actorId==='playerA'?'human':'ai';
    const pending=extractedEngine.evaluateGoStop(goStopState(actorId),{actorId}).state;
    const restored=wireRoundTrip(pending);
    const result=extractedEngine.applyGoStopAction(restored,{type:'declareGo',actorId});
    assert.equal(result.state[side].go,1);
    assert.equal(result.state[side].lastGoScore,7);
    assert.equal(result.state.matchContext.lastScoreBySide[actorId],7);
    assert.equal(result.state.winner,null);
    assert.equal(result.state.turn,actorId==='playerA'?'playerB':'playerA');
    assert.deepEqual(result.events[0],{type:'goDeclared',audience:'public',actorId,goCount:1,score:7});
    assert.equal(result.events[1].type,'turnHandedOff');
    assert.deepEqual(wireRoundTrip(result.state),result.state);
    assert.throws(()=>extractedEngine.applyGoStopAction(result.state,{type:'declareGo',actorId}),/not .* turn|No Go\/Stop decision/);
  }
});

test('STOP owns the neutral terminal result and exact settlement formula',()=>{
  const captured=[...sevenPointPi(),...cards('m1-1','m3-1','m8-1','m2-1','m4-1','m5-1','m6-1','m7-1','m8-2','m9-1','m10-1')];
  const state=goStopState('playerA',captured,{shakes:1,bombs:1});
  state.matchContext.nagariCarryPower=1;
  state.ai=api.makePlayer({captured:[card('m11-3')],go:1,lastGoScore:3});
  const pending=extractedEngine.evaluateGoStop(state,{actorId:'playerA'}).state;
  const expected=extractedEngine.calculateSettlement({winner:pending.human,loser:pending.ai,nagariCarryPower:1});
  const result=extractedEngine.applyGoStopAction(pending,{type:'declareStop',actorId:'playerA'});
  assert.equal(result.state.winner,'playerA');
  assert.equal(result.state.specialWinner,null);
  assert.deepEqual(result.state.terminalResult,{type:'stop',winnerId:'playerA',score:expected.total,settlement:expected});
  assert.deepEqual(result.events.map(event=>event.type),['stopDeclared','handEnded']);
  assert.deepEqual(result.events[1].settlement,expected);
  assert.deepEqual(result.state.terminalResult.settlement.formulaSteps,expected.formulaSteps);
  assert.equal(expected.reasons.includes('Shake ×2'),true);
  assert.equal(expected.reasons.includes('Bomb ×2'),false);
  assert.equal(expected.reasons.includes('Meong-bak ×2'),true);
  assert.equal(expected.reasons.includes('Pi-bak ×2'),true);
  assert.equal(expected.reasons.includes('Gwang-bak ×2'),true);
  assert.equal(expected.reasons.includes('Go-bak ×2'),true);
  assert.equal(expected.reasons.includes('Nagari carry ×2'),true);
  assert.equal(result.state.matchContext.nagariCarryPower,0);
  assert.deepEqual(wireRoundTrip(result.state),result.state);
  assert.deepEqual(extractedEngine.projectStateForViewer(result.state,'playerA').legalActions,[]);
});

test('Go/Stop private decision is viewer-safe and rejects invalid responses',()=>{
  const hidden=card('m10-1');
  const pending=extractedEngine.evaluateGoStop(goStopState('playerA',sevenPointPi(),{hand:[hidden]}),{actorId:'playerA'}).state;
  const actorView=extractedEngine.projectStateForViewer(pending,'playerA');
  const opponentView=extractedEngine.projectStateForViewer(pending,'playerB');
  assert.deepEqual(actorView.legalActions,['declareGo','declareStop']);
  assert.equal(opponentView.pendingDecision,undefined);
  assert.deepEqual(opponentView.legalActions,[]);
  assert.equal(JSON.stringify(opponentView).includes(hidden.id),false);
  assert.throws(()=>extractedEngine.applyGoStopAction(pending,{type:'declareStop',actorId:'playerB'}),/not playerB's turn|another player/);
  assert.throws(()=>extractedEngine.applyGoStopAction(goStopState(),{type:'declareStop',actorId:'playerA'}),/No Go\/Stop decision/);
  const stale=wireRoundTrip(pending); stale.human.captured.pop();
  assert.throws(()=>extractedEngine.applyGoStopAction(stale,{type:'declareStop',actorId:'playerA'}),/stale/);
  assert.throws(()=>extractedEngine.applyGoStopAction(pending,{type:'invalid',actorId:'playerA'}),/Unsupported Go\/Stop action/);
});

test('multiple GO decisions reopen only after a strict score increase',()=>{
  let state=extractedEngine.evaluateGoStop(goStopState('playerA'),{actorId:'playerA'}).state;
  state=extractedEngine.applyGoStopAction(state,{type:'declareGo',actorId:'playerA'}).state;
  state.turn='playerA';
  let result=extractedEngine.evaluateGoStop(state,{actorId:'playerA'});
  assert.equal(result.pendingDecision,null);
  state=result.state; state.turn='playerA'; state.human.captured.push(card('m9-3'));
  result=extractedEngine.evaluateGoStop(state,{actorId:'playerA'});
  assert.equal(result.pendingDecision.score,8);
  state=extractedEngine.applyGoStopAction(result.state,{type:'declareGo',actorId:'playerA'}).state;
  assert.equal(state.human.go,2);
  assert.equal(state.human.lastGoScore,8);
  assert.equal(state.matchContext.lastScoreBySide.playerA,8);
  const settled=extractedEngine.calculateSettlement({winner:state.human,loser:state.ai});
  assert.equal(settled.goBonus,2);
});

test('exhausted turns defer Nagari but Bomb-blank completion can earn Go/Stop',()=>{
  let blank=goStopState('playerA'); blank.human.bombFreeTurns=1;
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'useBombBlank',actorId:'playerA'}).state;
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'drawNextCard',actorId:'playerA'}).state;
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'resolveNormalCard',actorId:'playerA',source:'drawn'}).state;
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'completeTurn',actorId:'playerA'}).state;
  assert.equal(extractedEngine.evaluateGoStop(blank,{actorId:'playerA'}).pendingDecision.score,7);

  const exhausted=goStopState('playerA'); exhausted.deck=[]; exhausted.human.hand=[];
  const eligible=extractedEngine.evaluateGoStop(exhausted,{actorId:'playerA'});
  assert.equal(eligible.pendingDecision,null);
  assert.equal(eligible.autoStop,true);
  assert.equal(eligible.state.winner,'playerA');

  const below=goStopState('playerA',sevenPointPi().slice(0,15)); below.deck=[]; below.human.hand=[];
  assert.equal(extractedEngine.evaluateGoStop(below,{actorId:'playerA'}).requiresNagari,true);
});

test('Chongtong terminal state cannot enter Go/Stop evaluation',()=>{
  const terminal=extractedEngine.resolveOpeningState(openingState({humanHand:cards('m6-1','m6-2','m6-3','m6-4')})).state;
  assert.throws(()=>extractedEngine.evaluateGoStop(terminal,{actorId:'playerA'}),/already complete/);
});

test('browser Go/Stop production flow delegates mutation and presentation to engine results',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const conclude=source.slice(source.indexOf('async function concludeTurn'),source.indexOf('function scheduleTurnStart'));
  assert.equal(conclude.includes('evaluateGoStop(state'),true);
  assert.equal(conclude.includes('actor.go++'),false);
  assert.equal(conclude.includes('lastGoScore='),false);
  const buttons=source.slice(source.indexOf("els.goBtn.addEventListener"),source.indexOf("if(els.shakeBtn)"));
  assert.equal(buttons.includes("type:'declareGo'"),true);
  assert.equal(buttons.includes("type:'declareStop'"),true);
  assert.equal(buttons.includes('.go++'),false);
  assert.equal(buttons.includes('state.winner='),false);
});

const exhaustedState=(actorId='playerA',carryPower=0,playerOverrides={})=>{
  const side=actorId==='playerA'?'human':'ai';
  return stateWith({
    turn:actorId,deck:[],matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:carryPower},
    [side]:api.makePlayer({hand:[],bombFreeTurns:0,...playerOverrides})
  });
};

test('Nagari exhaustion preserves hand-plus-blanks and empty-deck rules',()=>{
  let state=stateWith({turn:'playerA',deck:[card('m12-1')],human:api.makePlayer({hand:[],bombFreeTurns:0})});
  assert.equal(extractedEngine.evaluateGoStop(state,{actorId:'playerA'}).requiresNagari,true);
  state.human.bombFreeTurns=1;
  const continuing=extractedEngine.evaluateGoStop(state,{actorId:'playerA'});
  assert.equal(continuing.requiresNagari,false);
  assert.equal(continuing.state.turn,'playerB');
  state=stateWith({turn:'playerA',deck:[],human:api.makePlayer({hand:[card('m11-3')],bombFreeTurns:2})});
  assert.equal(extractedEngine.evaluateGoStop(state,{actorId:'playerA'}).requiresNagari,false);
});

test('authoritative Nagari resolves for both players with public no-winner events',()=>{
  for(const actorId of ['playerA','playerB']){
    const before=wireRoundTrip(exhaustedState(actorId));
    const result=extractedEngine.resolveNagari(before,{actorId});
    assert.equal(result.state.winner,'nagari');
    assert.equal(result.state.specialWinner,null);
    assert.deepEqual(result.state.terminalResult,{type:'nagari',winnerId:null,carryPower:1,nextHandMultiplier:2});
    assert.deepEqual(result.events,[
      {type:'nagariDeclared',audience:'public',actorId,carryPower:1,nextHandMultiplier:2},
      {type:'handEnded',audience:'public',winnerId:null,reason:'nagari',terminalResult:{type:'nagari',winnerId:null,carryPower:1,nextHandMultiplier:2}}
    ]);
    assert.equal(JSON.stringify(result.events).includes('cardId'),false);
    assert.deepEqual(wireRoundTrip(result.state),result.state);
    for(const viewerId of ['playerA','playerB']){
      const view=extractedEngine.projectStateForViewer(result.state,viewerId);
      assert.equal(view.winner,'nagari');
      assert.deepEqual(view.terminalResult,result.state.terminalResult);
      assert.deepEqual(view.legalActions,[]);
    }
    assert.throws(()=>extractedEngine.resolveNagari(result.state,{actorId}),/already complete/);
    assert.throws(()=>extractedEngine.applyNormalTurnAction(result.state,{type:'useBombBlank',actorId}),/already complete/);
    assert.throws(()=>extractedEngine.applyGoStopAction(result.state,{type:'declareGo',actorId}),/already complete|Unsupported/);
  }
});

test('Nagari carry increments across authority-created hands and caps at three',()=>{
  let carryPower=0;
  for(const expected of [1,2,3,3]){
    const hand=exhaustedState('playerA',carryPower);
    assert.equal(hand.matchContext.nagariCarryPower,carryPower);
    const result=extractedEngine.resolveNagari(hand,{actorId:'playerA'});
    assert.equal(result.state.matchContext.nagariCarryPower,expected);
    assert.equal(result.state.terminalResult.nextHandMultiplier,2**expected);
    carryPower=result.state.matchContext.nagariCarryPower;
  }
});

test('Nagari rejects premature, unresolved, wrong-player, and duplicate resolution',()=>{
  const playable=stateWith({turn:'playerA',deck:[card('m12-1')],human:api.makePlayer({hand:[card('m11-3')]})});
  assert.throws(()=>extractedEngine.resolveNagari(playable,{actorId:'playerA'}),/not available/);
  assert.throws(()=>extractedEngine.resolveNagari(exhaustedState('playerA'),{actorId:'playerB'}),/not playerB's turn/);
  const pending=exhaustedState('playerA');
  pending.pendingDecision={type:'goStopDecision',audience:'player-private',playerId:'playerA',score:7,previousGoScore:0,choices:['go','stop']};
  assert.throws(()=>extractedEngine.resolveNagari(pending,{actorId:'playerA'}),/decision must be resolved/);
});

test('qualifying zero-hand final turns auto-STOP before Nagari',()=>{
  let final=exhaustedState('playerA',1,{captured:sevenPointPi()});
  let evaluated=extractedEngine.evaluateGoStop(final,{actorId:'playerA'});
  assert.equal(evaluated.autoStop,true);
  assert.equal(evaluated.state.winner,'playerA');
  assert.equal(evaluated.state.terminalResult.settlement.reasons.includes('Nagari carry ×2'),true);
  assert.equal(evaluated.state.matchContext.nagariCarryPower,0);
  assert.throws(()=>extractedEngine.resolveNagari(evaluated.state,{actorId:'playerA'}),/already complete/);
});

test('equal or lower post-GO exhausted scores become Nagari without another decision',()=>{
  for(const captured of [sevenPointPi(),sevenPointPi().slice(0,15)]){
    const state=exhaustedState('playerA',0,{captured,go:1,lastGoScore:7});
    state.matchContext.lastScoreBySide.playerA=7;
    const evaluated=extractedEngine.evaluateGoStop(state,{actorId:'playerA'});
    assert.equal(evaluated.pendingDecision,null);
    assert.equal(evaluated.requiresNagari,true);
    assert.equal(extractedEngine.resolveNagari(evaluated.state,{actorId:'playerA'}).state.winner,'nagari');
  }
});

test('Conquer consumes carry authoritatively and preserves its seven-point base',()=>{
  const opening=openingState({humanHand:cards('m6-1','m6-2','m6-3','m6-4')});
  opening.matchContext.nagariCarryPower=2;
  const result=extractedEngine.resolveOpeningState(opening);
  assert.deepEqual(result.state.terminalResult,{type:'chongtong',winnerId:'playerA',basePoints:7,nagariCarryPower:2,multiplier:4,finalPoints:28,cardIds:['m6-1','m6-2','m6-3','m6-4']});
  assert.equal(result.state.matchContext.nagariCarryPower,0);
  assert.deepEqual(wireRoundTrip(result.state),result.state);
});

test('Bomb empty-deck paths preserve their direct Nagari boundary while last-card draw evaluates score',()=>{
  let bomb=pendingBomb('playerA',{deck:[]}).state;
  bomb=extractedEngine.applyNormalTurnAction(bomb,{type:'declareBomb',actorId:'playerA'}).state;
  bomb=extractedEngine.applyNormalTurnAction(bomb,{type:'drawNextCard',actorId:'playerA'}).state;
  bomb=extractedEngine.applyNormalTurnAction(bomb,{type:'completeTurn',actorId:'playerA'}).state;
  assert.throws(()=>extractedEngine.resolveNagari(bomb,{actorId:'playerA'}),/either player can continue/);

  let blank=stateWith({turn:'playerA',deck:[],human:api.makePlayer({bombFreeTurns:1})});
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'useBombBlank',actorId:'playerA'}).state;
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'drawNextCard',actorId:'playerA'}).state;
  blank=extractedEngine.applyNormalTurnAction(blank,{type:'completeTurn',actorId:'playerA'}).state;
  assert.equal(extractedEngine.resolveNagari(blank,{actorId:'playerA'}).state.winner,'nagari');

  let last=goStopState('playerA'); last.human.bombFreeTurns=1;
  last=extractedEngine.applyNormalTurnAction(last,{type:'useBombBlank',actorId:'playerA'}).state;
  last=extractedEngine.applyNormalTurnAction(last,{type:'drawNextCard',actorId:'playerA'}).state;
  last=extractedEngine.applyNormalTurnAction(last,{type:'resolveNormalCard',actorId:'playerA',source:'drawn'}).state;
  last=extractedEngine.applyNormalTurnAction(last,{type:'completeTurn',actorId:'playerA'}).state;
  assert.equal(extractedEngine.evaluateGoStop(last,{actorId:'playerA'}).pendingDecision.score,7);
});

test('browser Nagari and Chongtong presentation contain no authoritative carry mutation',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const nagari=source.slice(source.indexOf('async function finishNagari'),source.indexOf('function finishSpecial'));
  assert.equal(nagari.includes('resolveNagari(state'),true);
  assert.equal(nagari.includes("state.winner='nagari'"),false);
  assert.equal(nagari.includes('Math.min(3'),false);
  const chongtong=source.slice(source.indexOf('function presentChongtong'),source.indexOf('async function revealAiShake'));
  assert.equal(chongtong.includes('terminal.finalPoints'),true);
  assert.equal(chongtong.includes('nagariCarryPower=0'),false);
});

function threePpeokFixture({actorId='playerA',existingPpeoks=2,carryPower=0}={}){
  const side=actorId==='playerA'?'human':'ai';
  const other=side==='human'?'ai':'human';
  const hiddenOpponent=card('m10-2');
  let state=stateWith({
    turn:actorId,deck:cards('m4-3','m12-1'),floor:[card('m4-1')],
    [side]:api.makePlayer({hand:[card('m4-2'),card('m11-3')],ppeoks:existingPpeoks}),
    [other]:api.makePlayer({hand:[hiddenOpponent]}),
    matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:carryPower}
  });
  api.initFloorSlots(state);
  state=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId,cardId:'m4-2',targetId:'m4-1'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId}).state;
  return {before:wireRoundTrip(state),result:extractedEngine.applySpecialTurnAction(state,{type:'resolveSpecialTurn',actorId}),side,hiddenOpponent};
}

test('first and second Ppeok remain nonterminal while third and later terminate',()=>{
  for(const [existingPpeoks,expectedCount,terminal] of [[0,1,false],[1,2,false],[2,3,true],[3,4,true]]){
    const {before,result,side}=threePpeokFixture({existingPpeoks});
    assert.deepEqual(wireRoundTrip(before),before);
    assert.equal(result.state[side].ppeoks,expectedCount);
    assert.equal(Boolean(result.state.terminalResult),terminal);
    assert.equal(result.state.winner,terminal?'playerA':null);
    assert.equal(result.events.some(event=>event.type==='threePpeokDeclared'),terminal);
  }
});

test('Three-Ppeok terminal result consumes carry for both neutral players',()=>{
  for(const actorId of ['playerA','playerB']){
    for(const [carryPower,finalPoints] of [[0,7],[1,14],[2,28],[3,56]]){
      const {result,side}=threePpeokFixture({actorId,carryPower});
      assert.equal(result.state.winner,actorId);
      assert.equal(result.state.specialWinner,null);
      assert.equal(result.state[side].ppeoks,3);
      assert.deepEqual(result.state.terminalResult,{
        type:'threePpeok',winnerId:actorId,basePoints:7,nagariCarryPower:carryPower,
        multiplier:2**carryPower,finalPoints,reason:'Three ppeoks in one hand'
      });
      assert.equal(result.state.matchContext.nagariCarryPower,0);
      assert.deepEqual(result.events.map(event=>event.type),['ppeokFormed','firstPpeokAwarded','specialResolved','threePpeokDeclared','handEnded']);
      assert.deepEqual(result.events[3],{type:'threePpeokDeclared',audience:'public',actorId,ppeokCount:3,basePoints:7,finalPoints});
      assert.deepEqual(wireRoundTrip(result.state),result.state);
    }
  }
});

test('Three-Ppeok terminal projection is public but preserves hidden-card privacy',()=>{
  const {result,hiddenOpponent}=threePpeokFixture();
  assert.equal(result.events.some(event=>Object.hasOwn(event,'hand')),false);
  assert.equal(JSON.stringify(result.events).includes(hiddenOpponent.id),false);
  for(const viewerId of ['playerA','playerB']){
    const view=extractedEngine.projectStateForViewer(result.state,viewerId);
    assert.deepEqual(view.terminalResult,result.state.terminalResult);
    assert.deepEqual(view.legalActions,[]);
    assert.equal(Object.hasOwn(view,'deck'),false);
    if(viewerId==='playerA')assert.equal(JSON.stringify(view).includes(hiddenOpponent.id),false);
  }
  assert.equal(result.state.pendingDecision,undefined);
  assert.throws(()=>extractedEngine.evaluateGoStop(result.state,{actorId:'playerA'}),/already complete/);
  assert.throws(()=>extractedEngine.resolveNagari(result.state,{actorId:'playerA'}),/already complete/);
  assert.throws(()=>extractedEngine.applyNormalTurnAction(result.state,{type:'attemptPlayCard',actorId:'playerA',cardId:'m11-3'}),/already complete/);
});

test('browser presents Three-Ppeok only from authoritative terminal events',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.equal(source.includes('ppeoks>=3'),false);
  assert.equal(source.includes('ppeoks >= 3'),false);
  assert.equal(source.includes('function finishSpecial'),false);
  const presenter=source.slice(source.indexOf('function presentThreePpeok'),source.indexOf('function finishByScore'));
  assert.equal(presenter.includes("item.type==='threePpeokDeclared'"),true);
  assert.equal(presenter.includes('terminal.finalPoints'),true);
  assert.equal(presenter.includes('state.winner='),false);
  assert.equal(presenter.includes('nagariCarryPower=0'),false);
  const extracted=source.slice(source.indexOf('async function resolveExtractedSpecialTurn'),source.indexOf('async function playFullTurn'));
  assert.equal(extracted.indexOf('playPpeokSound()')<extracted.indexOf('await sleep(450)'),true);
  assert.equal(extracted.indexOf('await sleep(450)')<extracted.indexOf('presentThreePpeok(result,epoch)'),true);
});

test('engine captures initial and opponent Ppeok floor stacks for both players',()=>{
  for(const actorId of ['playerA','playerB']){
    const opponentId=actorId==='playerA'?'playerB':'playerA';
    for(const source of ['initial','ppeok']){
      const stackCards=cards('m2-1','m2-2','m2-3');
      const result=specialFixture(actorId,{
        floor:stackCards,handCard:card('m2-4'),drawCard:card('m8-1'),captured:[card('m7-3')],
        floorStacks:{2:{month:2,cardIds:stackCards.map(card=>card.id),source,owner:source==='initial'?null:opponentId}},
        targetId:'m2-3'
      });
      const side=actorId==='playerA'?'human':'ai';
      const other=side==='human'?'ai':'human';
      assert.equal(result.outcome.kind,'floorStackInteraction');
      assert.deepEqual(result.state[side].captured.slice(0,4).map(card=>card.id),['m2-4','m2-1','m2-2','m2-3']);
      assert.equal(result.state[other].captured.length,0);
      assert.equal(result.state.floorStacks[2],undefined);
      for(const card of stackCards)assert.equal(result.state.floorSlotByCard[card.id],undefined);
      assert.deepEqual(result.events.slice(0,3).map(event=>event.type),['floorStackRemoved','cardsCaptured','piTransferred']);
      assert.equal(result.events.filter(event=>event.type==='piTransferred').length,1);
      assert.equal(result.events[2].reason,source==='initial'?'initialStack':'opponentPpeok');
      assert.deepEqual(wireRoundTrip(result.state),result.state);
    }
  }
});

test('deck-only floor-stack interaction is classified and resolved by authority',()=>{
  const stackCards=cards('m3-1','m3-2','m3-3');
  let state=stateWith({
    turn:'playerA',deck:[card('m3-4')],floor:stackCards,
    human:api.makePlayer({bombFreeTurns:1}),ai:api.makePlayer({captured:[card('m6-3')]}),
    floorStacks:{3:{month:3,cardIds:stackCards.map(card=>card.id),source:'initial',owner:null}}
  });
  api.initFloorSlots(state);
  state=extractedEngine.applyNormalTurnAction(state,{type:'useBombBlank',actorId:'playerA'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA',targetId:'m3-3'}).state;
  assert.equal(extractedEngine.classifyTurnOutcome(state,{actorId:'playerA'}).kind,'floorStackInteraction');
  const result=extractedEngine.applySpecialTurnAction(state,{type:'resolveSpecialTurn',actorId:'playerA'});
  assert.deepEqual(result.state.human.captured.slice(0,4).map(card=>card.id),['m3-4','m3-1','m3-2','m3-3']);
  assert.equal(result.events.find(event=>event.type==='piTransferred').reason,'initialStack');
});

test('legacySpecial is a fail-loud invariant path, not a browser authority fallback',()=>{
  let state=stateWith({turn:'playerA',deck:[card('m8-1')],floor:cards('m4-1','m4-2','m4-3'),human:api.makePlayer({hand:[card('m4-4')]})});
  api.initFloorSlots(state);
  state=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m4-4',targetId:'m4-1'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'}).state;
  assert.equal(extractedEngine.classifyTurnOutcome(state,{actorId:'playerA'}).kind,'legacySpecial');
  assert.throws(()=>extractedEngine.applySpecialTurnAction(state,{type:'resolveSpecialTurn',actorId:'playerA'}),/not extracted/);
  // Production hand construction marks every three-card floor month as a stack,
  // so this fixture is deliberately missing required canonical stack metadata.
});

test('viewer projection exposes only public authority and addressed decisions',()=>{
  const hiddenA=card('m10-1'),hiddenB=card('m11-1'),deckCard=card('m12-1');
  const state=stateWith({
    turn:'playerA',deck:[deckCard],floor:[card('m1-1')],floorSlotByCard:{'m1-1':4},floorSlotCount:12,
    human:api.makePlayer({hand:[hiddenA],captured:[card('m2-1')]}),
    ai:api.makePlayer({hand:[hiddenB],captured:[card('m3-1')]}),
    pendingDecision:{type:'goStopDecision',audience:'player-private',playerId:'playerA',score:7,previousGoScore:0,choices:['go','stop']}
  });
  for(const viewerId of ['playerA','playerB']){
    const view=extractedEngine.projectStateForViewer(state,viewerId);
    const own=viewerId==='playerA'?'human':'ai',other=own==='human'?'ai':'human';
    assert.equal(view[own].hand.length,1);
    assert.equal(view[other].hand,undefined);
    assert.equal(view[other].handCount,1);
    assert.equal(view.deck,undefined); assert.equal(view.deckCount,1);
    assert.deepEqual(view.floor.map(card=>card.id),['m1-1']);
    assert.equal(view.floorSlotByCard['m1-1'],4);
    assert.equal(view.turn,'playerA');
    assert.equal(view[other].captured.length,1);
    assert.equal(Boolean(view.pendingDecision),viewerId==='playerA');
    assert.deepEqual(view.legalActions,viewerId==='playerA'?['declareGo','declareStop']:[]);
  }
});

test('production app has no reachable in-hand authority mutation fallback',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const combined=source.slice(source.indexOf('async function resolveCombinedTurn'),source.indexOf('async function resolveSingleCard'));
  const single=source.slice(source.indexOf('async function resolveSingleCard'),source.indexOf('async function applySweepIfNeeded'));
  const pi=source.slice(source.indexOf('async function stealPiAnimated'),source.indexOf('async function animatePiTransfer'));
  assert.equal(combined.includes("if(!TEST_MODE)throw new Error('Legacy combined-turn mutation is characterization-only.')"),true);
  assert.equal(single.includes("if(!TEST_MODE)throw new Error('Legacy single-card mutation is characterization-only.')"),true);
  assert.equal(pi.includes("if(!TEST_MODE)throw new Error('Legacy Pi mutation is characterization-only.')"),true);
  const productionTurn=source.slice(source.indexOf('async function playFullTurn'),source.indexOf('async function resolveCombinedTurn'));
  assert.equal(productionTurn.includes('resolveCombinedTurn('),false);
  assert.equal(productionTurn.includes('resolveSingleCard('),false);
  assert.equal(productionTurn.includes('state.deck.shift('),false);
  assert.equal(productionTurn.includes("throw new Error(`Unhandled authoritative turn classification"),true);
  assert.equal(source.includes('bottomPlayer.hand.sort('),false);
});

test('opening triple decisions distinguish KEEP SECRET from immediate BOMB for both players',()=>{
  for(const actorId of ['playerA','playerB']){
    const side=actorId==='playerA'?'human':'ai';
    const month=actorId==='playerA'?5:6;
    let state=stateWith({turn:actorId,[side]:api.makePlayer({hand:cards(`m${month}-1`,`m${month}-2`,`m${month}-3`)})});
    let opened=extractedEngine.resolveOpeningState(state);
    assert.deepEqual(opened.pendingDecision.choices,['shake','keepSecret']);
    assert.equal(opened.pendingDecision.playerId,actorId);
    assert.equal(extractedEngine.projectStateForViewer(opened.state,actorId==='playerA'?'playerB':'playerA').pendingDecision,undefined);
    const kept=extractedEngine.applyNormalTurnAction(opened.state,{type:'armOpeningBomb',actorId});
    assert.deepEqual(kept.state[side].armedBombMonths,[month]);
    assert.equal(kept.state[side].hand.length,3);

    state=stateWith({floor:[card(`m${month}-4`)],[side]:api.makePlayer({hand:cards(`m${month}-1`,`m${month}-2`,`m${month}-3`)})});
    api.initFloorSlots(state);
    opened=extractedEngine.resolveOpeningState(state);
    assert.deepEqual(opened.pendingDecision.choices,['shake','bomb']);
    assert.equal(opened.pendingDecision.floorCardId,`m${month}-4`);
    assert.equal(opened.pendingDecision.choices.includes('keepSecret'),false);
    assert.deepEqual(wireRoundTrip(opened.state),opened.state);
  }
});

test('opening Bomb executes in one choice while opening Shake suppresses Bomb',()=>{
  let state=stateWith({floor:[card('m6-4')],human:api.makePlayer({hand:cards('m6-1','m6-2','m6-3')}),ai:api.makePlayer({captured:[card('m7-3')]})});
  api.initFloorSlots(state); state=extractedEngine.resolveOpeningState(state).state;
  const bomb=extractedEngine.applyNormalTurnAction(state,{type:'declareBomb',actorId:'playerA'});
  assert.deepEqual(bomb.events.map(event=>event.type),['bombArmed']);
  assert.equal(bomb.state.human.hand.length,3); assert.equal(bomb.state.human.bombFreeTurns,0);
  assert.equal(bomb.state.ai.captured.length,1); assert.equal(bomb.state.human.captured.length,0);
  assert.deepEqual(bomb.state.human.armedBombMonths,[6]);

  state=stateWith({floor:[card('m6-4')],human:api.makePlayer({hand:cards('m6-1','m6-2','m6-3')})});
  api.initFloorSlots(state); state=extractedEngine.resolveOpeningState(state).state;
  const shaken=extractedEngine.applyNormalTurnAction(state,{type:'declareShake',actorId:'playerA'});
  assert.equal(shaken.state.human.shakes,1);
  assert.equal(shaken.events.some(event=>event.type==='bombDeclared'),false);
  assert.equal(shaken.state.human.hand.length,3);
});

test('settlement excludes Bomb, preserves Shake, doubles 3 Go, and bounds Pi-bak',()=>{
  const winner=api.makePlayer({captured:sevenPointPi()});
  const safeLoser=api.makePlayer({captured:[card('m12-1')]});
  assert.equal(extractedEngine.calculateSettlement({winner:{...winner,bombs:1},loser:safeLoser}).total,7);
  assert.equal(extractedEngine.calculateSettlement({winner:{...winner,shakes:1},loser:safeLoser}).total,14);
  const threeGo=extractedEngine.calculateSettlement({winner:{...winner,go:3},loser:safeLoser});
  assert.equal(threeGo.total,14); assert.equal(threeGo.goBonus,0); assert.equal(threeGo.formulaSteps.includes('3 Go ×2'),true);
  const zeroPi=extractedEngine.calculateSettlement({winner,loser:api.makePlayer()});
  const onePi=extractedEngine.calculateSettlement({winner,loser:api.makePlayer({captured:[card('m9-3')]})});
  assert.equal(zeroPi.reasons.includes('Pi-bak ×2'),false); assert.equal(zeroPi.total,7);
  assert.equal(onePi.reasons.includes('Pi-bak ×2'),true); assert.equal(onePi.total,14);
  assert.equal(extractedEngine.calculateSettlement({winner:{...winner,bombs:1},loser:safeLoser}).formulaSteps.some(step=>step.includes('Bomb')),false);
});

test('first-turn Ppeok awards seven points and continues without breaking Three-Ppeok',()=>{
  const first=threePpeokFixture({existingPpeoks:0}).result;
  assert.equal(first.state.human.firstPpeokPoints,7);
  assert.equal(first.state.winner,null);
  assert.equal(extractedEngine.scorePlayer(first.state.human).bonusPoints,7);
  assert.equal(first.events.find(event=>event.type==='firstPpeokAwarded').points,7);
  const later=threePpeokFixture({existingPpeoks:0}).before;
  later.human.turnsTaken=1;
  const resolved=extractedEngine.applySpecialTurnAction(later,{type:'resolveSpecialTurn',actorId:'playerA'});
  assert.equal(resolved.state.human.firstPpeokPoints,0);
  assert.equal(resolved.events.some(event=>event.type==='firstPpeokAwarded'),false);
  assert.equal(threePpeokFixture({existingPpeoks:2}).result.state.terminalResult.type,'threePpeok');
});

test('Gukjin mode is explicit, authoritative, score-changing, and serializable',()=>{
  const captured=[card('m9-1'),...sevenPointPi().slice(0,9)];
  let state=stateWith({human:api.makePlayer({captured,gukjinMode:'animal'})});
  const animal=extractedEngine.scorePlayer(state.human);
  state=extractedEngine.applyNormalTurnAction(state,{type:'setGukjinMode',actorId:'playerA',mode:'pi'}).state;
  const pi=extractedEngine.scorePlayer(state.human);
  assert.equal(animal.gukjinAsPi,false); assert.equal(pi.gukjinAsPi,true);
  assert.equal(animal.animals,1); assert.equal(pi.animals,0);
  assert.equal(pi.piCount,11); assert.equal(pi.total>animal.total,true);
  assert.equal(wireRoundTrip(state).human.gukjinMode,'pi');
  const settlement=extractedEngine.calculateSettlement({winner:state.human,loser:api.makePlayer({captured:[card('m1-3')]})});
  assert.equal(settlement.reasons.includes('Pi-bak ×2'),true);
  state=extractedEngine.applyNormalTurnAction(state,{type:'setGukjinMode',actorId:'playerA',mode:'animal'}).state;
  assert.equal(extractedEngine.scorePlayer(state.human).gukjinAsPi,false);
});

test('presentation regressions are wired without browser-side rule mutation',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.equal(source.includes('preloadCardFaces()'),true);
  assert.equal(source.includes('await preloadCardFace(card)'),true);
  assert.equal(source.includes('document.querySelectorAll(`[data-card-id="${card.id}"]`)'),true);
  assert.equal(source.includes("classification.kind==='ttadakCandidate'){playTapTapSound()"),true);
  assert.equal(source.includes('SpeechSynthesisUtterance'),false);
  assert.equal(source.includes("classList.toggle('active-turn'"),true);
  assert.equal(source.includes('sessionStats:{playerA:'),true);
  assert.equal(css.includes('object-fit:contain!important'),true);
  assert.equal(css.includes('.player-chip.active-turn'),true);
});

test('declared Shake card identities are public, projected, and serializable while KEEP SECRET stays private',()=>{
  const {state,triple}=shakeState('playerA');
  state.ai.hand=[card('m10-1')];
  const pending=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:triple[0].id}).state;
  const declared=extractedEngine.applyNormalTurnAction(pending,{type:'declareShake',actorId:'playerA'});
  const ids=triple.map(item=>item.id);
  assert.deepEqual(declared.events[0].cardIds,ids);
  assert.deepEqual(wireRoundTrip(declared.state).human.revealedShakeSets,[{month:6,cardIds:ids,declarationMultiplier:2}]);
  for(const viewerId of ['playerA','playerB']){
    assert.deepEqual(extractedEngine.projectStateForViewer(declared.state,viewerId).human.revealedShakeSets,[{month:6,cardIds:ids,declarationMultiplier:2}]);
  }

  const secret=extractedEngine.applyNormalTurnAction(pending,{type:'keepShakeSecret',actorId:'playerA'});
  assert.deepEqual(secret.state.human.revealedShakeSets,[]);
  assert.equal(secret.events.length,0);
  assert.equal(JSON.stringify(extractedEngine.projectStateForViewer(secret.state,'playerB')).includes(ids[0]),false);
});

test('dedicated Gukjin choices map Picture and Single buttons to authoritative modes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.equal(html.includes('Choose how to use this card</h2>'),true);
  assert.equal(html.includes('>Use as Picture</button>') || html.includes('data-i18n="usePicture">Use as Picture</button>'),true);
  assert.equal(html.includes('>Use as Single</button>') || html.includes('data-i18n="useSingle">Use as Single</button>'),true);
  assert.equal(source.includes("gukjinPictureBtn.addEventListener('click',()=>chooseGukjinMode('animal'))"),true);
  assert.equal(source.includes("gukjinSingleBtn.addEventListener('click',()=>chooseGukjinMode('pi'))"),true);
  assert.equal(source.includes('Gukjin: ${player.gukjinMode'),false);
});

test('user-facing settlement formatting translates penalty terminology to English categories',()=>{
  const formatted=api.formatScoreFormula({formulaSteps:['Base 7','First Ppeok +7','Meong-bak ×2','Pi-bak ×2','Gwang-bak ×2','Go-bak ×2'],total:224});
  assert.equal(formatted,'Base 7  →  First Poop +7  →  Picture Penalty ×2  →  Single Penalty ×2  →  Bright Penalty ×2  →  Go Penalty ×2  →  Final 224');
  assert.equal(/Ppeok|Meong|Pi-bak|Gwang|Go-bak/.test(formatted),false);
});

test('moving-card sizing uses an untransformed in-stage probe for responsive CSS expressions',()=>{
  const originalCreateElement=document.createElement;
  document.createElement=()=>({...fakeElement(),getBoundingClientRect(){return {left:12,top:20,width:52.5,height:85};}});
  const size=api.cardSize();
  const fullSize=api.fullSizeSourceRect({left:100,top:200,width:26,height:42});
  document.createElement=originalCreateElement;
  assert.deepEqual({...size},{w:52.5,h:85});
  assert.deepEqual({...fullSize},{left:86.75,top:178.5,width:52.5,height:85});
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const sizing=source.slice(source.indexOf('function cardSize()'),source.indexOf('function approximateAiSource'));
  assert.doesNotMatch(sizing,/parseFloat|getPropertyValue|stage\.offsetWidth|\{w:78,h:127\}/);
  assert.doesNotMatch(sizing,/querySelector\(['"]\.hand|querySelector\(['"]\.floor/);
  assert.match(sizing,/getBoundingClientRect\(\)/);
  assert.match(sizing,/card-size-probe/);
  assert.match(sizing,/return \{w:76,h:123\}/);
});

test('responsive CSS defines compact portrait and one-viewport short landscape strategies without destabilizing cards',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  const landscape=css.slice(css.indexOf('@media (orientation:landscape) and (max-height:600px) and (max-width:1000px)'));
  const portrait=css.slice(css.indexOf('@media (max-width:700px) and (orientation:portrait)'),css.indexOf('/* Phones wider than the portrait breakpoint'));
  const narrow=css.slice(css.indexOf('@media (max-width:380px)'),css.indexOf('@media (max-width:932px)'));
  assert.match(css,/@media \(max-width:700px\) and \(orientation:portrait\)/);
  assert.match(css,/@media \(orientation:landscape\) and \(max-height:600px\) and \(max-width:1000px\)/);
  assert.match(css,/--card-aspect:76 \/ 123/);
  assert.doesNotMatch(narrow,/(?:height|min-height):376px|grid-template-rows:auto 376px auto/);
  assert.match(portrait,/html,body\{[^}]*height:100%;[^}]*overflow:hidden/);
  assert.match(portrait,/\.app-shell\{height:100vh;height:100svh;min-height:0;[^}]*overflow:hidden/);
  assert.match(portrait,/\.topbar\{height:44px;min-height:44px/);
  assert.match(portrait,/\.game-stage\{height:calc\(100vh - 44px\);height:calc\(100svh - 44px\);min-height:0;[^}]*grid-template-rows:100px minmax\(0,1fr\) 194px;[^}]*overflow:hidden/);
  assert.match(portrait,/\.table\{height:100%;min-width:0;min-height:0/);
  assert.match(portrait,/\.floor-slot\{height:100%;min-height:0;min-width:0/);
  assert.match(landscape,/--card-w:clamp\(36px,10svh,40px\)/);
  assert.match(landscape,/\.app-shell\{height:100vh;height:100svh;min-height:0;[^}]*overflow:hidden/);
  assert.doesNotMatch(landscape,/\.app-shell\{[^}]*100svh[^}]*100dvh/);
  assert.match(landscape,/\.topbar\{height:32px;min-height:32px/);
  assert.match(landscape,/\.game-stage\{[^}]*height:calc\(100vh - 32px\);height:calc\(100svh - 32px\);[^}]*grid-template-rows:44px minmax\(0,1fr\) 62px;[^}]*overflow:hidden/);
  assert.doesNotMatch(landscape,/\.game-stage\{[^}]*100svh[^}]*100dvh/);
  assert.match(landscape,/\.opponent-zone\{[^}]*min-width:0;min-height:0;[^}]*grid-template-rows:44px/);
  assert.match(landscape,/\.table\{[^}]*height:100%;min-width:0;min-height:0/);
  assert.doesNotMatch(landscape,/222px/);
  assert.match(landscape,/\.floor\{[^}]*grid-template-columns:repeat\(6,[^}]*grid-template-rows:repeat\(2,/);
  assert.match(portrait,/\.floor\{[^}]*grid-template-columns:repeat\(4,[^}]*grid-template-rows:repeat\(3,/);
  assert.match(landscape,/\.floor-slot\{height:100%;min-height:0;min-width:0/);
  assert.match(landscape,/\.player-zone\{[^}]*min-width:0;min-height:0;[^}]*grid-template-rows:62px/);
  for(const selector of ['opponent-zone','opponent-hand','cpu-capture-panel','table','floor','player-zone','hand','player-capture-panel']){
    assert.doesNotMatch(portrait,new RegExp(`\\.${selector}\\{[^}]*(?:display:none|visibility:hidden)`));
    assert.doesNotMatch(landscape,new RegExp(`\\.${selector}\\{[^}]*(?:display:none|visibility:hidden)`));
  }
  assert.match(css,/\.avatar\{[^}]*white-space:nowrap/);
  assert.match(css,/\.tutorial-nav\{[^}]*overflow-x:auto;overflow-y:hidden/);
  assert.match(landscape,/\.captured-mini\{[^}]*height:auto!important;aspect-ratio:var\(--card-aspect\)/,'landscape captured cards override the fixed desktop height');
  assert.match(landscape,/\.captured-strip\{gap:1px\}/,'all four base capture-grid categories remain represented');
  assert.match(css,/\.table\{position:relative;z-index:10;min-height:565px/,'desktop table geometry remains the base');
  assert.match(css,/--card-w:76px;--card-h:123px/,'desktop card geometry remains the base');
  assert.doesNotMatch(css,/\.hand(?:-card-slot)?\{[^}]*(?:position:fixed|position:sticky)/);
  assert.match(landscape,/\.hand\{position:static;[^}]*height:62px;justify-content:center;overflow:visible/,'the full landscape hand fits without scrolling or fixed positioning');
  assert.match(landscape,/dialog\{[^}]*max-height:calc\(100dvh - 8px\)[^}]*overflow:hidden\}\.dialog-card\{[^}]*overflow:auto/);
});

test('Keep for Bomb is silent while accepted Shake alone enters the acknowledgment presenter',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.equal(html.includes('id="shakeBtn"') && html.includes('data-i18n="shake">Shake</button>'),true);
  assert.equal(html.includes('id="keepSecretBtn"') && html.includes('data-i18n="keepBomb">Keep for Bomb</button>'),true);
  assert.equal(source.includes("t('shake')")&&source.includes("t('keepBomb')"),true);
  assert.equal((source.match(/playShakeSound\(/g)||[]).length,2,'only the semantic presenter and function declaration may reference Shake audio');
  const presenter=source.slice(source.indexOf('async function presentShakeDeclaration'),source.indexOf('function openShakeReview'));
  assert.equal(presenter.includes("events.find(item=>item.type==='shakeDeclared')"),true);
  assert.equal(presenter.includes("event.actorId===PLAYER_B"),true);
  assert.equal(presenter.includes('showGameplayModal(els.shakeRevealDialog,epoch)'),true);
  assert.equal(presenter.includes("shakeRevealDialog.addEventListener('close'"),true);
});

test('First Poop notices cover both players while First and Triple Poop semantics stay distinct',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const i18n=require('../i18n.js');
  assert.match(source,/if\(result\.events\.some\(event=>event\.type==='firstPpeokAwarded'\)\)await showFirstPoopNotice\(side,localGeneration,epoch\)/);
  assert.equal(i18n.dictionaries.en.firstPoop,'FIRST POOP!');
  assert.equal(i18n.dictionaries.en.triplePoop,'TRIPLE POOP!');
  assert.equal(source.includes("setGrandResult(t('triplePoop')"),true);
  const poopPath=source.slice(source.indexOf("if(classification.kind==='ppeokSsaDaCandidate')"),source.indexOf("}else{",source.indexOf("if(classification.kind==='ppeokSsaDaCandidate')")));
  assert.equal(poopPath.includes('playPpeokSound()'),true);
  assert.equal(poopPath.includes('playShakeSound()'),false);
  assert.equal(html.includes('FIRST POOP!'),true);
  const first=threePpeokFixture({existingPpeoks:0}).result;
  assert.equal(first.state.winner,null);
  assert.equal(threePpeokFixture({existingPpeoks:2}).result.state.terminalResult.type,'threePpeok');
});

test('normal visible English UI uses Poop terminology and not internal Korean-derived labels',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const i18n=require('../i18n.js');
  const visible=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  assert.match(i18n.dictionaries.en.tutorialSpecials,/POOPED/);
  assert.match(visible,/FIRST POOP!/);
  assert.doesNotMatch(visible,/Ppeok|PPEOK|Ssa-da|Meong-bak|Pi-bak|Gwang-bak|Go-bak/);
});

test('Go badges hide zero and label one or three while the decision copy is explicit',()=>{
  assert.equal(api.goCountLabel(api.makePlayer({go:0})),'');
  assert.equal(api.goCountLabel(api.makePlayer({go:1})),'1 Go');
  assert.equal(api.goCountLabel(api.makePlayer({go:3})),'3 Go');
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.equal(source.includes("t('currentGo',{count:state.human.go})"),true);
  assert.equal(source.includes("renderGoIndicator(document.querySelector('.cpu-chip'),topPlayer)"),true);
});

test('milestone detection queues Godori, valid Stripes, and five Brights once without changing authority',()=>{
  const captured=cards('m2-1','m4-1','m8-2','m1-2','m2-2','m3-2','m1-1','m3-1','m8-1','m11-1','m12-1');
  const state=stateWith({human:api.makePlayer({captured})});
  api.setState(state); const before=JSON.stringify(api.getState());
  const milestones=api.detectNewMilestones('playerA');
  assert.deepEqual(Array.from(milestones,item=>item.titleKey),['birdies','threeStripesRed','fiveBrights']);
  assert.deepEqual(Array.from(milestones[1].cardIds),['m1-2','m2-2','m3-2']);
  assert.equal(milestones[0].birds,true);
  assert.equal(api.detectNewMilestones('playerA').length,0);
  assert.equal(JSON.stringify(api.getState()),before);
});

test('valid Stripe sets are detected once for both authoritative players regardless of total ribbon count',()=>{
  for(const playerId of ['playerA','playerB'])for(const [set,ids] of Object.entries({red:['m1-2','m2-2','m3-2'],grass:['m4-2','m5-2','m7-2'],blue:['m6-2','m9-2','m10-2']})){
    const isolated=loadCurrentGame().api,side=playerId==='playerA'?'human':'ai',captured=ids.map(id=>isolated.card(id));
    if(set==='red')captured.push(isolated.card('m4-2'));
    isolated.setState(isolated.makeState({[side]:isolated.makePlayer({captured})}));
    const titleKey=`threeStripes${set[0].toUpperCase()}${set.slice(1)}`;
    const found=isolated.detectNewMilestones(playerId).filter(item=>item.titleKey===titleKey);
    assert.equal(found.length,1);assert.equal(found[0].key,`stripes-${set}`);assert.equal(found[0].cardIds.length,3);
    assert.equal(isolated.detectNewMilestones(playerId).some(item=>item.titleKey===titleKey),false);
  }
  const isolated=loadCurrentGame().api;
  isolated.setState(isolated.makeState({ai:isolated.makePlayer({captured:['m1-2','m4-2','m6-2'].map(id=>isolated.card(id))})}));
  assert.equal(isolated.detectNewMilestones('playerB').some(item=>item.titleKey.startsWith('threeStripes')),false);
  assert.equal(isolated.onlineValueForViewer({actorId:'playerB'},'playerB').actorId,'playerA');
  assert.equal(isolated.onlineValueForViewer({actorId:'playerB'},'playerA').actorId,'playerB');
});

test('Online Go/Stop boundary awaits separated and multiple milestones without duplicates',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),drive=source.slice(source.indexOf('async function driveOnline'),source.indexOf('function onlineStateFromSnapshot'));
  assert.match(drive,/decision\?\.type==='goStopDecision'\)\{await presentOnlineGoStopDecision\(decision\);return;/);
  const makeRecorder=isolated=>{
    const order=[],overlay=isolated.elements.get('milestoneOverlay'),title=isolated.elements.get('milestoneTitle'),dialog=isolated.elements.get('decisionDialog');
    overlay.classList.add=()=>order.push(`start:${title.textContent}`);
    overlay.classList.remove=()=>order.push(`finish:${title.textContent}`);
    dialog.showModal=function(){order.push('go-stop');this.open=true;};
    return order;
  };
  for(const [playerId,side] of [['playerA','human'],['playerB','ai']]){
    const isolated=loadCurrentGame(),order=makeRecorder(isolated);
    isolated.api.setState(isolated.api.makeState({[side]:isolated.api.makePlayer({captured:['m1-2','m2-2','m3-2'].map(id=>isolated.api.card(id))}),pendingDecision:{type:'goStopDecision',playerId,score:7}}));
    await isolated.api.presentOnlineGoStopDecision(isolated.api.getState().pendingDecision);
    assert.deepEqual(order,['start:3-STRIPES!','finish:3-STRIPES!','go-stop']);
    assert.equal(isolated.api.getLocked(),true);
  }

  const multiple=loadCurrentGame(),multipleOrder=makeRecorder(multiple);
  multiple.api.setState(multiple.api.makeState({human:multiple.api.makePlayer({captured:['m2-1','m4-1','m8-2','m1-2','m2-2','m3-2'].map(id=>multiple.api.card(id))}),pendingDecision:{type:'goStopDecision',playerId:'playerA',score:7}}));
  await multiple.api.presentOnlineGoStopDecision(multiple.api.getState().pendingDecision);
  assert.deepEqual(multipleOrder,['start:5-BIRDIES!','finish:5-BIRDIES!','start:3-STRIPES!','finish:3-STRIPES!','go-stop']);

  const duplicate=loadCurrentGame(),duplicateOrder=makeRecorder(duplicate);
  duplicate.api.setState(duplicate.api.makeState({human:duplicate.api.makePlayer({captured:['m1-2','m2-2','m3-2'].map(id=>duplicate.api.card(id))}),pendingDecision:{type:'goStopDecision',playerId:'playerA',score:7}}));
  await duplicate.api.presentNewMilestones('playerA');
  duplicateOrder.length=0;
  await duplicate.api.presentOnlineGoStopDecision(duplicate.api.getState().pendingDecision);
  assert.deepEqual(duplicateOrder,['go-stop']);
});

test('ranked Go/Stop dialog shows authoritative Stop payout and the next Go count',async()=>{
  for(const [goCount,expectedLabel] of [[0,'GO'],[1,'2 GO'],[2,'3 GO']]){
    const isolated=loadCurrentGame();
    const player=isolated.api.makePlayer({go:goCount,firstPpeokPoints:7});
    isolated.api.setState(isolated.api.makeState({
      human:player,
      ai:isolated.api.makePlayer(),
      pendingDecision:{type:'goStopDecision',playerId:'playerA',score:7,previousGoScore:0,choices:['go','stop']}
    }));
    await isolated.api.presentOnlineGoStopDecision(isolated.api.getState().pendingDecision);
    assert.equal(isolated.elements.get('goBtn').textContent,expectedLabel);
    const expectedStop=7+(goCount>0&&goCount<3?goCount:0);
    assert.match(isolated.elements.get('stopPreviewValue').textContent,new RegExp(String(expectedStop)));
  }
});

test('ranked new hands reset milestone history so Godori can animate again before Go Stop',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const transition=source.slice(source.indexOf("if(presentationEvents.some(event=>event.type==='newHandCreated'))"),source.indexOf("for(const event of presentationEvents)"));
  assert.match(transition,/presentation\.milestoneHistory=\{playerA:new Set\(\),playerB:new Set\(\)\}/);
  const milestoneAt=source.indexOf('await presentNewMilestones(completedTurn.actorId)');
  const driveAt=source.indexOf('await driveOnline(snapshot,presentationEvents)',milestoneAt);
  assert.ok(milestoneAt>=0&&driveAt>milestoneAt);
});

test('Stripe milestone titles are set-specific in Korean and remain generic elsewhere',()=>{
  const i18n=require('../i18n.js'),keys=['threeStripesRed','threeStripesBlue','threeStripesGrass'];
  assert.deepEqual(keys.map(key=>i18n.translate('ko',key)),['홍단!','청단!','초단!']);
  assert.deepEqual(keys.map(key=>i18n.translate('en',key)),['3-STRIPES!','3-STRIPES!','3-STRIPES!']);
  for(const dictionary of Object.values(i18n.dictionaries))for(const key of keys)assert.equal(Object.hasOwn(dictionary,key),true);
  for(const locale of ['es','fr','de','ja','zh'])for(const key of keys)assert.equal(i18n.dictionaries[locale][key],i18n.dictionaries[locale].threeStripes);
  for(const key of keys)assert.equal(i18n.REQUIRED_UI_KEYS.includes(key),true);
});

test('terminal Online presentation awaits semantics and milestones before opening any result',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),transition=source.slice(source.indexOf('async function presentOnlineTransition'),source.indexOf('async function submitOnlineCardPlay'));
  const semantic=transition.indexOf("event.type==='sweepTriggered'"),milestone=transition.indexOf('await presentNewMilestones(completedTurn.actorId)'),terminal=transition.indexOf('if(chongtong)presentChongtong(chongtong)');
  assert.ok(semantic>=0&&semantic<milestone&&milestone<terminal);
  for(const token of ['presentChongtong(chongtong)','presentThreePpeok({events:[threePpeok]})','setGrandResult(t(\'noWinner\')','presentStopResult({events:presentationEvents})'])assert.ok(transition.indexOf(token)>milestone,token);
  assert.match(transition,/completedTurn=presentationEvents\.find\(event=>event\.type==='turnCompleted'\)/);
  const solo=source.slice(source.indexOf('async function concludeTurn'),source.indexOf('function scheduleTurnStart'));
  assert.ok(solo.indexOf('await presentNewMilestones')<solo.indexOf('evaluateGoStop'));assert.ok(solo.indexOf('await presentNewMilestones')<solo.indexOf('presentStopResult'));
  const milestones=source.slice(source.indexOf('async function presentNewMilestones'),source.indexOf('function bestAiCard'));
  assert.match(milestones,/for\(const milestone[^]*await sleep\(2000\)[^]*await sleep\(120\)/);
});

test('temporary deck and capture cards reuse the canonical card-face path and stable hover shell',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.equal(source.includes("front.className='deck-draw-face deck-draw-front card canonical-card-face'"),true);
  assert.equal(source.includes('front.appendChild(createCardFaceImage(card))'),true);
  assert.equal(source.includes("el.className=`${className} card canonical-card-face normal-gameplay-card`"),true);
  assert.equal(css.includes('.deck-draw-front{transform:rotateY(180deg) translateZ(1px)}'),true);
  assert.equal(css.includes('.deck-draw-front{transform:rotateY(180deg);background:#f5efe3'),false);
  assert.equal(source.includes("slot.className='hand-card-slot'"),true);
  assert.equal(css.includes('.hand-card-slot.is-hovered .hand-card'),true);
  assert.equal(source.includes('SpeechSynthesisUtterance'),false);
  assert.equal(source.includes("laugh:'https://"),false);
});

test('GoStop Online Conquer minimum is seven for two players and three for future larger tables',()=>{
  assert.equal(extractedEngine.conquerMinimumPoints(2),7);
  assert.equal(extractedEngine.conquerMinimumPoints(3),3);
  assert.equal(extractedEngine.conquerMinimumPoints(4),3);
});

test('opening Bomb arms without moving cards or changing the selected starter',()=>{
  let state=stateWith({startingPlayerId:'playerB',turn:'playerB',floor:[card('m6-4')],human:api.makePlayer({hand:cards('m6-1','m6-2','m6-3')})});
  api.initFloorSlots(state);state=extractedEngine.resolveOpeningState(state).state;
  const before=JSON.stringify({hand:state.human.hand,floor:state.floor,turn:state.turn});
  const result=extractedEngine.applyNormalTurnAction(state,{type:'declareBomb',actorId:'playerA'});
  assert.equal(JSON.stringify({hand:result.state.human.hand,floor:result.state.floor,turn:result.state.turn}),before);
  assert.deepEqual(result.state.human.armedBombMonths,[6]);
  assert.equal(result.state.startingPlayerId,'playerB');
});

test('Bomb blank buttons recover from stale presentation locks but remain single-flight',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/const blankInputDisabled=onlineMode\?!rankedHandInputEnabled\(\):\(state\.turn!==PLAYER_A\|\|!!state\.winner\|\|presentation\.blankTurnInFlight\|\|presentation\.activePhysicalMotions>0\|\|!!state\.pendingDecision\|\|!!presentation\.targetChoice\|\|!!presentation\.shakeResolver\|\|!!presentation\.bombResolver\)/);
  assert.match(source,/blank\.disabled=blankInputDisabled/);
  const blankHandler=source.slice(source.indexOf('async function humanUseBombBlank'),source.indexOf('async function humanPlay'));
  assert.doesNotMatch(blankHandler,/if\(presentation\.locked/);
  assert.match(blankHandler,/presentation\.blankTurnInFlight=true;presentation\.locked=true;render\(\)/);
  assert.match(blankHandler,/finally\{presentation\.blankTurnInFlight=false;\}/);
  const reset=source.slice(source.indexOf('function resetHandPresentationState'),source.indexOf('function fullSizeSourceRect'));
  assert.match(reset,/presentation\.blankTurnInFlight=false/);
});

test('No Winner authority requires both hands, blank opportunities, turns, and decisions to be exhausted',()=>{
  let state=exhaustedState();
  assert.equal(extractedEngine.isHandExhausted(state),true);
  state.ai.hand=[card('m1-1')];assert.equal(extractedEngine.isHandExhausted(state),false);
  state.ai.hand=[];state.human.bombFreeTurns=1;assert.equal(extractedEngine.isHandExhausted(state),false);
  state.human.bombFreeTurns=0;state.pendingDecision={type:'goStopDecision'};assert.equal(extractedEngine.isHandExhausted(state),false);
});

test('all seven locales explicitly populate every canonical required UI key',()=>{
  const i18n=require('../i18n.js');
  const keys=[...i18n.REQUIRED_UI_KEYS].sort();
  assert.deepEqual(Object.keys(i18n.dictionaries).sort(),['de','en','es','fr','ja','ko','zh']);
  for(const [locale,dictionary] of Object.entries(i18n.dictionaries)){
    assert.deepEqual(Object.keys(dictionary).sort(),keys,`${locale} must explicitly define exactly the required keys`);
    assert.equal(keys.every(key=>typeof dictionary[key]==='string'&&dictionary[key].trim().length>0),true);
  }
  for(const locale of ['es','fr','de','ko','ja','zh'])for(const key of ['language','howTo','newGame','wins','captured','brights','pictures','stripes','singles','pooped','kiss','cleanSweep','birdies','conquer','noWinner','tutorialOverview'])assert.notEqual(i18n.dictionaries[locale][key],i18n.dictionaries.en[key],`${locale}.${key} must not rely on English`);
  assert.equal(i18n.translate('xx','newGame'),i18n.dictionaries.en.newGame);
  assert.equal(i18n.brand,'GoStop Live!');
});

test('Online start controls and client-owned connection statuses are fully localized',()=>{
  const i18n=require('../i18n.js'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const controls={createOnlineGame:'Create Online Game',roomCode:'Room code',joinGame:'Join Game'};
  for(const [key,english] of Object.entries(controls)){
    assert.equal(i18n.dictionaries.en[key],english);
    assert.match(html,new RegExp(`data-i18n="${key}"[^>]*>${english.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<`));
  }
  assert.deepEqual(Object.keys(controls).map(key=>i18n.translate('ko',key)),['온라인 게임 만들기','방 코드','게임 참가']);
  const statusKeys=['creatingRoom','joiningRoom','shareRoomCode','roomWaitingConnection','roomWaitingOpponent','matchReady','opponentConnectedMatchReady','authorityDisconnected','onlineAuthorityDisconnected'];
  for(const dictionary of Object.values(i18n.dictionaries))for(const key of [...Object.keys(controls),...statusKeys])assert.equal(Object.hasOwn(dictionary,key),true,key);
  for(const key of statusKeys)assert.match(source,new RegExp(`t\\('${key}'`));
  for(const english of ['Creating room…','Share room code:','waiting for connection…','waiting for opponent','Match ready.','Opponent connected. Match ready.','Disconnected from the authoritative server. Reconnect before playing.','Online authority is disconnected. Reconnect before acting.'])assert.equal(source.includes(`textContent='${english}'`)||source.includes(`textContent=\`${english}`),false,english);
  api.setLocale('ko');
  assert.deepEqual(Object.keys(controls).map(key=>i18n.translate('ko',key)),['온라인 게임 만들기','방 코드','게임 참가']);
  api.setLocale('en');
});

test('New Game reset warning is localized and limited to all three New Game request states',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),i18n=require('../i18n.js');
  for(const dictionary of Object.values(i18n.dictionaries))assert.equal(typeof dictionary.newGameResetWarning==='string'&&dictionary.newGameResetWarning.length>0,true);
  assert.equal(i18n.dictionaries.en.newGameResetWarning,'Starting a New Game will reset all wins, points, and achievements from this session and start fresh.');
  for(const id of ['newGameDialog','newGameWaitingDialog','incomingNewGameDialog']){
    const dialog=html.slice(html.indexOf(`<dialog id="${id}"`),html.indexOf('</dialog>',html.indexOf(`<dialog id="${id}"`)));
    assert.match(dialog,/data-i18n="newGameResetWarning"/);
  }
  const replay=html.slice(html.indexOf('<dialog id="replayWaitingDialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="replayWaitingDialog"')));
  const requester=html.slice(html.indexOf('<dialog id="newGameWaitingDialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="newGameWaitingDialog"')));
  const receiver=html.slice(html.indexOf('<dialog id="incomingNewGameDialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="incomingNewGameDialog"')));
  assert.equal(i18n.dictionaries.en.waitingForOpponentToAcceptNewGame,'Waiting for Opponent to Accept New Game');
  assert.match(requester,/data-i18n="waitingForOpponentToAcceptNewGame">Waiting for Opponent to Accept New Game</);
  assert.match(requester,/data-i18n="newGameResetWarning"/);assert.match(requester,/data-i18n="cancel">Cancel</);
  assert.equal(i18n.dictionaries.en.opponentNewGameRequest,'Opponent Has Requested to Start a New Game');
  assert.match(receiver,/data-i18n="opponentNewGameRequest">Opponent Has Requested to Start a New Game</);
  assert.match(receiver,/data-i18n="newGameResetWarning"/);assert.match(receiver,/data-i18n="accept">Accept</);assert.match(receiver,/data-i18n="decline">Decline</);assert.doesNotMatch(receiver,/data-i18n="(?:yes|no)"/);
  assert.match(replay,/data-i18n="waitingForOpponent">Waiting for Opponent</);assert.doesNotMatch(replay,/waitingForOpponentToAcceptNewGame|newGameResetWarning/);
  for(const dictionary of Object.values(i18n.dictionaries))for(const key of ['waitingForOpponentToAcceptNewGame','accept','decline'])assert.equal(typeof dictionary[key], 'string');
  const reconcile=source.slice(source.indexOf('function reconcileOnlineFlow'),source.indexOf('function returnOnlineToMenu'));
  assert.match(reconcile,/setDialog\(els\.newGameWaitingDialog,!!request\?\.requestedByYou\)/);
  assert.match(reconcile,/setDialog\(els\.incomingNewGameDialog,!!request&&!request\.requestedByYou\)/);
});

test('shared milestone overlay clears KISS effects before every scoring milestone',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const transient=source.slice(source.indexOf('async function showSpecialTransient'),source.indexOf('async function presentSemanticEvents'));
  const milestones=source.slice(source.indexOf('async function presentNewMilestones'),source.indexOf('function bestAiCard'));
  assert.match(transient,/dataset\.effect=effect/);const kiss=source.slice(source.indexOf('async function presentKiss'),source.indexOf('function detectNewMilestones'));assert.match(kiss,/showSpecialTransient\('KISS!',cardIds,'kiss',epoch\)/);
  assert.match(milestones,/milestoneOverlay\.dataset\.effect=''/);
  assert.match(milestones,/if\(milestone\.birds\)for\(let index=0;index<5;index\+\+\)/);
  assert.match(milestones,/if\(milestone\.birds\)playBirdSound\(\)/);
  for(const key of ['birdies','threeStripes','fiveBrights'])assert.doesNotMatch(milestones,new RegExp(`${key}[^\\n]*kiss`));
});

test('GoStop Live branding uses semantic partial italics without renaming Online mode controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(html,/<title>GoStop Live!<\/title>/);
  assert.match(html,/<span class="brand-mark">GoStop <em>Live!<\/em><\/span>/);
  assert.match(css,/\.brand-mark\{[^}]*font-style:normal/);assert.match(css,/\.brand-mark em\{font-style:italic\}/);
  assert.doesNotMatch(html,/GoStop Online/);
  assert.match(html,/>Create Online Game<\/button>/);assert.match(html,/id="joinOnlineForm"/);
});

test('visual beginner guide covers every section with canonical GoStop Card evidence',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  for(const section of ['guide-overview','guide-types','guide-turn','guide-matches','guide-specials','guide-scoring','guide-go','guide-hands'])assert.match(html,new RegExp(`id="${section}"`));
  for(const query of ['bright','animal','ribbon','single','doublePi-11','doublePi-12','switchPi'])assert.equal(html.includes(`data-tutorial-query="${query}"`),true);
  for(const cards of ['m1-1,m3-1,m8-1,m11-1,m12-1','m2-1,m2-2,m2-3','m2-4','m2-1,m4-1,m8-2'])assert.equal(html.includes(`data-card-ids="${cards}"`),true);
  for(const go of ['<td>1 Go</td><td>+1</td>','<td>3 Go</td><td>×2</td>','<td>5 Go</td><td>×8</td>'])assert.equal(html.includes(go),true);
  assert.equal(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8').includes("createCardEl(card,'card tutorial-game-card')"),true);
});

test('dynamic deck backs are exact at five through zero and proportional above five',()=>{
  assert.deepEqual([5,4,3,2,1,0].map(api.deckVisualBackCount),[5,4,3,2,1,0]);
  assert.equal(api.deckVisualBackCount(48),12);
  assert.equal(api.deckVisualBackCount(20),5);
});

test('desktop fit helper preserves a single aspect scale and never enlarges the design',()=>{
  assert.equal(api.computeStageScale(1530,976),1);
  assert.equal(api.computeStageScale(765,976),.5);
  assert.ok(api.computeStageScale(1280,720)<=1);
});

test('November and December Shakes multiply by four and compound with normal Shake',()=>{
  let state=stateWith({turn:'playerA',human:api.makePlayer({hand:cards('m10-1','m10-2','m10-3','m11-1','m11-2','m11-3','m12-1','m12-2','m12-3')})});
  state=extractedEngine.resolveOpeningState(state).state;
  const multipliers=[];
  for(const month of [10,11,12]){assert.equal(state.pendingDecision.month,month);const result=extractedEngine.applyNormalTurnAction(state,{type:'declareShake',actorId:'playerA'});state=result.state;multipliers.push(result.events[0].declarationMultiplier);}
  assert.deepEqual(multipliers,[2,4,4]);assert.equal(state.human.shakeMultiplier,32);
  const settlement=extractedEngine.calculateSettlement({winner:{...state.human,captured:sevenPointPi()},loser:api.makePlayer({captured:[card('m1-3')]})});
  assert.equal(settlement.reasons.includes('Shake ×32'),true);
});

test('an armed opening Bomb intercepts any armed card before normal play and executes all three',()=>{
  let state=stateWith({turn:'playerA',startingPlayerId:'playerA',floor:[card('m6-4')],human:api.makePlayer({hand:cards('m6-1','m6-2','m6-3')}),ai:api.makePlayer({captured:[card('m7-3')]})});api.initFloorSlots(state);
  state=extractedEngine.resolveOpeningState(state).state;state=extractedEngine.applyNormalTurnAction(state,{type:'declareBomb',actorId:'playerA'}).state;
  const bomb=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:'m6-2'});
  assert.equal(bomb.pendingDecision,null);assert.equal(bomb.state.pendingTurn.mode,'bomb');
  assert.equal(bomb.state.human.hand.length,0);assert.deepEqual(bomb.state.human.captured.slice(0,4).map(card=>card.id),['m6-1','m6-2','m6-3','m6-4']);assert.equal(bomb.state.human.bombFreeTurns,2);assert.equal(bomb.events.filter(event=>event.type==='piTransferred').length,1);
});

test('Sweep public event carries exact evidence cards and transfers exactly one Single',()=>{
  const result=specialFixture('playerA',{floor:[],handCard:card('m5-1'),drawCard:card('m5-2'),remainingHand:[card('m9-3')],captured:[card('m7-3'),card('m8-3')]});
  const sweep=result.events.find(event=>event.type==='sweepTriggered');assert.deepEqual(sweep.cardIds,['m5-1','m5-2']);assert.equal(result.events.filter(event=>event.type==='piTransferred'&&event.reason==='sweep').length,1);
});

test('dynamic event names are resolved from the active locale keys',()=>{
  const i18n=require('../i18n.js');assert.equal(i18n.translate('en','tapTap'),'FLUSH!');assert.equal(i18n.translate('ko','tapTap'),'따닥!');assert.equal(i18n.translate('en','birdies'),'5-BIRDIES!');assert.equal(i18n.translate('ko','birdies'),'고도리!');
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');assert.equal(source.includes('t(milestone.titleKey)'),true);assert.equal(source.includes("title=t(titleKeys[title]||title)"),true);
});

test('tutorial Overview renders every four-card month family through canonical cards',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');assert.equal(html.includes('id="monthGuide"'),true);assert.equal(source.includes('for(let month=1;month<=12;month++)'),true);assert.equal(source.includes('MASTER_DECK.filter(card=>card.month===month)'),true);
});

test('New Game authority seam still works internally even though the in-game New Game control is removed',()=>{
  const original=stateWith({human:api.makePlayer({hand:[card('m1-1')]})});api.setState(original);const before=JSON.stringify(api.getState());assert.equal(api.confirmNewGame(false),false);assert.equal(JSON.stringify(api.getState()),before);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');assert.equal(source.includes("optionsNewGameBtn.addEventListener('click'"),false);assert.doesNotMatch(html,/id="optionsNewGameBtn"/);assert.match(source,/invalidateGameplayPresentation\(\);beginGameplayPresentation\(\);[^]*resetSession\(\);startGame\(gameplayPresentationEpoch\)/);
});

test('Online New Game submits to server authority without creating a local game',()=>{
  const original=stateWith({human:api.makePlayer({hand:[card('m1-1')]})}),submitted=[];api.setState(original);api.setOnlineMode(true);api.setOnlineSubmit(action=>submitted.push(action));
  assert.equal(api.confirmNewGame(true),true);assert.equal(JSON.stringify(submitted),JSON.stringify([{type:'requestNewGame'}]));assert.equal(api.getState(),original);
  api.setOnlineMode(false);
});

test('multiplayer flow UI and Go submission remain authoritative and fail closed',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/data-i18n="resultQuit"[^>]*id="newGameBtn"[^>]*>Quit Game</);assert.doesNotMatch(html,/id="optionsMenu"|id="optionsNewGameBtn"|id="optionsQuitBtn"/);
  for(const id of ['replayWaitingDialog','resultQuitBtn','newGameWaitingDialog','cancelNewGameBtn','incomingNewGameDialog','acceptNewGameBtn','rejectNewGameBtn','quitConfirmDialog','opponentEndedDialog'])assert.ok(html.includes(`id="${id}"`),id);
  assert.match(source,/if\(onlineMode\)\{if\(onlineSubmit\(\{type:'declareGo'\}\)\)els\.decisionDialog\.close\(\);return;\}/);
  assert.match(source,/if\(onlineMode\)\{if\(onlineSubmit\(\{type:'declareStop'\}\)\)els\.decisionDialog\.close\(\);return;\}/);
  assert.equal(api.canSubmitPlayAgain({terminalResult:{winnerId:'playerA'}}),true);
  assert.equal(api.canSubmitPlayAgain({terminalResult:null}),false);
  assert.equal(api.canSubmitPlayAgain(null),false);
  assert.match(source,/if\(canSubmitPlayAgain\(latestOnlineSnapshot\)\)\{[^]*onlineSubmit\(\{type:'playAgainReady'\}\)/);
  assert.match(source,/if\(els\.resultDialog\?\.open\)els\.resultDialog\.close\(\)/);
  assert.doesNotMatch(source,/onlineSubmit\(\{type:'newHand'\}/);
});

test('Online result offers localized Quit Game while replay waiting has no quit control',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const result=html.slice(html.indexOf('id="resultDialog"'),html.indexOf('id="goCallout"'));
  assert.match(result,/id="playAgainBtn"[^]*id="resultQuitBtn"[^]*data-i18n="resultQuit"/);
  const waiting=html.slice(html.indexOf('id="replayWaitingDialog"'),html.indexOf('id="newGameWaitingDialog"'));
  assert.match(waiting,/Waiting for Opponent/);assert.doesNotMatch(waiting,/button|Quit Playing/);
  assert.match(source,/quitConfirmTitle\.textContent=t\('resultQuitConfirm'\);els\.quitConfirmMessage\.textContent=t\('resultQuit'\)/);
  assert.match(source,/onlineQuitFromResult&&!els\.resultDialog\.open[^]*els\.resultDialog\.showModal\(\)/);
  assert.match(source,/onlineSubmit\(\{type:'quitGame'\}\)/);
  assert.match(source,/quitConfirmTitle\.textContent=t\('quitConfirmTitle'\);els\.quitConfirmMessage\.textContent=t\('quitConfirmMessage'\)/);
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8'),waitingRule=css.match(/#replayWaitingDialog\[open\]\{([^}]+)\}/)?.[1]||'',cardRule=css.match(/#replayWaitingDialog \.flow-dialog-card\{([^}]+)\}/)?.[1]||'';
  for(const declaration of ['position:fixed','inset:0','margin:auto'])assert.ok(waitingRule.includes(declaration),declaration);
  assert.match(cardRule,/min-width:min\(560px,88vw\)/);assert.match(cardRule,/min-height:min\(240px,42vh\)/);
  assert.match(source,/if\(open&&!dialog\.open\)dialog\.showModal\(\)/);
});

test('rejected Online actions resync authority while remaining fail closed',()=>{
  for(const type of ['playAgainReady','requestNewGame','respondNewGame','cancelNewGame','quitGame'])assert.equal(api.isOnlineSessionFlowAction({type}),true);
  assert.equal(api.isOnlineSessionFlowAction({type:'attemptPlayCard'}),false);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const rejected=source.slice(source.indexOf("adapter.addEventListener('actionRejected'"),source.indexOf("adapter.addEventListener('error'"));
  assert.ok(rejected.indexOf('presentation.locked=true;render()')<rejected.indexOf('adapter.sync()'));
  assert.doesNotMatch(rejected,/presentation\.locked=false/);
});

test('Online presentation bookkeeping is bounded and automatic actions wait for presentation',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/onlinePresentedEvents\.size>256/);assert.match(source,/onlinePresentedEvents\.delete/);assert.match(source,/onlinePresentedEvents\.clear\(\)/);
  assert.match(source,/if\(presentation\.goCalloutTimer\)clearTimeout/);
  const accepted=source.slice(source.indexOf("adapter.addEventListener('actionAccepted'"),source.indexOf("adapter.addEventListener('actionRejected'"));assert.ok(accepted.indexOf('await onlinePresentationQueue')<accepted.indexOf('const automatic=')&&accepted.indexOf('const automatic=')<accepted.indexOf('onlineSubmit(automatic)'));
});

test('mode-aware localization refreshes Online opponent labels in both directions and preserves Solo Computer',()=>{
  api.setOnlineMode(true);api.setLocale('ko');assert.equal(selectors.get('.cpu-chip .player-identity strong').textContent,'상대');
  api.setLocale('en');assert.equal(selectors.get('.cpu-chip .player-identity strong').textContent,'Opponent');assert.equal(selectors.get('.cpu-capture-panel .capture-panel-title').textContent,'Opponent Captured Cards');assert.equal(JSON.stringify([...elements.values(),...selectors.values()].map(element=>element.textContent)).includes('상대'),false);
  api.setLocale('ko');assert.equal(selectors.get('.cpu-chip .player-identity strong').textContent,'상대');
  api.setOnlineMode(false);api.setLocale('en');assert.equal(selectors.get('.cpu-chip .player-identity strong').textContent,'Computer');
});

test('shuffle remains secure rejection-sampled Fisher-Yates with only floor-four retry',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');assert.equal(source.includes('cryptoApi.getRandomValues(buf)'),true);assert.equal(source.includes('while(value >= limit)'),true);assert.equal(source.includes('for(let i=a.length-1;i>0;i--)' ),true);assert.equal(source.includes('if (!hasFourOfMonth(floor)) break'),true);assert.equal(extractedEngine.masterDeck.length,48);assert.equal(new Set(extractedEngine.masterDeck.map(card=>card.id)).size,48);
});

test('each production shuffle starts from a fresh complete deck and deals disjoint 10/10/8/20 partitions',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const fresh=source.slice(source.indexOf('function freshState'),source.indexOf('function requireCrypto'));
  assert.match(fresh,/deck = shuffle\(MASTER_DECK\.map\(c => \(\{\.\.\.c\}\)\)\)/);
  assert.match(fresh,/human\.push\(\.\.\.deck\.splice\(0,5\)\).*ai\.push\(\.\.\.deck\.splice\(0,5\)\).*floor\.push\(\.\.\.deck\.splice\(0,4\)\)/s);
  assert.doesNotMatch(source,/(?:localStorage|sessionStorage)\.(?:getItem|setItem)\([^)]*(?:deck|shuffle)/i);
  const orders=new Set();
  for(let sample=0;sample<128;sample++){
    const deck=api.shuffle(api.masterDeck()),human=[],computer=[],floor=[];
    for(let pass=0;pass<2;pass++){human.push(...deck.splice(0,5));computer.push(...deck.splice(0,5));floor.push(...deck.splice(0,4));}
    const partitions=[human,computer,floor,deck];assert.deepEqual(partitions.map(part=>part.length),[10,10,8,20]);
    const all=partitions.flat(),ids=all.map(item=>item.id);assert.equal(new Set(ids).size,48);api.assertDeckIntegrity(all);orders.add(ids.join(','));
  }
  assert.equal(orders.size,128);
});

test('starter dice remains presentation-only, rolls only for a new session, and settles after its audio gate',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');const sequence=source.slice(source.indexOf('async function presentOpeningSequence'),source.indexOf('function playDiceSound'));
  assert.ok(sequence.indexOf("classList.add('rolling')")<sequence.indexOf('playDiceSound()'));
  assert.ok(sequence.indexOf('await sleep(900)')<sequence.indexOf("classList.remove('rolling')"));
  assert.ok(sequence.indexOf("classList.remove('rolling')")<sequence.indexOf('els.openingDie.textContent=starter===PLAYER_A?dieFaces[0]:dieFaces[1]'));
  assert.equal(source.includes('const firstSessionHand=consumeSessionStart()'),true);assert.equal(source.includes('if(firstSessionHand)await presentOpeningSequence(starter,true,epoch)'),true);assert.equal(source.includes('else await presentDealSequence(epoch)'),true);assert.equal(source.includes('presentation.nextStarterId=terminal.winnerId||state.startingPlayerId'),true);assert.equal(source.includes('secureRandomInt(2)===0?PLAYER_A:PLAYER_B'),true);
});

test('opening setup scans both hands, offers floor-aware choices, and preserves starter until declarations finish',()=>{
  let state=stateWith({startingPlayerId:'playerB',turn:'playerB',floor:[card('m4-4')],human:api.makePlayer({hand:cards('m4-1','m4-2','m4-3')}),ai:api.makePlayer({hand:cards('m7-1','m7-2','m7-3')})});api.initFloorSlots(state);
  let opened=extractedEngine.resolveOpeningState(state);assert.equal(opened.pendingDecision.playerId,'playerA');assert.deepEqual(opened.pendingDecision.choices,['shake','bomb']);
  opened=extractedEngine.applyNormalTurnAction(opened.state,{type:'declareBomb',actorId:'playerA'});assert.equal(opened.pendingDecision.playerId,'playerB');assert.deepEqual(opened.pendingDecision.choices,['shake','keepSecret']);
  opened=extractedEngine.applyNormalTurnAction(opened.state,{type:'keepShakeSecret',actorId:'playerB'});assert.equal(opened.state.openingSpecialsComplete,true);assert.equal(opened.state.turn,'playerB');assert.equal(opened.state.startingPlayerId,'playerB');
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');const start=source.slice(source.indexOf('async function startGame'),source.indexOf("document.addEventListener('pointerdown',unlockAudio"));assert.ok(start.indexOf('await presentOpeningSequence')<start.indexOf('await processOpeningSpecials'));
});

test('opponent Pooped-pile capture transfers one available Single and zero when none exists',()=>{
  for(const captured of [cards('m7-3','m8-3'),[]]){const stack=cards('m2-1','m2-2','m2-3');const result=specialFixture('playerA',{floor:stack,handCard:card('m2-4'),drawCard:card('m9-3'),captured,floorStacks:{2:{month:2,cardIds:stack.map(card=>card.id),source:'ppeok',owner:'playerB'}},targetId:'m2-3'});const transfers=result.events.filter(event=>event.type==='piTransferred'&&event.reason==='opponentPpeok');assert.equal(transfers.length,captured.length?1:0);}
});

test('ordinary opponent Pooped pickup emits and presents exactly one physical Single transfer',async()=>{
  const stack=cards('m2-1','m2-2','m2-3');
  const result=specialFixture('playerA',{floor:[...stack,card('m8-2')],handCard:card('m2-4'),drawCard:card('m9-3'),remainingHand:[card('m10-3')],captured:cards('m7-3','m8-3'),floorStacks:{2:{month:2,cardIds:stack.map(card=>card.id),source:'ppeok',owner:'playerB'}},targetId:'m2-3'});
  const transfers=result.events.filter(event=>event.type==='piTransferred');
  assert.deepEqual(transfers.map(event=>[event.reason,event.cardId]),[['opponentPpeok','m7-3']]);
  assert.equal(result.state.human.captured.some(item=>item.id==='m7-3'),true);assert.equal(result.state.ai.captured.some(item=>item.id==='m7-3'),false);
  api.resetPiTransferAnimationCount();await api.presentPiTransferEvents('human',result.events);
  assert.equal(api.getPresentationSnapshot().piTransferAnimationCount,1);
});

test('non-Sweep special presentation is awaited before threshold evaluation and handoff',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');const presenter=source.slice(source.indexOf('async function resolveExtractedSpecialTurn'),source.indexOf('async function playFullTurn'));assert.ok(presenter.includes("await showSpecialTransient('KISS!'"));assert.ok(presenter.includes("await showSpecialTransient('FLUSH!'"));
  const turn=source.slice(source.indexOf('async function playFullTurn'),source.indexOf('async function executeDeckOnlyTurn'));assert.ok(turn.indexOf('await resolveExtractedSpecialTurn')<turn.indexOf('await concludeTurn(side,epoch)'));
  const conclude=source.slice(source.indexOf('async function concludeTurn'),source.indexOf('function scheduleTurnStart'));assert.ok(conclude.indexOf('await presentNewMilestones')<conclude.indexOf('evaluateGoStop'));
});

test('Clean Sweep presentation includes actor-independent broom animation, sound, and exact event cards',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');const semantic=source.slice(source.indexOf('async function presentSemanticEvents'),source.indexOf('function detectNewMilestones'));assert.equal(semantic.includes('playSweepSound()'),true);assert.equal(semantic.includes("event.cardIds||[],'sweep'"),true);assert.equal(semantic.includes("actorId===PLAYER_A"),false);assert.equal(source.includes("broom.className='sweep-broom'"),true);assert.equal(source.includes("finally{broom.remove();}"),true);assert.equal(css.includes('data-effect="sweep"'),false);
});

test('5-Birdies presentation flies exactly five birds with synchronized chirps and exact three scoring cards',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8'),i18n=require('../i18n.js');assert.equal(i18n.translate('en','birdies'),'5-BIRDIES!');assert.equal(i18n.translate('ko','birdies'),'고도리!');assert.equal(source.includes('for(let index=0;index<5;index++)'),true);assert.equal(source.includes('if(milestone.birds)playBirdSound()'),true);assert.equal(css.includes('animation:birdFly 2s'),true);const state=stateWith({ai:api.makePlayer({captured:cards('m2-1','m4-1','m8-2')})});api.setState(state);const event=api.detectNewMilestones('playerB')[0];assert.equal(event.cardIds.length,3);
});

test('tutorial keeps its header and navigation outside the scrolling lesson body on desktop and mobile',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.equal(source.includes("if(event.target===els.howToDialog)els.howToDialog.close()"),true);
  assert.match(html,/class="tutorial-header"/);assert.match(html,/class="dialog-close tutorial-close"/);assert.match(html,/class="tutorial-sections"/);
  assert.match(css,/\.tutorial-card\{box-sizing:border-box;[^}]*overflow:hidden;display:grid;grid-template-rows:auto auto minmax\(0,1fr\)/);
  assert.match(css,/\.tutorial-sections\{[^}]*overflow-y:auto/);assert.match(css,/\.tutorial-header \.tutorial-close\{position:static/);
  assert.match(css,/@media\(max-width:700px\)\{[^]*\.tutorial-dialog\{width:100vw;height:100dvh/);
});

test('status panels use four stable siblings and horizontal localized identity text',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.equal((html.match(/class="player-status-component/g)||[]).length,2);
  assert.equal((html.match(/class="player-identity"/g)||[]).length,2);
  assert.equal((html.match(/class="status-badges"/g)||[]).length,2);
  assert.match(css,/player-status-component\{display:inline-flex.*width:max-content/);
  assert.match(css,/player-chip\{width:auto;max-width:270px;grid-template-columns:44px minmax\(104px,160px\) 62px/);
  assert.match(css,/writing-mode:horizontal-tb/);
});

test('Shake review records one evidence group and its own multiplier per declaration',()=>{
  let state=stateWith({human:api.makePlayer({hand:cards('m11-1','m11-2','m11-3','m10-1','m10-2','m10-3')})});
  state=extractedEngine.resolveOpeningState(state).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'declareShake',actorId:'playerA'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'declareShake',actorId:'playerA'}).state;
  assert.equal(state.human.shakeMultiplier,8);
  assert.deepEqual(state.human.revealedShakeSets.map(set=>[set.declarationMultiplier,set.cardIds.length]),[[2,3],[4,3]]);
  const restored=extractedEngine.deserializeGameState(extractedEngine.serializeGameState(state));
  assert.deepEqual(restored.human.revealedShakeSets,state.human.revealedShakeSets);
});

test('all authoritative Single steals transfer physical cards with normal-first priority',()=>{
  const cases=[
    {name:'Kiss',floor:[card('m8-1')],handCard:card('m5-1'),drawCard:card('m5-2'),reason:'jjok'},
    {name:'Flush',floor:cards('m3-1','m3-2'),handCard:card('m3-3'),drawCard:card('m3-4'),targetId:'m3-1',reason:'ttadak'}
  ];
  for(const fixture of cases){
    const result=specialFixture('playerA',{...fixture,captured:cards('m12-4','m7-3')});
    assert.deepEqual(result.events.filter(event=>event.type==='piTransferred').map(event=>event.cardId),['m7-3'],fixture.name);
    assert.equal(result.state.human.captured.some(card=>card.id==='m7-3'),true);
    assert.equal(result.state.ai.captured.some(card=>card.id==='m12-4'),true);
  }
  const sweep=specialFixture('playerA',{floor:[],handCard:card('m5-1'),drawCard:card('m5-2'),remainingHand:[card('m9-3')],captured:[card('m12-4')]});
  assert.equal(sweep.events.filter(event=>event.type==='piTransferred').length,1);
  assert.equal(sweep.events[1].cardId,'m12-4');
});

test('opponent Pooped capture plus Sweep transfers exactly two physical Singles once each',()=>{
  const stack=cards('m2-1','m2-2','m2-3');
  const result=specialFixture('playerA',{floor:[...stack,card('m8-2')],handCard:card('m2-4'),drawCard:card('m8-1'),targetId:'m2-3',remainingHand:[card('m9-3')],captured:cards('m12-4','m7-3','m8-3','m10-3'),floorStacks:{2:{month:2,cardIds:stack.map(card=>card.id),source:'ppeok',owner:'playerB'}}});
  const transfers=result.events.filter(event=>event.type==='piTransferred');
  assert.deepEqual(transfers.map(event=>[event.reason,event.cardId]),[['opponentPpeok','m7-3'],['sweep','m8-3']]);
  assert.equal(new Set(transfers.map(event=>event.cardId)).size,2);
  assert.equal(result.state.ai.captured.length,2);
  assert.equal(result.state.human.captured.filter(card=>['m7-3','m8-3'].includes(card.id)).length,2);
});

test('Sweep broom is floor-relative, unique, and removed when its animation finishes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const broom=source.slice(source.indexOf('async function animateSweepBroom'),source.indexOf('async function showSpecialTransient'));
  assert.match(broom,/els\.floor\.getBoundingClientRect\(\)/);
  assert.match(broom,/document\.querySelectorAll\('\.sweep-broom'\).*remove/);
  assert.match(broom,/finally\{broom\.remove\(\);\}/);
});

test('unchanged hand cards retain keyed node identity and explicit hover state across renders',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(source,/existing=new Map\(\[\.\.\.els\.playerHand\.querySelectorAll/);
  assert.match(source,/pointerenter.*setActiveHoveredHandCard/);
  assert.match(source,/playerHand\.addEventListener\('pointerleave'.*setActiveHoveredHandCard/);
  assert.match(css,/hand-card-slot\.is-hovered \.hand-card/);
});

test('tutorial month rows contain four canonical labeled cards without overflow layout',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(source,/MASTER_DECK\.filter\(card=>card\.month===month\)/);
  assert.match(source,/className='tutorial-month-card'/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/month-guide article\{min-width:0;overflow:hidden/);
  assert.match(html,/data-i18n="tutorialCardTypes"/);
});

test('intentional Play Solo start screen owns the first audio-unlocking gesture',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),i18n=require('../i18n.js');
  assert.match(html,/id="soloStartOverlay"/);assert.match(html,/id="playSoloBtn"/);assert.match(html,/data-i18n="playSolo"/);
  assert.match(source,/playSoloBtn\.addEventListener\('click',\(\)=>launchLocalGame\(false\)\)/);const launch=source.slice(source.indexOf('async function launchLocalGame'),source.indexOf("document.addEventListener('pointerdown'",source.indexOf('async function launchLocalGame')));assert.match(launch,/await unlockAudio\(\)/);assert.match(launch,/els\.soloStartOverlay\.hidden=true/);assert.match(launch,/await startGame\(\)/);
  for(const locale of Object.keys(i18n.dictionaries))assert.ok(i18n.dictionaries[locale].playSolo.trim());
});

test('session gate invokes dice presentation once across later hands and once after reset',async()=>{
  api.resetSession();
  const before=api.getPresentationSnapshot().dicePresentationCount;
  for(let hand=0;hand<4;hand++){
    if(api.consumeSessionStart())await api.presentOpeningSequence('playerA',true);
    else await api.presentDealSequence();
  }
  let snapshot=api.getPresentationSnapshot();assert.equal(snapshot.dicePresentationCount,before+1);assert.equal(snapshot.diceSoundCount,before+1);
  api.resetSession();
  if(api.consumeSessionStart())await api.presentOpeningSequence('playerB',true);
  snapshot=api.getPresentationSnapshot();assert.equal(snapshot.dicePresentationCount,before+2);assert.equal(snapshot.diceSoundCount,before+2);
  assert.equal(api.consumeSessionStart(),false);
});

test('normal staged and deck cards keep viewport-scaled canonical dimensions without scale transforms',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  const staging=source.slice(source.indexOf('function cardSize'),source.indexOf('function captureTargetRect'));
  assert.match(staging,/probeRect\.width>0&&probeRect\.height>0/);
  assert.doesNotMatch(staging,/stage\.offsetWidth/);
  assert.match(staging,/normal-gameplay-card/);assert.doesNotMatch(staging,/magnified-card|tutorial-game-card|scale\(/);
  assert.match(staging,/deck-draw-front card canonical-card-face/);
  assert.doesNotMatch(css,/targetPulse[^}]*scale\(/);
  assert.match(css,/hand-card-slot\.is-hovered \.hand-card\{transform:translateY/);
});

test('tutorial derives category examples from canonical metadata and explains every 2x Single card',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),i18n=require('../i18n.js');
  assert.match(source,/card\.type==='bright'/);assert.match(source,/card\.type==='animal'/);assert.match(source,/card\.type==='ribbon'/);assert.match(source,/card\.flags\.includes\('doublePi'\)/);assert.match(source,/card\.flags\.includes\('switchPi'\)/);
  assert.equal(extractedEngine.masterDeck.find(card=>card.month===11&&card.flags.includes('doublePi')).id,'m11-3');
  assert.equal(extractedEngine.masterDeck.find(card=>card.month===12&&card.flags.includes('doublePi')).id,'m12-4');
  assert.equal(extractedEngine.masterDeck.find(card=>card.flags.includes('switchPi')).id,'m9-1');
  assert.doesNotMatch(html,/m9-1,m11-2,m12-2/);
  assert.equal(i18n.dictionaries.en.twoSingleCards,'2x Single Cards');
  for(const locale of Object.keys(i18n.dictionaries))for(const key of ['twoSingleCards','novemberDoubleHelp','decemberDoubleHelp','sakeCupHelp'])assert.ok(i18n.dictionaries[locale][key].trim());
});

test('beginner tutorial explains the 7-point gate, complete scoring, Go ladder, and rule-correct special examples',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),i18n=require('../i18n.js');
  assert.match(i18n.translate('en','scoringGate'),/Seven points is the first eligibility gate/);
  for(const text of ['1 Go','2 Go','3 Go','4 Go','5 Go','×2','×4','×8'])assert.ok(html.includes(text),text);
  for(const text of ['3 Brights without the December Rain Bright','5 Pictures','5 Stripes','10 effective Singles','FIRST POOP!'])assert.ok(html.includes(text),text);
  assert.match(html,/data-card-ids="m6-4"/);assert.match(html,/data-card-ids="m6-3"/);
  assert.doesNotMatch(html,/data-card-ids="m6-1,m7-2,m8-3"/);
  assert.match(html,/data-card-ids="m5-1,m5-2"/);assert.match(html,/data-card-ids="m5-3"/);assert.match(html,/data-card-ids="m5-4"/);
  assert.match(html,/data-card-ids="m1-2,m2-2,m3-2"/);assert.match(html,/data-card-ids="m4-2,m5-2,m7-2"/);assert.match(html,/data-card-ids="m6-2,m9-2,m10-2"/);
  for(const key of ['shakeLong','bombLong','poopedLong','firstPoopLong','triplePoopLong','kissLong','flushLong','cleanSweepLong','conquerLong','birdiesLong','stripesLong','fiveBrightsLong','noWinnerLong'])assert.ok(i18n.translate('en',key).length>80,key);
  assert.equal(Object.keys(i18n.dictionaries.en).includes('shakeLong'),false,'expanded tutorial detail copy stays outside the canonical localized UI dictionary');
});

test('match examples label zero, one, two, and deck-draw month matching instead of unexplained card rows',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/One floor match → capture/);assert.match(html,/No floor match → stays on floor/);assert.match(html,/Two floor matches → choose one/);assert.match(html,/The deck card also matches by month/);
  assert.match(html,/data-card-ids="m8-3"/);assert.match(html,/data-card-ids="m8-1,m8-2"/);
  assert.doesNotMatch(html,/data-card-ids="m10-2,m11-3,m12-3"/);
});

test('normal gameplay semantic class leaves the approved card shell untouched',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.doesNotMatch(css,/\.normal-gameplay-card\s*\{/);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/probe\.className='card normal-gameplay-card card-size-probe'/);
  assert.doesNotMatch(source,/getPropertyValue\('--card-w'\)/);
  assert.match(source,/el\.style\.width=`\$\{rect\.width\}px`.*el\.style\.height=`\$\{rect\.height\}px`/s);
});

test('Player and Computer hands share the same responsive play-area grid column',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(css,/\.opponent-zone,\.player-zone\{grid-template-columns:max-content minmax\(260px,1fr\) minmax\(390px,620px\)/);
  assert.match(css,/\.player-zone>\.hand\{grid-column:2/);
  assert.match(css,/\.opponent-hand\{grid-column:2\}/);
  assert.doesNotMatch(css,/\.player-zone>\.hand\{[^}]*left:/);
});

test('hand hover has one presentation-owned active card and clears on hand exit',()=>{
  api.setActiveHoveredHandCard('m1-1');assert.equal(api.getPresentationSnapshot().activeHoveredHandCardId,'m1-1');
  api.setActiveHoveredHandCard('m2-1');assert.equal(api.getPresentationSnapshot().activeHoveredHandCardId,'m2-1');
  api.setActiveHoveredHandCard(null);assert.equal(api.getPresentationSnapshot().activeHoveredHandCardId,null);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/pointerenter.*setActiveHoveredHandCard\(card\.id\)/);
  assert.match(source,/playerHand\.addEventListener\('pointerleave',\(\)=>setActiveHoveredHandCard\(null\)\)/);
});

test('KISS presentation invokes one dedicated smooch path and respects Sound Off',()=>{
  api.setSoundEnabled(true);const before=api.getPresentationSnapshot().kissSoundCount;api.playKissSound();assert.equal(api.getPresentationSnapshot().kissSoundCount,before+1);
  api.setSoundEnabled(false);api.playKissSound();assert.equal(api.getPresentationSnapshot().kissSoundCount,before+1);api.setSoundEnabled(true);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.equal((source.match(/playKissSound\(\)/g)||[]).length,2);
  assert.match(source,/frequency\.exponentialRampToValueAtTime\(720/);
  assert.doesNotMatch(source,/SpeechSynthesisUtterance/);
});

test('deck countdown is silent in every round and fresh sessions retain only dice audio',async()=>{
  api.resetSession();api.resetAudioTrace();
  assert.equal(api.consumeSessionStart(),true);await api.presentOpeningSequence('playerA',true);assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),['dice']);await api.presentDealSequence();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),['dice']);
  api.resetAudioTrace();assert.equal(api.consumeSessionStart(),false);await api.presentDealSequence();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),[]);
  api.resetAudioTrace();assert.equal(api.consumeSessionStart(),false);await api.presentDealSequence();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),[]);
  api.resetSession();api.resetAudioTrace();assert.equal(api.consumeSessionStart(),true);await api.presentOpeningSequence('playerB',true);await api.presentDealSequence();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),['dice']);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');const deal=source.slice(source.indexOf('async function presentDealSequence'),source.indexOf('function playDiceSound'));assert.doesNotMatch(deal,/playDealSound|playSample|playHitSound|playProceduralNoise|traceAudio/);assert.doesNotMatch(source,/playShuffleSound|function playDealSound|traceAudio\('shuffle'\)|traceAudio\('deal'\)/);
});

test('both seats use one capture-panel sizing contract without player-only stretching',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(html,/capture-panel game-capture-panel cpu-capture-panel/);
  assert.match(html,/capture-panel game-capture-panel player-capture-panel/);
  const contract=css.match(/\.game-capture-panel\{([^}]+)\}/)?.[1]||'';
  for(const declaration of ['width:min(500px,100%)','height:116px','min-height:116px','max-height:116px','padding:8px 12px'])assert.ok(contract.includes(declaration),declaration);
  assert.doesNotMatch(css,/\.player-capture-panel\{[^}]*(?:width|height|padding):/);
  assert.match(css,/\.captured-strip\{[^}]*grid-template-columns:repeat\(4,1fr\)/);
  assert.match(css,/\.captured-mini\{[^}]*width:41px!important;height:auto!important;aspect-ratio:var\(--card-aspect\)/);
  assert.match(css,/@media\(min-width:1051px\)\{\.opponent-zone,\.player-zone\{grid-template-columns:max-content minmax\(260px,1fr\) minmax\(390px,620px\)/);
});

test('opening Keep for Bomb arms authority and any of the three cards triggers the same Bomb',()=>{
  for(const trigger of ['m5-1','m5-2','m5-3']){
    let state=stateWith({startingPlayerId:'playerB',turn:'playerB',human:api.makePlayer({hand:cards('m5-1','m5-2','m5-3')}),ai:api.makePlayer({captured:cards('m1-3','m2-3')})});
    state=extractedEngine.resolveOpeningState(state).state;
    const armed=extractedEngine.applyNormalTurnAction(state,{type:'armOpeningBomb',actorId:'playerA'}).state;
    assert.deepEqual(armed.human.armedBombMonths,[5]);assert.equal(armed.human.hand.length,3);assert.equal(armed.turn,'playerB');assert.equal(armed.startingPlayerId,'playerB');
    const restored=extractedEngine.deserializeGameState(extractedEngine.serializeGameState(armed));restored.floor=[card('m5-4')];restored.floorSlotByCard={'m5-4':0};restored.floorSlotCount=1;restored.turn='playerA';
    const result=extractedEngine.applyNormalTurnAction(restored,{type:'attemptPlayCard',actorId:'playerA',cardId:trigger});assert.equal(result.pendingDecision,null);assert.equal(result.events.filter(event=>event.type==='bombDeclared').length,1);
    const bomb=result.state;
    assert.equal(bomb.human.hand.length,0);assert.deepEqual(new Set(bomb.human.captured.map(c=>c.id)),new Set(['m5-1','m5-2','m5-3','m5-4','m1-3']));assert.equal(bomb.human.bombs,1);assert.equal(bomb.human.bombFreeTurns,2);assert.deepEqual(bomb.human.armedBombMonths,[]);assert.deepEqual(bomb.ai.captured.map(c=>c.id),['m2-3']);
  }
});

test('deterministic Go Stop risk model goes early with a lead, can stop late, and ignores hidden identities',()=>{
  const view={deckCount:12,matchContext:{nagariCarryPower:0},ai:api.makePlayer({hand:cards('m1-1','m2-1','m3-1','m4-1'),captured:[]}),human:{...api.makePlayer({captured:[],firstPpeokPoints:3}),handCount:4}};
  const live=api.aiGoStopDecision(view,{total:9});assert.equal(live.decision,'go');assert.equal(live.lead,6);assert.ok(live.expectedGoValue>live.stopValue);
  assert.equal(api.aiGoStopDecision({...view,human:{...view.human,firstPpeokPoints:0}},{total:7}).decision,'go');
  assert.equal(api.aiGoStopDecision({...view,human:{...view.human,firstPpeokPoints:2}},{total:8}).decision,'go');
  const twoBrights={...view,human:{...view.human,captured:cards('m1-1','m3-1'),firstPpeokPoints:0}};assert.equal(api.aiGoStopDecision(twoBrights,{total:7}).decision,'go');
  const hiddenVariant={...view,deckCount:view.deckCount,ai:{...view.ai,hand:cards('m8-1','m9-1','m10-1','m11-1')}};assert.deepEqual(api.aiGoStopDecision(hiddenVariant,{total:9}),live);
  const lateSafe={...view,deckCount:2,ai:{...view.ai,hand:[card('m1-1')]},human:{...view.human,handCount:1,captured:[],firstPpeokPoints:0}};
  const lateSafeDecision=api.aiGoStopDecision(lateSafe,{total:7});assert.equal(lateSafeDecision.decision,'go');assert.ok(lateSafeDecision.expectedGoValue>lateSafeDecision.stopValue);
  const late={...view,deckCount:2,ai:{...view.ai,hand:[card('m1-1')]},human:{...view.human,handCount:1,firstPpeokPoints:6}};assert.equal(api.aiGoStopDecision(late,{total:7}).decision,'stop');
});

test('canonical card shell is singular across gameplay and special-event contexts',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  const contract=css.match(/\/\* Keep the artwork[^]*?\.canonical-card-face\{([^}]+)\}/)?.[1]||'';
  assert.match(contract,/aspect-ratio:var\(--card-aspect\)/);assert.match(contract,/background:transparent/);assert.match(contract,/border:0/);assert.doesNotMatch(contract,/!important/);
  const art=css.match(/\.canonical-card-face>img\{([^}]+)\}/)?.[1]||'',frame=css.match(/\.canonical-card-face::after\{([^}]+)\}/)?.[1]||'';
  assert.match(art,/width:100%/);assert.match(art,/height:100%/);assert.match(art,/object-fit:contain/);assert.match(art,/background:transparent/);
  assert.match(frame,/position:absolute/);assert.match(frame,/inset:0/);assert.match(frame,/border:1px solid #b33226/);
  assert.doesNotMatch(css,/\.card,\.physical-card,\.flying-card,\.capture-ghost\{/);
  assert.doesNotMatch(css,/\.deck-draw-front\{[^}]*(?:background|border):/);
  assert.match(source,/createCardEl\(card,'card'\)/);assert.match(source,/card canonical-card-face normal-gameplay-card/);
  const reset=source.slice(source.indexOf('function resetHandPresentationState'),source.indexOf('function fullSizeSourceRect'));
  for(const token of ['stagedCards.clear()','floorSlotReservations.clear()','activeHoveredHandCardId=null','physical-card','floor-slot-proxy'])assert.ok(reset.includes(token),token);
});

test('Online hand play captures the live source before animation and preserves exact destinations',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const exact={left:17,top:29,width:76,height:123};
  assert.equal(JSON.stringify(api.rememberOnlineHandSource('m2-1',{getBoundingClientRect:()=>exact})),JSON.stringify(exact));
  assert.equal(JSON.stringify(api.takeOnlineHandSource('m2-1')),JSON.stringify(exact));assert.equal(api.takeOnlineHandSource('m2-1'),null);
  api.rememberOnlineHandSource('m2-1',exact);api.resetHandPresentationState();assert.equal(api.takeOnlineHandSource('m2-1'),null);
  const onlineClick=source.slice(source.indexOf('async function humanPlay'),source.indexOf('// While choosing between two floor targets'));
  const remembered=onlineClick.indexOf('rememberOnlineHandSource(cardId,clickedEl)');
  const submitted=onlineClick.indexOf('await submitOnlineCardPlay()');
  assert.ok(remembered>=0&&submitted>remembered);
  const transition=source.slice(source.indexOf('async function presentOnlineTransition'),source.indexOf('async function submitOnlineCardPlay'));
  assert.match(transition,/side==='human'\?takeOnlineHandSource\(event\.card\.id\)\|\|els\.playerHand\.querySelector\(`\[data-card-id="\$\{event\.card\.id\}"\]`\)\?\.getBoundingClientRect\(\)\|\|approximateHumanSource\(\):approximateAiSource\(\)/);
  assert.match(transition,/target=state\.floor\.find\(card=>card\.id===step\.targetCardId\)/);
  assert.match(transition,/incoming\.pendingTurn\?\.played,incoming\.pendingTurn\?\.drawn/);
  assert.match(transition,/presentation\.floorSlotReservations\.set\(step\.cardId,landingSlot\)/);
  assert.match(transition,/animateHandCardSlap\(side,event\.card,source,target\)/);
  const motionTransition=transition.slice(transition.indexOf('let bombEvent=null'));
  assert.ok(motionTransition.indexOf('getBoundingClientRect()')<motionTransition.indexOf('animateHandCardSlap(side,event.card,source,target)'));
  assert.ok(motionTransition.indexOf('animateHandCardSlap(side,event.card,source,target)')<motionTransition.indexOf('state=incomingMapped.state'));

  const movement=source.slice(source.indexOf('async function animateHandCardSlap'),source.indexOf('async function animateBombSlap'));
  assert.ok(movement.indexOf("makePhysicalFace(card,sourceRect,'physical-card moving-card')")<movement.indexOf("node.style.visibility='hidden'"));
  assert.match(movement,/target \? overlapLanding\(target\) : await freeFloorLanding\(card\)/);
  const staged=source.slice(source.indexOf('async function stageHandCardForChoice'),source.indexOf('function cleanupStagedCard'));
  assert.ok(staged.indexOf("makePhysicalFace(card,full,'physical-card moving-card')")<staged.indexOf("node.style.visibility='hidden'"));
});

test('eventless authority snapshots preserve a clicked local card until physical movement claims it',()=>{
  const exactA={left:17,top:29,width:76,height:123},exactB={left:317,top:429,width:76,height:123};
  for(const [seat,exact] of [['playerA',exactA],['playerB',exactB]]){
    const selected=api.card('m2-1'),other=api.card('m3-1');
    api.rememberOnlineHandSource(selected.id,exact);
    const projected=api.onlineValueForViewer({human:api.makePlayer({hand:seat==='playerA'?[other]:[]}),ai:api.makePlayer({hand:seat==='playerB'?[other]:[]})},seat);
    const bottom=seat==='playerB'?projected.ai:projected.human;
    assert.equal(api.hasUnpresentedLocalHandMovement({human:bottom},[]),true,`${seat} local/bottom card must not teleport`);
    assert.equal(api.hasUnpresentedLocalHandMovement({human:bottom},[{type:'cardPlayed'}]),false);
    assert.equal(JSON.stringify(api.takeOnlineHandSource(selected.id)),JSON.stringify(exact));
    assert.equal(api.takeOnlineHandSource(selected.id),null);
  }
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),transition=source.slice(source.indexOf('async function presentOnlineTransition'),source.indexOf('async function submitOnlineCardPlay'));
  const eventless=transition.slice(transition.indexOf('if(!presentationEvents.length)'));assert.ok(eventless.indexOf('hasUnpresentedLocalHandMovement')<eventless.indexOf('state=incomingMapped.state'));
  assert.match(transition,/side==='human'\?takeOnlineHandSource/);
  assert.match(transition,/:approximateAiSource\(\)/);
});

test('Online authoritative actors remap viewer-relatively without changing card targeting data',()=>{
  const event={type:'cardsCaptured',actorId:'playerA',fromPlayerId:'playerB',source:'drawn',targetId:'m3-2',cardIds:['m3-1','m3-2']};
  assert.deepEqual(JSON.parse(JSON.stringify(api.onlineValueForViewer(event,'playerA'))),event);
  assert.deepEqual(JSON.parse(JSON.stringify(api.onlineValueForViewer(event,'playerB'))),{...event,actorId:'playerB',fromPlayerId:'playerA'});
  for(const [viewerId,actorId,expectedSide] of [
    ['playerA','playerA','human'],['playerA','playerB','ai'],
    ['playerB','playerB','human'],['playerB','playerA','ai']
  ]){
    const mapped=api.onlineValueForViewer({type:'cardPlayed',actorId,card:{id:'m2-1'},targetId:'m2-2'},viewerId);
    assert.equal(api.legacySideForPlayerId(mapped.actorId),expectedSide);
    assert.equal(mapped.card.id,'m2-1');assert.equal(mapped.targetId,'m2-2');
  }
});

test('every face-up dialog and event card preserves the canonical 76 by 123 ratio',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(css,/--card-aspect:76 \/ 123/);
  for(const selector of ['.milestone-cards .card','.magnified-card','.shake-cards .magnified-card','.shake-mini-card','.breakdown-cards .card,.result-cards .card','.tutorial-game-card','.single-card-choice .card']){
    const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');assert.match(css,new RegExp(escaped+'\\{[^}]*aspect-ratio:var\\(--card-aspect\\)'));
  }
  assert.doesNotMatch(css,/\.milestone-cards \.card\{[^}]*(?:height:134px|height:90px)/);
  assert.doesNotMatch(css,/\.breakdown-cards \.card,\.result-cards \.card\{[^}]*height:78px/);
  assert.doesNotMatch(css,/\.physical-card(?:\.moving-card)?>img\{/);
});

test('all semantic and scoring milestones share a transparent halo-free presenter',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  const special=source.slice(source.indexOf('async function showSpecialTransient'),source.indexOf('async function presentSemanticEvents'));
  const scoring=source.slice(source.indexOf('async function presentNewMilestones'),source.indexOf('function bestAiCard'));
  assert.match(special,/els\.milestoneCards\.appendChild\(createCardEl\(card,'card'\)\)/);assert.match(scoring,/els\.milestoneCards\.appendChild\(createCardEl\(card,'card'\)\)/);
  const overlay=css.match(/\.milestone-overlay\{([^}]+)\}/)?.[1]||'',title=css.match(/\.milestone-title\{([^}]+)\}/)?.[1]||'',cards=css.match(/\.milestone-cards \.card\{([^}]+)\}/)?.[1]||'';
  for(const declaration of ['background:transparent','border:0','box-shadow:none','outline:0','filter:none'])assert.ok(overlay.includes(declaration),`overlay ${declaration}`);
  assert.match(title,/-webkit-text-stroke:0/);assert.match(title,/background:transparent/);assert.doesNotMatch(title,/(?:#fff|rgba\(255|white)/i);
  for(const declaration of ['background:transparent','border-color:transparent','box-shadow:none','outline:0','filter:none'])assert.ok(cards.includes(declaration),`cards ${declaration}`);
  assert.match(css,/\.milestone-cards \.card>img\{background:transparent\}/);assert.match(css,/\.milestone-cards \.card::before,\.milestone-cards \.card::after\{content:none\}/);
  assert.doesNotMatch(source,/milestone[^\n]+\.(?:png|webp)/i);
});

test('played and deck-drawn temporary cards retain the settled card class without a white shell',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  const maker=source.slice(source.indexOf('function makePhysicalFace'),source.indexOf('function normalizeFixed'));
  const deck=source.slice(source.indexOf('async function animateDeckLiftFlip'),source.indexOf('async function animateStagedSlap'));
  assert.match(maker,/\$\{className\} card canonical-card-face normal-gameplay-card/);
  assert.match(deck,/deck-draw-face deck-draw-front card canonical-card-face/);
  assert.doesNotMatch(maker,/cloneNode|background|border|outline|boxShadow|filter/);
  const moving=css.match(/\.physical-card\.moving-card\{([^}]+)\}/)?.[1]||'',draw=css.match(/\.physical-card\.deck-draw-card\{([^}]+)\}/)?.[1]||'';
  assert.doesNotMatch(moving,/(?:background|border|outline|rgba\(255|#fff|white)/i);assert.doesNotMatch(draw,/(?:border|outline|rgba\(255|#fff|white)/i);
  assert.doesNotMatch(css,/\.physical-card(?:\.moving-card)?>img\{/);
  const selected=css.match(/\.hand-card\.pending-card\{([^}]+)\}/)?.[1]||'';assert.doesNotMatch(selected,/(?:rgba\(255|#fff|white)/i);
});

test('player-played and deck-drawn cards use untransformed canonical dimensions for every moving frame',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const sizing=source.slice(source.indexOf('function cardSize'),source.indexOf('function approximateAiSource'));
  assert.match(sizing,/probe\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(sizing,/querySelector\(['"]\.hand|querySelector\(['"]\.floor/);
  assert.doesNotMatch(sizing,/stage\.getBoundingClientRect\(\)\.width\/stage\.offsetWidth|parseFloat/);
  const hand=source.slice(source.indexOf('async function animateHandCardSlap'),source.indexOf('async function animateBombSlap'));
  const deckHit=source.slice(source.indexOf('async function animateStagedSlap'),source.indexOf('function captureTargetRect'));
  assert.match(hand,/sourceRect=fullSizeSourceRect\(sourceRect\)/);
  assert.match(deckHit,/const landing=target \? overlapLanding\(target\) : await freeFloorLanding\(card\)/);
  assert.doesNotMatch(source,/concealImpactTarget/);
});

test('unmatched deck temporary landing uses the canonical size and only the floor proxy center',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const landing=source.slice(source.indexOf('async function freeFloorLanding'),source.indexOf('function overlapLanding'));
  assert.match(landing,/const r=proxy\.getBoundingClientRect\(\),\{w,h\}=cardSize\(\),center=rectCenter\(r\)/);
  assert.match(landing,/left:center\.x-w\/2,top:center\.y-h\/2,width:w,height:h/);
  assert.doesNotMatch(landing,/width:r\.width|height:r\.height/);
  const deck=source.slice(source.indexOf('async function animateStagedSlap'),source.indexOf('function captureTargetRect'));
  assert.match(deck,/const landing=target \? overlapLanding\(target\) : await freeFloorLanding\(card\)/);
  assert.match(deck,/normalizeFixed\(el,landing\)/);
});

test('Sweep and Bomb audio paths are distinct, single, and honor Sound Off',()=>{
  api.setSoundEnabled(true);api.resetAudioTrace();api.playSweepSound();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),['sweep']);
  api.resetAudioTrace();api.playBombSound();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),['bomb']);
  api.setSoundEnabled(false);api.resetAudioTrace();api.playSweepSound();api.playBombSound();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),[]);api.setSoundEnabled(true);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');const sweep=source.slice(source.indexOf('function playSweepSound'),source.indexOf('function playTapTapSound'));assert.match(sweep,/\[\[0,-\.75,\.55\],\[\.48,\.55,-\.65\]\]/);assert.match(sweep,/const duration=\.38/);assert.match(sweep,/high\.type='highpass'/);assert.match(sweep,/pan\.pan\.linearRampToValueAtTime/);assert.doesNotMatch(sweep,/playBombSound|playSample\('bomb'/);
});

test('dice audio is a bounded sequence of discrete clacks rather than procedural white noise',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const clatter=source.slice(source.indexOf('function playDiceClatter'),source.indexOf('function playSweepSound'));
  assert.match(clatter,/c\.state!=='running'/);assert.match(clatter,/stopDiceSound\(\)/);assert.match(clatter,/const impacts=\[\[0,\.026,1850,\.13\]/);assert.match(clatter,/\[\.84,\.055,980,\.28\]/);assert.match(clatter,/impacts\.forEach/);assert.equal((clatter.match(/createBufferSource\(\)/g)||[]).length,1);assert.match(clatter,/data\[i\]=.*decay/);assert.match(clatter,/Math\.min\(\.72,volume\*2\.8\)/);assert.match(clatter,/source\.connect\(filter\)\.connect\(gain\)\.connect\(master\)/);assert.match(clatter,/master\.connect\(c\.destination\)/);assert.match(clatter,/source\.stop\(now\+delay\+duration\)/);assert.match(clatter,/setTimeout\(\(\)=>\{activeDiceSources=\[\];\},920\)/);
  const dice=source.slice(source.indexOf('function playDiceSound'),source.indexOf('async function startGame'));
  assert.match(dice,/playDiceClatter\(\)/);assert.doesNotMatch(dice,/playProceduralNoise/);
  const procedural=source.slice(source.indexOf('function playProceduralNoise'),source.indexOf('let activeDiceSources'));
  assert.doesNotMatch(procedural,/kind==='dice'/);
  assert.match(source,/async function unlockAudio\(\)/);assert.match(source,/if\(context\?\.state==='suspended'\)await context\.resume\(\)/);assert.match(source,/if\(firstSessionHand&&!TEST_MODE\)\{await unlockAudio\(\);if\(!isGameplayPresentationCurrent\(epoch\)\)return;\}/);const launch=source.slice(source.indexOf('async function launchLocalGame'),source.indexOf("document.addEventListener('pointerdown'",source.indexOf('async function launchLocalGame')));assert.match(launch,/await unlockAudio\(\)/);
  api.setSoundEnabled(false);api.resetAudioTrace();api.playDiceSound();assert.deepEqual(Array.from(api.getPresentationSnapshot().audioTrace),[]);api.setSoundEnabled(true);
});

test('an armed triple without a current floor target falls back to ordinary play for every card and month',()=>{
  for(const month of [4,7]){
    const ids=[1,2,3].map(index=>`m${month}-${index}`);
    for(const trigger of ids){
      let state=stateWith({human:api.makePlayer({hand:cards(...ids),hiddenTripleMonths:[month],resolvedOpeningTripleMonths:[month],armedBombMonths:[month]})});
      const attempted=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:trigger});
      assert.equal(attempted.pendingDecision,null);assert.deepEqual(attempted.state.human.armedBombMonths,[]);
      const played=extractedEngine.applyNormalTurnAction(attempted.state,{type:'playCard',actorId:'playerA',cardId:trigger});
      assert.equal(played.events[0].type,'cardPlayed');assert.equal(played.events.some(event=>event.type==='bombDeclared'),false);assert.equal(played.state.human.bombs,0);assert.equal(played.state.human.bombFreeTurns,0);assert.equal(played.state.human.shakes,0);assert.equal(played.state.human.hand.length,2);
    }
  }
});

test('declining Shake keeps a targetless triple ordinary while valid Bomb legality remains board-dependent',()=>{
  let state=stateWith({human:api.makePlayer({hand:cards('m6-1','m6-2','m6-3'),hiddenTripleMonths:[6]})});
  let attempted=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:'m6-2'});assert.equal(attempted.pendingDecision.type,'shakeDecision');
  const kept=extractedEngine.applyNormalTurnAction(attempted.state,{type:'keepShakeSecret',actorId:'playerA'});assert.equal(kept.pendingDecision,null);assert.equal(kept.state.human.shakes,0);assert.equal(kept.state.human.bombs,0);
  const played=extractedEngine.applyNormalTurnAction(kept.state,{type:'playCard',actorId:'playerA',cardId:'m6-2'});assert.equal(played.events[0].type,'cardPlayed');assert.equal(played.events.some(event=>event.type==='bombDeclared'),false);
  state=stateWith({floor:[card('m6-4')],human:api.makePlayer({hand:cards('m6-1','m6-2','m6-3'),hiddenTripleMonths:[6],armedBombMonths:[6]})});api.initFloorSlots(state);
  const bomb=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:'m6-3'});assert.equal(bomb.pendingDecision,null);assert.equal(bomb.events.filter(event=>event.type==='bombDeclared').length,1);assert.equal(bomb.state.human.bombs,1);assert.equal(bomb.state.human.bombFreeTurns,2);
});

test('AI Bomb selection requires a current floor target and stale UI Bomb intent clears before normal fallback',()=>{
  const state=stateWith({turn:'playerB',startingPlayerId:'playerB',ai:api.makePlayer({hand:cards('m8-1','m8-2','m8-3'),hiddenTripleMonths:[8],resolvedOpeningTripleMonths:[8],armedBombMonths:[8]})});
  assert.equal(extractedEngine.classifyTurnOutcome(state,{actorId:'playerB',cardId:'m8-1'}).kind,'playReady');
  const attempted=extractedEngine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerB',cardId:'m8-1'});assert.equal(attempted.pendingDecision,null);
  const played=extractedEngine.applyNormalTurnAction(attempted.state,{type:'playCard',actorId:'playerB',cardId:'m8-1'});assert.equal(played.events[0].type,'cardPlayed');assert.equal(played.state.ai.hand.length,2);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),bombWrapper=source.slice(source.indexOf('async function executeBombTurn'),source.indexOf('async function resolveCombinedTurn'));
  assert.match(bombWrapper,/decision\?\.type==='bombDecision'.*type:'declineBomb'/s);assert.match(bombWrapper,/return false/);
  assert.match(source,/if\(await executeBombTurn\('human',card\.month,epoch\)\)return/);
});

test('round boundary cleanup is idempotent and does not reset session authority',()=>{
  api.resetSession();assert.equal(api.consumeSessionStart(),true);api.reserveFloorSlot(card('m1-1'));assert.equal(Object.keys(api.getPresentationSnapshot().floorSlotReservations).length,1);
  api.resetHandPresentationState();api.resetHandPresentationState();const after=api.getPresentationSnapshot();assert.equal(Object.keys(after.floorSlotReservations).length,0);assert.equal(after.activeHoveredHandCardId,null);assert.equal(api.consumeSessionStart(),false);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');assert.match(source,/async function startGame\(epoch=gameplayPresentationEpoch\)\{[^]*resetHandPresentationState\(\)/);
});

test('authoritative unmatched deck landing keeps its reserved slot after earlier capture cleanup',()=>{
  let state=stateWith({floor:cards('m1-1','m2-1','m3-1','m4-1'),deck:[card('m9-3')],human:api.makePlayer({hand:[card('m1-2')]})});api.initFloorSlots(state);
  state=extractedEngine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m1-2',targetId:'m1-1'}).state;
  state=extractedEngine.applyNormalTurnAction(state,{type:'drawNextCard',actorId:'playerA'}).state;
  const reserved=state.pendingTurn.drawn.landingSlot;assert.equal(reserved,4);
  state=extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'played'}).state;
  assert.equal(state.floorSlotByCard['m1-1'],undefined);assert.equal(state.floorSlotByCard['m2-1'],1);
  state=extractedEngine.applyNormalTurnAction(state,{type:'resolveNormalCard',actorId:'playerA',source:'drawn'}).state;
  assert.equal(state.floorSlotByCard['m9-3'],reserved);assert.equal(state.floorSlotByCard['m2-1'],1);assert.equal(Object.values(state.floorSlotByCard).includes(0),false);
  state=extractedEngine.applyNormalTurnAction(state,{type:'completeTurn',actorId:'playerA'}).state;
  assert.equal(extractedEngine.deserializeGameState(extractedEngine.serializeGameState(state)).floorSlotByCard['m9-3'],reserved);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');assert.match(source,/reserveFloorSlot\(card,authoritativeSlot\)/);assert.match(source,/floor-slot-proxy canonical-card-face/);
});

test('physical-motion instrumentation detects render interruption without changing Solo timing',()=>{
  api.resetPhysicalMotionTrace();api.beginPhysicalMotion();api.notePresentationRender();let trace=api.getPresentationSnapshot();assert.equal(trace.activePhysicalMotions,1);assert.equal(trace.rendersDuringPhysicalMotion,1);api.endPhysicalMotion();api.notePresentationRender();trace=api.getPresentationSnapshot();assert.equal(trace.activePhysicalMotions,0);assert.equal(trace.rendersDuringPhysicalMotion,1);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');assert.match(source,/runPhysicalMotion\(\(\)=>animateHandCardSlap/);assert.match(source,/runPhysicalMotion\(\(\)=>animateDeckLiftFlip/);assert.match(source,/runPhysicalMotion\(\(\)=>animateStagedSlap/);assert.match(source,/duration=motionDuration\(650\)/);assert.match(source,/duration=motionDuration\(500\)/);assert.match(source,/cubic-bezier\(\.22,\.72,\.17,1\)/);assert.match(source,/cubic-bezier\(\.2,\.7,\.14,1\)/);
});


test('Solo and Online share one physical turn pacing contract',()=>{
  assert.deepEqual({...api.presentationPacing},{handToDeck:330,deckReveal:180,cardLandCleanup:180,postCapture:190});
  assert.equal(Object.isFrozen(api.presentationPacing),true);

  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

  assert.match(
    source,
    /async function playFullTurn[\s\S]*?animateHandCardSlap[\s\S]*?presentationPause\('handToDeck'\)/
  );

  assert.match(
    source,
    /step\.kind==='handSlap'[\s\S]*?animateHandCardSlap[\s\S]*?presentationPause\('handToDeck'\)/
  );

  assert.match(
    source,
    /async function animateDeckLiftFlip[\s\S]*?presentationPause\('deckReveal'\)/
  );

  assert.match(
    source,
    /async function presentNormalResolution[\s\S]*?presentationPause\('cardLandCleanup'\)[\s\S]*?presentationPause\('postCapture'\)/
  );

  assert.match(
    source,
    /event\.type==='cardLanded'[\s\S]*?presentationPause\('cardLandCleanup'\)/
  );

  assert.match(
    source,
    /event\.type==='cardsCaptured'[\s\S]*?presentationPause\('postCapture'\)/
  );
});

test('intentional Online exits clean room UI and ignore only their resulting disconnect',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const reconcile=source.slice(source.indexOf('function reconcileOnlineFlow'),source.indexOf('function returnOnlineToMenu'));
  const cleanup=source.slice(source.indexOf('function returnOnlineToMenu'),source.indexOf("els.opponentEndedOkBtn.addEventListener"));
  const disconnect=source.slice(source.indexOf("adapter.addEventListener('disconnected'"),source.indexOf("adapter.addEventListener('snapshot'"));
  assert.match(reconcile,/if\(flow\.disconnectCancelled\|\|flow\.endedByYou\)\{if\(onlineAnonymousMode&&globalThis\.GoStopRanked\?\.handleFriendlySessionEnd\?\.\(snapshot\)\)return;returnOnlineToMenu\(\);return;\}/,'Friendly local quit offers referral signup before cleanup while ranked no-penalty exits still return directly');
  assert.match(reconcile,/onlineAnonymousMode\?\(flow\.forceEnded\?t\('friendForceEnded'\):t\('friendEnded'\)\):t\('opponentEnded'\)/,'Free Friend endings use dedicated normal and force-ended messages');
  assert.match(source,/opponentEndedOkBtn\.addEventListener\('click',\(\)=>\{[^]*handleFriendlySessionEnd\?\.\(snapshot\)[^]*returnOnlineToMenu\(\)/,'the opponent OK path offers Friendly referral signup before final cleanup');
  assert.match(cleanup,/onlineMode=false/);
  assert.match(cleanup,/sessionStorage\.removeItem\(`gostop-room-\$\{room\.roomCode\}`\)/);assert.match(cleanup,/localStorage\.removeItem\('gostop-active-ranked-room'\)/);
  assert.match(cleanup,/getElementById\('onlineRoomCode'\)\.value=''/);
  assert.match(cleanup,/activeOnlineStatus\.textContent=''/);
  assert.match(cleanup,/goStopOnlineSession\?\.close\(\);globalThis\.goStopOnlineSession=null/);
  assert.match(cleanup,/soloStartOverlay\.hidden=false/);
  assert.match(disconnect,/if\(!onlineMode\)return;activeOnlineStatus\.textContent=t\('authorityDisconnected'\)/,'intentional close is ignored after cleanup sets onlineMode false');
  assert.doesNotMatch(disconnect,/if\(onlineMode\).*return/,'active Online disconnects must not be suppressed');
});

test('Online starter messages are localized and viewer-relative for both seats',()=>{
  const i18n=require('../i18n.js');
  assert.equal(i18n.dictionaries.ko.youGoFirst,'님께서 먼저 하시겠습니다.');
  assert.equal(i18n.dictionaries.ko.opponentGoesFirst,'상대방이 먼저 하겠습니다.');
  for(const dictionary of Object.values(i18n.dictionaries)){
    assert.equal(typeof dictionary.youGoFirst,'string');
    assert.equal(typeof dictionary.opponentGoesFirst,'string');
  }
  api.setLocale('ko');api.setOnlineMode(true);
  for(const [viewer,starter,expected] of [
    [api.playerIds.playerA,api.playerIds.playerA,'님께서 먼저 하시겠습니다.'],
    [api.playerIds.playerA,api.playerIds.playerB,'상대방이 먼저 하겠습니다.'],
    [api.playerIds.playerB,api.playerIds.playerB,'님께서 먼저 하시겠습니다.'],
    [api.playerIds.playerB,api.playerIds.playerA,'상대방이 먼저 하겠습니다.']
  ])assert.equal(api.openingStarterMessage(api.onlineValueForViewer(starter,viewer)),expected);
  api.setOnlineMode(false);
  assert.equal(api.openingStarterMessage(api.playerIds.playerA),i18n.translate('ko','goesFirst',{player:i18n.translate('ko','player')}));
  assert.equal(api.openingStarterMessage(api.playerIds.playerB),i18n.translate('ko','goesFirst',{player:i18n.translate('ko','computer')}));
  api.setLocale('en');
});


test('Training Mode warns about an opponent completing a three-ribbon set and recommends the blocking hand/floor pair',()=>{
  const warning=card('m3-2');
  const state=useState(stateWith({
    turn:'playerA',
    floor:[warning,card('m5-3')],
    human:api.makePlayer({hand:[card('m3-1'),card('m5-1')]}),
    ai:api.makePlayer({captured:[card('m1-2'),card('m2-2')]})
  }));
  assert.equal(api.trainingThreatValue(warning,state.ai)>0,true);
  assert.equal(api.trainingWarningCard().id,'m3-2');
  const recommendation=api.trainingRecommendation();
  assert.equal(recommendation.card.id,'m3-1');
  assert.equal(recommendation.target.id,'m3-2');
  assert.match(recommendation.reason,/3-Stripe set/);
  assert.match(api.trainingAlternativeReason(card('m5-1'),recommendation),/highlighted/);
});

test('Training Mode opening strategy recognizes a reachable third Godori bird and waits five seconds before turn coaching',()=>{
  useState(stateWith({
    turn:'playerA',
    floor:[card('m8-2'),card('m10-3')],
    human:api.makePlayer({hand:[card('m2-1'),card('m4-1'),card('m8-3')]}),
    ai:api.makePlayer()
  }));
  assert.match(api.trainingOpeningStrategy(),/Godori/);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const coach=source.slice(source.indexOf('function armTrainingCoach'),source.indexOf('function openingStarterMessage'));
  assert.match(coach,/setTimeout\(\(\)=>\{/);
  assert.match(coach,/\},5000\)/);
  assert.match(source,/trainingRecommendedFloorCardId/);
  assert.match(source,/showTrainingCoach\('Opening Strategy'/);
  assert.match(source,/The highlighted floor card is the stronger target/);
});

test('mobile hand browsing, second tap, and flick share one deterministic native-touch path',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),presentation=fs.readFileSync(path.join(__dirname,'..','presentation-plan.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(source,/el\.addEventListener\('click',\(\)=>\{void humanPlay\(card\.id,el\);\}\)/);
  assert.match(presentation,/new CustomEvent\('gostop-hand-activate',\{cancelable:true,detail:\{cardId,blank\}\}\)/);
  assert.match(source,/document\.addEventListener\('gostop-hand-activate',event=>\{/);
  assert.match(source,/if\(!state\?\.human\?\.hand\?\.some\(card=>card\.id===cardId\)\)return/);
  assert.match(source,/event\.preventDefault\(\);void humanPlay\(cardId,live\)/);
  assert.match(source,/blank\.addEventListener\('click',\(\)=>\{void humanUseBombBlank\(\);\}\)/);
  assert.match(source,/document\.dispatchEvent\(new Event\('gostop-hand-reset'\)\)/);
  assert.match(presentation,/const touchCapable=\('ontouchstart' in globalThis\)\|\|Number\(globalThis\.navigator\?\.maxTouchPoints\|\|0\)>0/);
  assert.match(presentation,/const pointerTouchSupported=typeof globalThis\.PointerEvent==='function'/);
  assert.match(presentation,/const nativeTouchSupported=touchCapable&&!pointerTouchSupported/);
  assert.match(presentation,/if\(pointerTouchSupported\)\{[\s\S]*addEventListener\('pointerdown'/);
  assert.match(presentation,/addEventListener\('pointermove'/);
  assert.match(presentation,/addEventListener\('pointerup'/);
  assert.match(presentation,/state\.wasSelected\)\{clearSelection\(\);triggerPlay\(state\.cardId\);\}/);
  assert.match(presentation,/if\(nativeTouchSupported\)\{[\s\S]*addEventListener\('touchstart'/);
  assert.match(presentation,/addEventListener\('touchmove'/);
  assert.match(presentation,/addEventListener\('touchend'/);
  assert.match(presentation,/clearPreviousClickSuppression\(\)/);
  assert.match(presentation,/Date\.now\(\)\+Math\.max\(80,Number\(ms\)\|\|140\)/);
  assert.doesNotMatch(presentation,/state\.intent!==\'browse\'&&isUpwardFlick/);
  assert.match(presentation,/minUpwardDistance:10,minTravelDistance:20,maxDuration:950,minSpeed:\.02,maxHorizontalRatio:1\.35/);
  assert.match(presentation,/if\(flick\)\{[\s\S]*triggerPlay\(state\.cardId\);return;/);
  assert.match(presentation,/if\(browsed\)\{[\s\S]*clearSelection\(\);return;/);
  assert.match(presentation,/if\(state\.wasSelected\)\{clearSelection\(\);triggerPlay\(state\.cardId\);\}/);
  assert.match(presentation,/bypassClickCard=card;[\s\S]*try\{card\.click\(\);\}finally\{bypassClickCard=null;\}/);
  assert.match(source,/el\.addEventListener\('click',\(\)=>\{void humanPlay\(card\.id,el\);\}\)/);
  assert.match(presentation,/minUpwardDistance:10,minTravelDistance:20,maxDuration:950,minSpeed:\.02,maxHorizontalRatio:1\.35/);
  assert.match(presentation,/suppressNextClick\(state\.cardId,260\)/);
  assert.match(css,/\.hand\{[^}]*touch-action:pan-y/);
});

test('How to Play includes device-specific click, touch navigation, and flick controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/id="guide-controls"/);
  assert.match(html,/data-tutorial-platform="desktop"/);
  assert.match(html,/data-tutorial-platform="mobile"/);
  assert.match(html,/Move the mouse across your hand/);
  assert.match(html,/flick your finger upward/);
  assert.match(html,/Slide your finger left or right across your hand/);
});

test('Training Mode state is independent from normal Free Solo state',()=>{
  api.setTrainingMode(true);
  assert.equal(api.getPresentationSnapshot().trainingMode,true);
  api.setTrainingMode(false);
  const snapshot=api.getPresentationSnapshot();
  assert.equal(snapshot.trainingMode,false);
  assert.equal(snapshot.hintCardId,null);
  assert.equal(snapshot.trainingWarningFloorCardId,null);
  assert.equal(snapshot.trainingRecommendedFloorCardId,null);
});


test('mode lobby panels render above main menu overlay',()=>{
  const rankedSource=fs.readFileSync(path.join(__dirname,'..','ranked-client.js'),'utf8');
  const styleSource=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  const lobbyZ=Number(rankedSource.match(/\.online-lobby-panel\{position:fixed;inset:0;z-index:(\d+)/)?.[1]||0);
  const menuZ=Number(styleSource.match(/\.solo-start-overlay\{position:fixed;inset:0;z-index:(\d+)/)?.[1]||0);
  assert.ok(lobbyZ>menuZ,`online lobby z-index ${lobbyZ} must be above menu z-index ${menuZ}`);
  assert.match(rankedSource,/freeFriendBtn\.addEventListener\('click',[\s\S]*?freePanel\.hidden=false/);
});


test('online launch reuses the adapter that created or joined the room',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const begin=source.slice(source.indexOf('const beginOnline=async'),source.indexOf("addEventListener('gostop-online-snapshot'"));
  assert.match(begin,/adapter:roomAdapter=null/);
  assert.match(begin,/const adapter=roomAdapter\|\|new globalThis\.GoStopOnline\.OnlineSessionAdapter/);
  assert.match(begin,/if\(previous&&previous!==adapter\)/);
  const launches=source.slice(source.indexOf("createOnlineBtn?.addEventListener"),source.indexOf("addEventListener('gostop-free-online-join'"));
  assert.match(launches,/await beginOnline\(room,\{adapter\}\)/);
  assert.match(launches,/await beginOnline\(room,\{anonymous:true,statusElement:freeOnlineStatus,adapter\}\)/);
});


test('ranked Solo launch stays covered until the opening presentation is visible',()=>{
  const rankedSource=fs.readFileSync(path.join(__dirname,'..','ranked-client.js'),'utf8');
  const appSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const entry=rankedSource.slice(rankedSource.indexOf('function setSoloLaunchCover'),rankedSource.indexOf('function launchRankedRoom'));
  assert.match(entry,/overlay\.dataset\.launching='true'/);
  assert.match(entry,/if\(kind==='solo'\)setSoloLaunchCover\(true\)/);
  assert.match(rankedSource,/\.solo-start-overlay\[data-launching="true"\]/);
  assert.match(rankedSource,/\.solo-start-overlay\[data-launching="true"\]>\*:not\(\.solo-launch-message\)\{display:none!important\}/);
  assert.match(rankedSource,/\.solo-launch-message\{display:none;position:absolute;inset:0;z-index:90;place-items:center;text-align:center/);
  assert.match(rankedSource,/const soloLaunchMessage=document\.createElement\('div'\);soloLaunchMessage\.className='solo-launch-message'/);
  assert.match(entry,/soloLaunchMessage\.textContent=rt\('starting'\)/);
  assert.doesNotMatch(rankedSource,/data-launching-text/);
  const snapshot=appSource.slice(appSource.indexOf("adapter.addEventListener('snapshot'"),appSource.indexOf("adapter.addEventListener('actionAccepted'"));
  assert.match(snapshot,/snapshot\?\.ranked&&els\.soloStartOverlay\?\.dataset\.launching!=='true'/);
  const opening=appSource.slice(appSource.indexOf('async function presentOpeningSequence'),appSource.indexOf('async function presentDealSequence'));
  assert.ok(opening.indexOf("els.openingOverlay.classList.add('show')")<opening.indexOf("els.soloStartOverlay.hidden=true"),'opening overlay must be visible before launch cover is removed');
});

test('score pill, Captured Cards title, and entire capture panels open the same complete score breakdown',()=>{
  const appSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),htmlSource=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(appSource,/\.human-chip \.score-pill'\)\?\.addEventListener\('click',event=>\{event\.preventDefault\(\);event\.stopPropagation\(\);closePlayerInfo\(\);openScoreBreakdown\(PLAYER_A\);\}\)/);
  assert.match(appSource,/\.cpu-chip \.score-pill'\)\?\.addEventListener\('click',event=>\{event\.preventDefault\(\);event\.stopPropagation\(\);closePlayerInfo\(\);openScoreBreakdown\(PLAYER_B\);\}\)/);
  assert.match(htmlSource,/capture-summary-trigger" data-score-owner="player" role="button" tabindex="0"/);
  assert.match(appSource,/capture-summary-trigger\[data-score-owner\]/);assert.match(appSource,/openScoreBreakdown\(playerId\)/);
  assert.match(appSource,/querySelectorAll\('\.game-capture-panel'\)\.forEach\(panel=>\{/);
  assert.match(appSource,/panel\.contains\(els\.playerCaptured\)\?PLAYER_A:PLAYER_B/);
  assert.match(appSource,/panel\.addEventListener\('click',event=>\{if\(event\.defaultPrevented\)return;event\.preventDefault\(\);event\.stopPropagation\(\);closePlayerInfo\(\);openScoreBreakdown\(playerId\);\}\)/);
  assert.doesNotMatch(appSource,/btn\.addEventListener\('click',\(\)=>openCapturedGroup/);
});
