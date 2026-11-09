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
