import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../game-engine.js');
const safe=require('../dev-site/training-safe-two-table.js');
const logic=require('../dev-site/training-advice-logic.js');
const deck=engine.masterDeck;
const visible={
 hand:['m10-3','m12-4'],
 floor:['m10-1','m10-2','m12-3'],
 humanCaptured:[],computerCaptured:[]
};
const state=v=>({
 handIds:v.hand,floorIds:v.floor,ownCapturedIds:v.humanCaptured,
 opponentCapturedIds:v.computerCaptured,deck,scorePlayer:engine.scorePlayer
});
test('two Star cards on table and one in hand make Star safe to defer',()=>{
 const deferred=safe.eligible(state(visible));
 assert.deepEqual(deferred.map(x=>x.month),[10]);
 assert.equal(deferred[0].unknownMatching,1);
 const decision=safe.select({...state(visible),recommendedHandId:'m10-3',recommendedFloorId:'m10-2'});
 assert.equal(decision?.handId,'m12-4');
 assert.equal(decision?.floorId,'m12-3');
 assert.equal(decision?.deferredMonth,10);
});
test('native Willow is preserved and comparison explains why Star can wait',()=>{
 const advice=logic.captureComparison(visible,'m12-4','m12-3',deck,engine.scorePlayer);
 assert.ok(advice);
 assert.equal(advice.alternative.month,10);
 assert.equal(advice.alternative.safeToWait,true);
 assert.equal(advice.selected.safeToWait,false);
 const copy=logic.captureComparisonCopy('Willow Picture onto Willow Stripe','Star Picture onto Star Single',advice,'en');
 assert.match(copy,/Star can wait/);
 assert.match(copy,/one Star card in your hand and two on the table/);
 assert.ok(copy.length<95);
 assert.doesNotMatch(copy,/Even if|next turn|Capture a different family first/i);
 assert.doesNotMatch(copy,/no (?:demonstrated|clear).*scoring advantage/i);
});
test('Star is not postponed if it is the only available capture',()=>{
 const v={...visible,hand:['m10-3'],floor:['m10-1','m10-2']};
 assert.equal(safe.select({...state(v),recommendedHandId:'m10-3',recommendedFloorId:'m10-2'}),null);
});
test('Star with two cards in hand, or fewer than two table cards, cannot be misclassified',()=>{
 const v={...visible,hand:['m10-3','m10-4','m12-4']};
 assert.deepEqual(safe.eligible(state(v)),[]);
 const w={...visible,floor:['m10-1','m12-3']};
 assert.deepEqual(safe.eligible(state(w)),[]);
});
test('a third Blue Stripe scoring route for opponent vetoes deferral',()=>{
 const v={...visible,computerCaptured:['m6-2','m9-2']};
 assert.deepEqual(safe.eligible(state(v)),[]);
 assert.equal(safe.select({...state(v),recommendedHandId:'m10-3',recommendedFloorId:'m10-2'}),null);
});
test('an immediate tenth Single from Star remains a higher priority',()=>{
 const v={...visible,hand:['m10-3','m12-4'],floor:['m10-1','m10-4','m12-3'],
  humanCaptured:['m1-3','m2-3','m3-3','m4-3','m5-3','m6-3','m7-3','m8-3','m9-3']};
 // Star m10-3 into Star m10-4 yields two ordinary Singles.
 assert.equal(safe.select({...state(v),recommendedHandId:'m10-3',recommendedFloorId:'m10-4'}),null);
});
test('cannot claim safety from an invalid or unavailable score calculator',()=>{
 assert.deepEqual(safe.eligible({...state(visible),scorePlayer:null}),[]);
 assert.deepEqual(safe.eligible({...state(visible),scorePlayer:()=>({total:NaN})}),[]);
});
test('all locales explain the two-table Star timing without scoring-advantage filler',()=>{
 for(const lang of ['en','ko','es','fr','de','ja','zh']){
  const text=safe.explain(10,lang);
  assert.ok(text.length>=15&&text.length<=110,lang);
  assert.match(text,/Star/,lang);
  assert.doesNotMatch(text,/no demonstrated immediate scoring advantage|next turn|Capture a different family first|if the game continues/i,lang);
 }
});
test('concise Berry advice preserves the one-in-hand/two-on-table reason without extra instructions',()=>{
 const copy=safe.explain(11,'en');
 assert.equal(copy,'Berry can wait: one Berry card in your hand and two on the table.');
});

test('unsecured comparison with no proven strategic distinction generates no filler',()=>{
 const v={...visible,hand:['m12-4','m6-2'],floor:['m12-3','m6-3']};
 const r=logic.captureComparison(v,'m12-4','m12-3',deck,engine.scorePlayer);
 if(r&&!r.alternative.secured&&!r.alternative.safeToWait)
  assert.equal(logic.captureComparisonCopy('Willow Picture','Rose Stripe',r,'en'),'');
});

test('Vine Bird Picture vs Rose Stripe retains an evidence-based 5-BIRDIES explanation',()=>{
 const v={hand:['m4-4','m6-2'],floor:['m4-1','m6-3'],
  humanCaptured:[],computerCaptured:[]};
 const choice=logic.captureComparison(v,'m4-4','m4-1',deck,engine.scorePlayer);
 assert.equal(choice?.selected.birdieOpportunity,true);
 const explanation=logic.captureComparisonCopy('Vine Single onto Vine Bird Picture',
  'Rose Stripe onto Rose Single',choice,'en');
 assert.match(explanation,/5-BIRDIES/);
 assert.match(explanation,/Rose/);
 assert.doesNotMatch(explanation,/no demonstrated immediate scoring advantage/i);
});
test('do not promise a 5-BIRDIES route once the opponent captured another required bird',()=>{
 const v={hand:['m4-4','m6-2'],floor:['m4-1','m6-3'],
  humanCaptured:[],computerCaptured:['m2-1']};
 const choice=logic.captureComparison(v,'m4-4','m4-1',deck,engine.scorePlayer);
 assert.equal(choice?.selected.birdieOpportunity,false);
 const explanation=logic.captureComparisonCopy('Vine Single onto Vine Bird Picture',
  'Rose Stripe onto Rose Single',choice,'en');
 assert.doesNotMatch(explanation,/5-BIRDIES/);
});
