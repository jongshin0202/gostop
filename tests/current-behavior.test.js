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
    setAttribute(){},removeAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},
    getBoundingClientRect(){return {left:0,top:0,right:500,bottom:300,width:100,height:100};},
    show(){this.open=true;},showModal(){this.open=true;},close(){this.open=false;}
  };
}

function loadCurrentGame(){
  const elements = new Map();
  const document = {
    getElementById(id){
      if(!elements.has(id))elements.set(id,fakeElement());
      return elements.get(id);
    },
    addEventListener(){},querySelector(){return fakeElement();},createElement(){return fakeElement();},
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
  const engineSource=fs.readFileSync(path.join(__dirname,'..','game-engine.js'),'utf8');
  vm.runInContext(engineSource,context,{filename:'game-engine.js'});
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  vm.runInContext(source,context,{filename:'app.js'});
  return {api:context.GOSTOP_TEST_API,elements};
}

const {api,elements}=loadCurrentGame();
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
  assert.equal(settled.goBonus,2);
  assert.equal(settled.total,1664);
  assert.deepEqual([...settled.formulaSteps],[
    'Base 11','Go bonus +2','3 Go ×2','Shake ×2','Bomb ×2',
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
  assert.equal(settle(player(threeBright,{bombs:1})).total,6);
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
  await api.executeBombTurn('human',6);
  assert.equal(state.human.bombs,1);
  assert.equal(state.human.bombFreeTurns,2);
  assert.equal(state.human.captured.filter(c=>c.month===6).length,4);
  assert.ok(state.human.captured.some(c=>c.id==='m10-3'));
  assert.equal(state.ai.captured.length,0);
  assert.equal(state.floor.some(c=>c.id==='m7-3'),true);
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
  const state=useState(stateWith({floor:[target]})); api.initFloorSlots(state);
  await api.resolveCombinedTurn('human',{card:played,target,matchCount:1},{card:draw,target:played,matchCount:2});
  assert.equal(state.human.ppeoks,1);
  assert.deepEqual([...state.floorStacks[4].cardIds],[target.id,played.id,draw.id]);
  assert.equal(new Set(state.floorStacks[4].cardIds.map(id=>state.floorSlotByCard[id])).size,1);
});

test('Self-Ppeok capture takes the full stack and transfers two Pi',async()=>{
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
  assert.equal(state.human.captured.filter(c=>c.type==='pi').length,4);
  assert.equal(state.ai.captured.length,0);
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
  assert.equal(state.floor.length,0);
  assert.ok(state.human.captured.some(c=>c.id==='m7-3'));
});

test('Chongtong recognizes four of a month and awards the current opening win',async()=>{
  const state=useState(stateWith({human:api.makePlayer({hand:cards('m11-1','m11-2','m11-3','m11-4')})}));
  api.setNagariCarryPower(0);
  assert.deepEqual([...api.fourMonths(state.human.hand)],[11]);
  await api.processOpeningSpecials();
  assert.equal(state.winner,'playerA');
  assert.equal(elements.get('resultScore').textContent,'10 Points');
});

test('Go/Stop eligibility requires threshold and a strict score increase',()=>{
  assert.equal(api.reachedNewFinishScore(6,0),false);
  assert.equal(api.reachedNewFinishScore(7,7),false);
  assert.equal(api.reachedNewFinishScore(8,7),true);
});

test('Pi transfer prefers ordinary Pi and falls back to double Pi',async()=>{
  const state=useState(stateWith({
    ai:api.makePlayer({captured:cards('m11-2','m4-3')})
  }));
  await api.stealPiAnimated('human',1);
  assert.equal(state.human.captured.map(c=>c.id).join(','),'m4-3');
  await api.stealPiAnimated('human',1);
  assert.equal(state.human.captured.map(c=>c.id).join(','),'m4-3,m11-2');
});

test('Nagari increments and caps carry power at three',async()=>{
  let state=useState(stateWith());
  api.setNagariCarryPower(2);
  await api.finishNagari();
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
