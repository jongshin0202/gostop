import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const logic=require('../dev-site/training-advice-logic.js');

test('one Rose hand card with two Rose table targets is a target choice, not two secured future moves',()=>{
 const engine=require('../game-engine.js');
 const v={hand:['m6-3'],floor:['m6-4','m6-2'],
  humanCaptured:[],computerCaptured:['m6-1']};
 const r=logic.captureComparison(v,'m6-3','m6-4',engine.masterDeck,engine.scorePlayer);
 assert.equal(r.matchingHandCount,1);
 assert.equal(r.selected.h,r.alternative.h);
 assert.equal(r.selected.targetType,'pi');
 assert.equal(r.alternative.targetType,'ribbon');
 const copy=logic.captureComparisonCopy('Rose Single','Rose Blue Stripe',r,'en');
 assert.match(copy,/only matching hand card/);
 assert.match(copy,/Single rather than the Stripe/);
 assert.doesNotMatch(copy,/Both|remains available|secured/i);
 assert.equal(logic.onlyCaptureOption(v),null,'two table targets are distinct captures');
});

test('Vine Bird and Rose flower both match their hand cards',()=>{
 const visible={hand:['m4-4','m6-2'],floor:['m8-1','m4-1','m12-2','m6-3']};
 const captures=logic.captureOptions(visible);
 assert.deepEqual(captures,[
  {handId:'m4-4',floorId:'m4-1'},
  {handId:'m6-2',floorId:'m6-3'}
 ]);
 assert.equal(logic.onlyCaptureOption(visible),null);
});
test('one real capture is the only option only when precisely one hand/floor pair matches',()=>{
 assert.deepEqual(logic.onlyCaptureOption({hand:['m4-4','m6-2'],floor:['m4-1','m8-1']}),
  {handId:'m4-4',floorId:'m4-1'});
});
test('same-family multiple table cards also disprove exclusive capture',()=>{
 assert.equal(logic.onlyCaptureOption({hand:['m6-2'],floor:['m6-3','m6-4']}),null);
 assert.equal(logic.captureOptions({hand:['m6-2'],floor:['m6-3','m6-4']}).length,2);
});
