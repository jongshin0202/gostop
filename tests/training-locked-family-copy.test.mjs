import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../game-engine.js');
const logic=require('../dev-site/training-advice-logic.js');
const singles=['m1-3','m2-3','m3-3','m4-3','m5-3','m7-3','m8-3','m9-3','m10-3'];
const visible={hand:['m6-1','m12-2'],floor:['m6-3','m12-3'],
 humanCaptured:singles,computerCaptured:['m12-1','m12-4']};
const compare=v=>logic.captureComparison(v,'m6-1','m6-3',engine.masterDeck,engine.scorePlayer);
test('Rose first: Willow locked, Rose still at risk, nine Singles become ten',()=>{
 const c=compare(visible);
 assert.ok(c);
 assert.equal(c.selected.h,'m6-1');
 assert.equal(c.selected.f,'m6-3');
 assert.equal(c.selected.secured,false);
 assert.equal(c.selected.bonus,1);
 assert.equal(c.alternative.h,'m12-2');
 assert.equal(c.alternative.f,'m12-3');
 assert.equal(c.alternative.secured,true);
 assert.equal(c.alternative.month,12);
 const explanation=logic.captureComparisonCopy('Rose Picture onto Rose Single',
  'Willow Picture onto Willow Stripe',c,'en');
 assert.match(explanation,/Willow is locked in/);
 assert.match(explanation,/Capture the unlocked Rose Picture onto Rose Single first/);
 assert.match(explanation,/Willow can wait/);
 assert.doesNotMatch(explanation,/advances your score more than/);
});
test('missing fourth Willow card is not falsely described as locked',()=>{
 const c=compare({...visible,computerCaptured:['m12-1']});
 assert.equal(c.alternative.secured,false);
 const copy=logic.captureComparisonCopy('Rose Picture onto Rose Single',
  'Willow Picture onto Willow Stripe',c,'en');
 assert.doesNotMatch(copy,/locked in/);
});
test('all four Willow cards can be accounted for across hand, floor and both captured piles',()=>{
 const c=compare({...visible,humanCaptured:[...singles,'m12-4'],computerCaptured:['m12-1']});
 assert.equal(c.alternative.secured,true);
});
test('another secure alternative is used for timing explanation ahead of score-only choice',()=>{
 const c=compare({...visible,hand:[...visible.hand,'m11-3'],
  floor:[...visible.floor,'m11-2']});
 assert.equal(c.alternative.month,12);
 assert.equal(c.alternative.secured,true);
});
test('locked family explanation remains available in all seven languages',()=>{
 const c=compare(visible);
 for(const lang of ['en','ko','es','fr','de','ja','zh']){
  const out=logic.captureComparisonCopy('Rose Picture','Willow Stripe',c,lang);
  assert.ok(out.length>35,lang);
  assert.match(out,/Willow/,lang);
 }
});
