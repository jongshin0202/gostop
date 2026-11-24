import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../game-engine.js');
const safe=require('../dev-site/training-safe-two-table.js');
const logic=require('../dev-site/training-advice-logic.js');
const deck=engine.masterDeck;
const visible={
 hand:['m10-1','m12-2'],
 floor:['m10-2','m10-3','m12-3'],
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
 const decision=safe.select({...state(visible),recommendedHandId:'m10-1',recommendedFloorId:'m10-3'});
 assert.equal(decision?.handId,'m12-2');
 assert.equal(decision?.floorId,'m12-3');
 assert.equal(decision?.deferredMonth,10);
});
test('native Willow is preserved and comparison explains why Star can wait',()=>{
 const advice=logic.captureComparison(visible,'m12-2','m12-3',deck,engine.scorePlayer);
 assert.ok(advice);
 assert.equal(advice.alternative.month,10);
 assert.equal(advice.alternative.safeToWait,true);
 assert.equal(advice.selected.safeToWait,false);
 const copy=logic.captureComparisonCopy('Willow Picture onto Willow Stripe','Star Picture onto Star Single',advice,'en');
 assert.match(copy,/Star can wait/);
 assert.match(copy,/two Star cards are on the table/);
 assert.match(copy,/other remains/);
 assert.doesNotMatch(copy,/no (?:demonstrated|clear).*scoring advantage/i);
});
test('Star is not postponed if it is the only available capture',()=>{
 const v={...visible,hand:['m10-1'],floor:['m10-2','m10-3']};
 assert.equal(safe.select({...state(v),recommendedHandId:'m10-1',recommendedFloorId:'m10-3'}),null);
});
test('Star with two cards in hand, or fewer than two table cards, cannot be misclassified',()=>{
 const v={...visible,hand:['m10-1','m10-4','m12-2']};
 assert.deepEqual(safe.eligible(state(v)),[]);
 const w={...visible,floor:['m10-2','m12-3']};
 assert.deepEqual(safe.eligible(state(w)),[]);
});
test('a third Blue Stripe scoring route for opponent vetoes deferral',()=>{
 const v={...visible,computerCaptured:['m6-2','m9-2']};
 assert.deepEqual(safe.eligible(state(v)),[]);
 assert.equal(safe.select({...state(v),recommendedHandId:'m10-1',recommendedFloorId:'m10-2'}),null);
});
test('an immediate tenth Single from Star remains a higher priority',()=>{
 const v={...visible,hand:['m10-4','m12-2'],floor:['m10-2','m10-3','m12-3'],
  humanCaptured:['m1-3','m2-3','m3-3','m4-3','m5-3','m6-3','m7-3','m8-3','m9-3']};
 // Star m10-4 into Star m10-3 yields two ordinary Singles.
 assert.equal(safe.select({...state(v),recommendedHandId:'m10-4',recommendedFloorId:'m10-3'}),null);
});
test('cannot claim safety from an invalid or unavailable score calculator',()=>{
 assert.deepEqual(safe.eligible({...state(visible),scorePlayer:null}),[]);
 assert.deepEqual(safe.eligible({...state(visible),scorePlayer:()=>({total:NaN})}),[]);
});
test('all locales explain the two-table Star timing without scoring-advantage filler',()=>{
 for(const lang of ['en','ko','es','fr','de','ja','zh']){
  const text=safe.explain(10,lang);
  assert.ok(text.length>=35,lang);
  assert.match(text,/Star/,lang);
  assert.doesNotMatch(text,/no demonstrated immediate scoring advantage/i);
 }
});
test('unsecured comparison with no proven strategic distinction generates no filler',()=>{
 const v={...visible,hand:['m12-2','m6-2'],floor:['m12-3','m6-3']};
 const r=logic.captureComparison(v,'m12-2','m12-3',deck,engine.scorePlayer);
 if(r&&!r.alternative.secured&&!r.alternative.safeToWait)
  assert.equal(logic.captureComparisonCopy('Willow Picture','Rose Stripe',r,'en'),'');
});
