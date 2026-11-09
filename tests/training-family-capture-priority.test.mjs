import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {select}=require('../dev-site/training-family-capture-priority.js');
const deck=[
 {id:'m5-1',month:5,type:'animal',flags:[]},
 {id:'m5-3',month:5,type:'pi',flags:[]},
 {id:'m5-4',month:5,type:'pi',flags:[]},
 {id:'m12-3',month:12,type:'ribbon',flags:[]},
 {id:'m12-4',month:12,type:'pi',flags:['doublePi']}
];
const example={handIds:['m5-1','m5-4','m12-4'],
 floorIds:['m5-3','m12-3'],deck,
 recommendedHandId:'m12-4',recommendedFloorId:'m12-3'};
test('2 same-family hand plus 1 floor beats a separate 2x Willow Single',()=>{
 const choice=select(example);
 assert.equal(choice.handId,'m5-4');
 assert.equal(choice.floorId,'m5-3');
 assert.equal(choice.month,5);
 assert.equal(choice.changed,true);
});
test('never invent a secured family when fewer than two cards are in hand',()=>{
 assert.equal(select({...example,handIds:['m5-4','m12-4']}),null);
});
test('no family match on floor does not override normal ranking',()=>{
 assert.equal(select({...example,floorIds:['m12-3']}),null);
});
test('two family table targets are not the simple two-in-hand-one-on-table case',()=>{
 assert.equal(select({...example,floorIds:['m5-1','m5-3','m12-3'],handIds:['m5-4','m5-2','m12-4'],
 deck:[...deck,{id:'m5-2',month:5,type:'ribbon',flags:[]}]}),null);
});
test('same high-value family card chosen deterministically regardless of DOM ordering',()=>{
 const a=select(example),b=select({...example,handIds:['m12-4','m5-4','m5-1']});
 assert.deepEqual({hand:a.handId,floor:a.floorId},{hand:b.handId,floor:b.floorId});
});

test('native recommendation that already captures the locked family is not replaced',()=>{
 assert.equal(select({...example,recommendedHandId:'m5-4',recommendedFloorId:'m5-3'}),null);
});
test('Bright capture remains higher priority than a separate family-lock move',()=>{
 const bright={id:'m8-1',month:8,type:'bright',flags:[]};
 const caller={...example,handIds:[...example.handIds,'m8-3'],
  floorIds:[...example.floorIds,bright.id],
  deck:[...deck,bright,{id:'m8-3',month:8,type:'pi',flags:[]}],
  recommendedHandId:'m8-3',recommendedFloorId:bright.id};
 assert.equal(select(caller),null);
});
test('live godori Birdie capture is not displaced by a family-lock correction',()=>{
 const bird={id:'m4-1',month:4,type:'animal',flags:['godori']};
 const caller={...example,handIds:[...example.handIds,'m4-4'],
  floorIds:[...example.floorIds,bird.id],
  deck:[...deck,bird,{id:'m4-4',month:4,type:'pi',flags:[]}],
  recommendedHandId:'m4-4',recommendedFloorId:bird.id};
 assert.equal(select(caller),null);
});
test('completing the third Blue Stripe outranks the family-lock correction',()=>{
 const blue={id:'m10-2',month:10,type:'ribbon',ribbonSet:'blue',flags:[]};
 const older=[{id:'m6-2',month:6,type:'ribbon',ribbonSet:'blue',flags:[]},
              {id:'m9-2',month:9,type:'ribbon',ribbonSet:'blue',flags:[]}];
 const caller={...example,handIds:[...example.handIds,'m10-4'],
  floorIds:[...example.floorIds,blue.id],
  deck:[...deck,blue,...older,{id:'m10-4',month:10,type:'pi',flags:[]}],
  ownCapturedIds:older.map(c=>c.id),
  recommendedHandId:'m10-4',recommendedFloorId:blue.id};
 assert.equal(select(caller),null);
});
test('first Blue Stripe without set completion may still be outranked by the secured family',()=>{
 const blue={id:'m10-2',month:10,type:'ribbon',ribbonSet:'blue',flags:[]};
 const caller={...example,handIds:[...example.handIds,'m10-4'],
  floorIds:[...example.floorIds,blue.id],
  deck:[...deck,blue,{id:'m10-4',month:10,type:'pi',flags:[]}],
  ownCapturedIds:[],recommendedHandId:'m10-4',recommendedFloorId:blue.id};
 assert.equal(select(caller)?.handId,'m5-4');
});
