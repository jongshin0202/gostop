import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GoStopDecisionRanker,goStopFeatures} from '../training-learning/go-stop-learner.mjs';
const require=createRequire(import.meta.url);
const advice=require('../dev-site/training-go-stop-advice.js');

const scene={hand:['m3-4'],floor:['m3-2','m8-1'],playerScore:8,
 opponentScore:0,goCount:0,nativeDecision:'stop',
 nativeReason:'STOP. Only one scoring turn remains.'};

test('one last hand card matching floor against 0-point opponent favors GO over generic last-turn STOP',()=>{
 const result=advice.evaluate(scene);
 assert.equal(result.oneCard,true);assert.equal(result.hasMatch,true);
 assert.equal(result.recommended,'go');assert.equal(result.changed,true);
});
test('matching-month cards are opportunities, never used as unconditional guaranteed points',()=>{
 assert.equal(advice.evaluate({...scene,floor:['m2-2']}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,opponentScore:5}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,goCount:3}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,playerScore:6}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,hand:['m3-4','m3-1']}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,nativeReason:
  'STOP. The computer is at 0. If it captures both Brights, enough to reach the finish threshold.'}).recommended,'stop');
});
test('GO STOP ranker learns only confirmed choices at completed-game Finish and tracks independent weights',()=>{
 const context={playerScore:8,opponentScore:0,remainingCards:1,goCount:0,hasMatch:true};
 assert.equal(goStopFeatures(context,'go').length,16);
 const ranker=new GoStopDecisionRanker();
 assert.equal(ranker.examples,0);
 assert.throws(()=>ranker.trainGame({id:'unfinished',complete:false,decisions:[]}));
 assert.equal(ranker.trainGame({id:'finished',complete:true,decisions:[
  {context,chosenAction:'go'},{context,chosenAction:null}]}),1);
 assert.equal(ranker.examples,1);
 assert.equal(ranker.rank(context).action,'go');
 assert.equal(ranker.trainGame({id:'finished',complete:true,decisions:[{context,chosenAction:'stop'}]}),0);
 const restored=new GoStopDecisionRanker(ranker.export());
 assert.equal(restored.examples,1);
 assert.equal(restored.rank(context).action,'go');
});

test('an already played final card can still trigger a GO/STOP expert comparison',()=>{
 const c={playerScore:8,opponentScore:1,remainingCards:0,goCount:0,hasMatch:false};
 assert.equal(goStopFeatures(c,'go').length,16);
 const ranker=new GoStopDecisionRanker();
 assert.equal(ranker.trainGame({id:'last-card-zero-hand',complete:true,decisions:[{context:c,chosenAction:'go'}]}),1);
});
test('public-card next-turn opponent ceiling is scored from all visible floor combinations',()=>{
 const card=(id,month,type='pi')=>({id,month,type,flags:[]});
 const deck=[card('m1-1',1),card('m1-2',1),card('m1-3',1),card('m1-4',1),
  card('m2-1',2),card('m2-2',2),card('m2-3',2),card('m2-4',2)];
 const points=player=>player.captured.length;
 const ceiling=advice.opponentNextTurnCeiling({
  deck,floorIds:['m1-1','m2-1'],ownHandIds:['m1-4'],
  ownCapturedIds:[],opponentCapturedIds:[],opponentScore:1,
  scorePlayer:player=>({total:points(player)})
 });
 assert.equal(ceiling,5,'two matched captures add exactly four cards');
 const none=advice.opponentNextTurnCeiling({
  deck,floorIds:[],ownHandIds:['m1-4'],
  ownCapturedIds:[],opponentCapturedIds:[],opponentScore:1,
  scorePlayer:player=>({total:points(player)})
 });
 assert.equal(none,1);
});

test('low-score opponent with no visible path to seven and a reserved match favors GO',()=>{
 const card=(m,n)=>({id:'m'+m+'-'+n,month:m,type:'pi',flags:[]});
 const deck=[...Array.from({length:4},(_,i)=>card(1,i+1)),
  ...Array.from({length:4},(_,i)=>card(2,i+1))];
 const evidence=advice.publicGoStopRisk({
  deck,floorIds:['m1-1','m2-1'],ownHandIds:['m1-4'],
  ownCapturedIds:['m1-2','m1-3'],opponentCapturedIds:[],
  opponentScore:2,playerScore:7,opponentHandSize:1,
  scorePlayer:player=>({total:player.captured.length})
 });
 assert.ok(evidence);
 assert.equal(evidence.opponentCeiling<7,true);
 assert.equal(evidence.captureChance,1,'remaining matching month is fully accounted for');
 assert.equal(evidence.hasGuaranteedScoringCapture,true);
 assert.equal(advice.riskDecision(evidence,{opponentScore:2}),'go');
});
test('a seven-point path with no own scoring chance recommends STOP',()=>{
 const card=(m,n)=>({id:'m'+m+'-'+n,month:m,type:'pi',flags:[]});
 const deck=[1,2,3,4].flatMap(m=>[1,2,3,4].map(n=>card(m,n)));
 const evidence=advice.publicGoStopRisk({
  deck,floorIds:['m1-1','m2-1','m3-1'],ownHandIds:['m4-1'],
  opponentScore:4,playerScore:7,opponentHandSize:3,
  scorePlayer:player=>({total:player.captured.length})
 });
 assert.ok(evidence.opponentCeiling>=7);
 assert.equal(evidence.ownGainChance,0);
 assert.ok(evidence.opponentFinishChance>0);
 assert.equal(advice.riskDecision(evidence,{opponentScore:4}),'stop');
});
test('compare a protected +1 route against a less likely opponent seven-point route',()=>{
 const card=(m,n)=>({id:'m'+m+'-'+n,month:m,type:'pi',flags:[]});
 const deck=[1,2,3].flatMap(m=>[1,2,3,4].map(n=>card(m,n)));
 const evidence=advice.publicGoStopRisk({
  deck,floorIds:['m1-1','m2-1','m3-1'],ownHandIds:['m1-4'],
  ownCapturedIds:['m1-2','m1-3'],opponentScore:4,playerScore:7,
  opponentHandSize:1,scorePlayer:player=>({total:player.captured.length})
 });
 assert.ok(evidence.opponentCeiling>=7);
 assert.equal(evidence.ownGainChance,1);
 assert.ok(evidence.ownGainChance>evidence.opponentFinishChance);
 assert.equal(advice.riskDecision(evidence,{opponentScore:4}),'go');
});
test('real Godori set can lift two-point opponent to seven from a visible floor bird',async()=>{
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 const engine=require('../game-engine.js');
 const evidence=advice.publicGoStopRisk({
  deck:engine.masterDeck,floorIds:['m8-2','m6-2'],ownHandIds:['m5-3'],
  opponentCapturedIds:['m2-1','m4-1','m1-1','m3-1','m12-1'],
  opponentScore:2,playerScore:7,opponentHandSize:5,
  scorePlayer:engine.scorePlayer
 });
 assert.ok(evidence.opponentCeiling>=7);
 assert.equal(evidence.ownGainChance,0);
 assert.equal(advice.riskDecision(evidence,{opponentScore:2}),'stop');
});
test('hypergeometric no-match estimates are bounded and do not inspect hidden cards',()=>{
 assert.equal(advice.probabilityNoMatch(10,0,8),1);
 assert.equal(advice.probabilityNoMatch(10,10,1),0);
 assert.equal(advice.probabilityNoMatch(10,2,0),1);
 assert.ok(advice.probabilityNoMatch(10,2,3)>0);
 assert.ok(advice.probabilityNoMatch(10,2,3)<1);
});
