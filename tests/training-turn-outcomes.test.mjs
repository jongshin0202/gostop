import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../game-engine.js');
const turn=require('../dev-site/training-turn-outcomes.js');
const computer=require('../dev-site/training-computer-go-stop.js');
const logic=require('../dev-site/training-advice-logic.js');

test('5-BIRDIES from two existing birds plus table bird is counted as FIVE extra points',()=>{
 const observed=turn.assessTwoSides({
  deck:engine.masterDeck,floorIds:['m8-2','m9-3'],
  ownHandIds:['m12-3'],ownCapturedIds:[],
  opponentCapturedIds:['m2-1','m4-1'],
  opponentHandSize:3,opponentScore:2,ownScore:7,scorePlayer:engine.scorePlayer
 });
 assert.ok(observed);
 assert.ok(observed.opponentCeiling>=7,'opponent score 2 + Godori 5 must be at least 7');
 assert.equal(observed.opponentCanFinish,true);
 assert.ok(observed.opponentBest?.captureIds.some(id=>id==='m8-2'));
});
test('two captured Blue Stripes and one bird can gain eight points via play and draw',()=>{
 const out=turn.enumerateTurn({
  deck:engine.masterDeck,
  floorIds:['m8-2','m10-2'],actingCapturedIds:['m2-1','m4-1','m6-2','m9-2'],
  otherCapturedIds:['m1-3','m3-3'],knownHandIds:['m11-3'],
  actingHandSize:4,currentScore:2,scorePlayer:engine.scorePlayer
 });
 assert.ok(out.ceiling>=10,'5 BIRDIES + 3 Blue Stripes plus 2 already scored = 10');
 assert.equal(out.possibleFinish,true);
 assert.ok(out.scenarios>0);
});
test('unseen play and drawn card can form a Jjok capture even with an empty floor',()=>{
 const out=turn.enumerateTurn({deck:engine.masterDeck,floorIds:[],
  actingCapturedIds:['m1-3','m2-3','m3-3','m4-3','m5-3','m6-3','m7-3','m8-3','m9-3'],
  actingHandSize:2,currentScore:0,scorePlayer:engine.scorePlayer});
 assert.ok(out.ceiling>=1,'Jjok plus another Single can cross the ten-Single threshold');
});
test('visible three-card stack and Bomb are modeled without guessing hidden identity',()=>{
 const out=turn.enumerateTurn({deck:engine.masterDeck,floorIds:['m3-1'],
  actingCapturedIds:[],otherCapturedIds:[],actingHandSize:3,
  currentScore:0,scorePlayer:engine.scorePlayer});
 assert.ok(out.scenarios>0);
 assert.ok(out.best);
});
test('dangerous Blue Stripe discard is rejected in favor of safer discard',()=>{
 const visible={hand:['m9-2','m3-3'],floor:['m6-3'],humanCaptured:[],
  computerCaptured:['m6-2','m10-2']};
 const danger=logic.discardDanger('m9-2',visible,engine.masterDeck,engine.scorePlayer);
 assert.equal(danger.bonus,'blue');
 assert.ok(danger.maximumGain>=3);
 const choice=logic.safestDiscard(visible,engine.masterDeck,engine.scorePlayer);
 assert.equal(choice.choice.cardId,'m3-3');
 assert.match(logic.riskyDiscardCopy('Cherry Single','Star Blue Stripe',danger,'en'),
  /three Blue Stripes for 3 points/);
});
test('when no capture alternatives exist, no fabricated comparison is supplied',()=>{
 const visible={hand:['m9-2'],floor:['m9-3'],humanCaptured:[],computerCaptured:[]};
 assert.equal(logic.captureComparison(visible,'m9-2','m9-3',engine.masterDeck,engine.scorePlayer),null);
});
test('two different secured captures support an evidence-based alternative comparison',()=>{
 const visible={hand:['m8-4','m6-3'],floor:['m8-3','m6-4'],
  humanCaptured:['m8-1','m8-2','m6-1','m6-2'],computerCaptured:[]};
 const comp=logic.captureComparison(visible,'m8-4','m8-3',engine.masterDeck,engine.scorePlayer);
 assert.ok(comp);
 assert.equal(comp.selected.secured,true);
 assert.equal(comp.alternative.secured,true);
 assert.match(logic.captureComparisonCopy('Hill Single','Rose Single',comp,'en'),/Both Hill Single and Rose Single/);
});
test('computer policy sees possible score versus opponent cannot finish',()=>{
 // Browser integration gives the computer its OWN hand only, no human hand ids.
 const e={masterDeck:engine.masterDeck,scorePlayer:engine.scorePlayer};
 const ai={hand:[engine.masterDeck.find(c=>c.id==='m9-3')],
  captured:['m2-1','m4-1'].map(id=>engine.masterDeck.find(c=>c.id===id))};
 // Tests also cover absent global analysis: no fallback may alter original AI.
 const result=computer.choose({
  deck:engine.masterDeck,floor:[],ai,humanCaptured:[],
  humanHandCount:2,aiScore:7,humanScore:0,engine:e
 });
 assert.equal(result,null,'policy fails closed when scoring enumerator is not loaded first');
});
