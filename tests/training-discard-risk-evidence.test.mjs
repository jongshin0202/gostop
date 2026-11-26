import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../game-engine.js');
const logic=require('../dev-site/training-advice-logic.js');
const deck=engine.masterDeck;
const baseCaptured=[
 'm1-1',                        // one Bright
 'm7-1','m8-2','m10-1',          // three Pictures; no 5-BIRDIES route
 'm3-2','m9-2',                  // one Red and one Blue Stripe
 'm1-3','m2-3','m3-3','m4-3','m6-3','m12-4' // six physical Singles, one 2x
];
const observed=computerCaptured=>({
 hand:['m3-4','m5-3'],floor:['m1-4','m7-3'],
 humanCaptured:[],computerCaptured
});
test('reported case: six Singles (one 2x), 3 Pictures, 2 unrelated Stripes and one Bright cannot score by taking Iris Single',()=>{
 const state=observed(baseCaptured);
 const risk=logic.discardDanger('m5-3',state,deck,engine.scorePlayer);
 assert.equal(risk.maximumGain,0);
 assert.equal(risk.evidence,null);
 assert.equal(logic.riskyDiscardCopy('Cherry Single','Iris Single',risk,'en'),null);
 const best=logic.safestDiscard(state,deck,engine.scorePlayer);
 assert.ok(best);
 assert.equal(best.choice.maximumGain,0);
});
test('six physical Singles with TWO 2x cards can score: only a verified Iris Single capture earns a warning',()=>{
 const changed=baseCaptured.map(id=>id==='m6-3'?'m11-3':id);
 const state=observed(changed);
 const risk=logic.discardDanger('m5-3',state,deck,engine.scorePlayer);
 assert.equal(risk.maximumGain,1);
 assert.equal(risk.evidence?.matchingId,'m5-4');
 assert.equal(risk.evidence?.category,'singles');
 assert.equal(risk.evidence?.beforeCount,8);
 assert.equal(risk.evidence?.afterCount,10);
 const text=logic.riskyDiscardCopy('Cherry Single','Iris Single',risk,'en','Iris Single');
 assert.match(text,/If the computer has Iris Single/);
 assert.match(text,/10 effective Singles for 1 point/);
 assert.doesNotMatch(text,/1 immediate points/);
});
test('a captured Gukjin converted to 2 Singles can change the threshold, but the rationale must identify the scoring category',()=>{
 const state=observed(baseCaptured.map(id=>id==='m10-1'?'m9-1':id));
 const risk=logic.discardDanger('m5-3',state,deck,engine.scorePlayer);
 if(risk.maximumGain>0){
  assert.equal(risk.evidence?.category,'singles');
  assert.equal(risk.evidence?.opponentScoringMode,'pi');
  assert.match(logic.riskyDiscardCopy('Cherry Single','Iris Single',risk,'en','Iris Single'),/effective Singles/);
 }
});
test('three Blue Stripes remain a verified urgent scoring threat, with a specific conditional explanation',()=>{
 const state={hand:['m9-2','m3-3'],floor:['m6-3'],humanCaptured:[],
  computerCaptured:['m6-2','m10-2']};
 const risk=logic.discardDanger('m9-2',state,deck,engine.scorePlayer);
 assert.ok(risk.maximumGain>=3);
 assert.equal(risk.bonus,'blue');
 assert.ok(risk.evidence?.matchingId);
 const text=logic.riskyDiscardCopy('Cherry Single','Star Blue Stripe',risk,'en','Star Single');
 assert.match(text,/If the computer has Star Single/);
 assert.match(text,/three Blue Stripes for 3 points/);
});
test('invalid scoring results never justify a warning or an unsupported recommendation',()=>{
 const state=observed(baseCaptured);
 const risk=logic.discardDanger('m5-3',state,deck,()=>({total:NaN}));
 assert.equal(risk.maximumGain,0);
 assert.equal(risk.evidence,null);
 assert.equal(logic.riskyDiscardCopy('Cherry Single','Iris Single',risk,'en'),null);
});
