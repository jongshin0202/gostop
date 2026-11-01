import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const priority=require('../dev-site/training-reserved-ppeok-priority.js');
const base={
 handIds:['m4-4','m10-3'],
 floorIds:['m4-1','m4-2','m4-3','m10-2'],
 humanCapturedIds:['m10-1','m10-4'],
 opponentCapturedIds:['m1-4'],
 opponentSingleIds:['m1-4'],
 stacks:[{cardIds:['m4-1','m4-2','m4-3']}],
 recommendedHandId:'m10-3',recommendedFloorId:'m10-2'
};
test('two reserved capture options: steal-eligible ppeok pile wins before blue stripe',()=>{
 const r=priority.select(base);
 assert.equal(r.handId,'m4-4');
 assert.equal(r.floorId,'m4-3','the protected game targets the last card in a stack');
 assert.equal(r.totalCapturedCards,4);
 assert.equal(r.stolenSingles,1);
 assert.equal(r.otherHandId,'m10-3');
 assert.equal(r.otherFloorId,'m10-2');
});
test('no opponent Singles means do not force ppeok over the native recommendation',()=>{
 assert.equal(priority.select({...base,opponentCapturedIds:[],opponentSingleIds:[]}),null);
});
test('blue stripe must itself be reserved or the new rule does not replace it',()=>{
 assert.equal(priority.select({...base,humanCapturedIds:['m10-1']}),null);
});
test('no ppeok stack, malformed stack, or unavailable matching hand card is a non-match',()=>{
 assert.equal(priority.select({...base,stacks:[]}),null);
 assert.equal(priority.select({...base,stacks:[{cardIds:['m4-1','m4-2']}]}),null);
 assert.equal(priority.select({...base,stacks:[{cardIds:['m4-1','m4-2','m10-2']}]}),null);
 assert.equal(priority.select({...base,handIds:['m10-3']}),null);
});
test('do not override when native recommendation already takes a pile',()=>{
 assert.equal(priority.select({...base,recommendedHandId:'m4-4',recommendedFloorId:'m4-3'}),null);
});
test('do not override a non-capture discard or inaccessible floor recommendation',()=>{
 assert.equal(priority.select({...base,recommendedFloorId:null}),null);
 assert.equal(priority.select({...base,recommendedFloorId:'m10-1'}),null);
 assert.equal(priority.select({...base,recommendedHandId:'m10-1'}),null);
});
test('duplicate public card renderings do not falsely establish a reserved month',()=>{
 assert.equal(priority.select({...base,humanCapturedIds:['m10-1','m10-1']}),null);
});
