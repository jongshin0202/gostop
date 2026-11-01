import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {choose}=require('../dev-site/training-shaken-priority.js');
const c=(id,month,type='pi',ribbonSet)=>({id,month,type,ribbonSet,flags:[]});
const cards=[c('m4-1',4,'animal'),c('m4-2',4),c('m10-1',10,'ribbon','blue'),
 c('m10-2',10,'animal'),c('m11-1',11,'bright')];
const input={shakenMonths:[4],handIds:['m4-2','m10-2'],
 floorIds:['m4-1','m10-1'],recommendedHandId:'m10-2',
 recommendedFloorId:'m10-1',deck:cards,ownCapturedIds:[]};
test('capture a discarded card from a publicly revealed opponent shake first',()=>{
 assert.deepEqual(choose(input),{handId:'m4-2',floorId:'m4-1',month:4});
});
test('never assume a shake month from opponent multiplier alone',()=>{
 assert.equal(choose({...input,shakenMonths:[]}),null);
 assert.equal(choose({...input,shakenMonths:[7]}),null);
 assert.equal(choose({...input,handIds:['m10-2']}),null);
 assert.equal(choose({...input,floorIds:['m10-1']}),null);
});
test('already advised shook-card capture stays recommended',()=>{
 assert.equal(choose({...input,recommendedHandId:'m4-2',recommendedFloorId:'m4-1'}),null);
});
test('do not skip an essential third Bright, fifth Birdie or finished stripe set',()=>{
 const bright={...input,recommendedFloorId:'m11-1',handIds:['m4-2','m11-2'],
  floorIds:['m4-1','m11-1'],deck:[...cards,c('m11-2',11)],
  ownCapturedIds:['m11-3','m11-4']};
 const brightCards=bright.deck.map(x=>x.id==='m11-3'||x.id==='m11-4'?{...x,type:'bright'}:x);
 assert.equal(choose({...bright,deck:[...brightCards,c('m11-3',11,'bright'),c('m11-4',11,'bright')],
   recommendedHandId:'m11-2'}),null);
 const birdieDeck=[...cards,{...c('m8-1',8,'animal'),flags:['godori']},
  {...c('m2-1',2,'animal'),flags:['godori']},
  {...c('m4-1',4,'animal'),flags:['godori']}];
 assert.equal(choose({...input,recommendedFloorId:'m4-1',recommendedHandId:'m4-2',
   ownCapturedIds:['m8-1','m2-1'],deck:birdieDeck}),null);
 const stripeDeck=[...cards,c('m10-3',10,'ribbon','blue'),c('m10-4',10,'ribbon','blue')];
 assert.equal(choose({...input,deck:stripeDeck,ownCapturedIds:['m10-3','m10-4']}),null);
});
