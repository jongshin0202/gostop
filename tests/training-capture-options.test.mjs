import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const logic=require('../dev-site/training-advice-logic.js');

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
