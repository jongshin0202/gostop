import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {activeSnapshot,features,evaluate}=require('../dev-site/training-model-inference.js');
const deck=[
 {id:'m1-1',month:1,type:'bright',flags:[]},
 {id:'m1-3',month:1,type:'pi',flags:[]},
 {id:'m2-1',month:2,type:'animal',flags:['godori']},
 {id:'m2-3',month:2,type:'pi',flags:[]},
 {id:'m5-1',month:5,type:'animal',flags:[]},
 {id:'m5-3',month:5,type:'pi',flags:[]},
 {id:'m6-1',month:6,type:'animal',flags:[]},
 {id:'m6-3',month:6,type:'pi',flags:[]},
 {id:'m6-4',month:6,type:'pi',flags:[]},
 {id:'m12-3',month:12,type:'ribbon',flags:[]},
 {id:'m12-4',month:12,type:'pi',flags:['doublePi']}
];
const model=(i,value,version=4)=>{
 const weights=Array(16).fill(0);weights[i]=value;
 return {version,examples:5,weights};
};
test('only versioned active server weights are usable',()=>{
 const active=model(11,2);
 const response={ok:true,developmentModelVersion:4,model:model(11,8),activeCardModel:active};
 assert.deepEqual(activeSnapshot(response),active);
 assert.equal(activeSnapshot({...response,developmentModelVersion:5}),null);
 assert.equal(activeSnapshot({...response,activeCardModel:null}),null);
 assert.equal(activeSnapshot({...response,activeCardModel:{...active,weights:[1,2]}}),null);
 assert.equal(activeSnapshot({...response,activeCardModel:{...active,weights:Array(16).fill(Infinity)}}),null);
 assert.equal(activeSnapshot({...response,activeCardModel:{...active,weights:Array(16).fill(9)}}),null);
 assert.equal(activeSnapshot({...response,activeCardModel:{...active,examples:0}}),null);
 assert.equal(activeSnapshot({...response,ok:false}),null);
});
test('legacy development Worker is safe only while trained weights exactly match last activated examples',()=>{
 const active=model(11,2);
 const state={ok:true,developmentModelVersion:4,
  lastDevelopmentModelUpdateAt:'2026-11-08T18:00:00Z',
  lastDevelopmentModelExamples:5,model:{weights:active.weights,examples:5}};
 assert.deepEqual(activeSnapshot(state),active);
 assert.equal(activeSnapshot({...state,model:{...state.model,examples:6}}),null,
  'unactivated draft card weight updates must never be used for recommendations');
 assert.equal(activeSnapshot({...state,lastDevelopmentModelExamples:4}),null);
 assert.equal(activeSnapshot({...state,lastDevelopmentModelUpdateAt:null}),null);
 assert.equal(activeSnapshot({...state,activeCardModel:null}),null,
  'a modern Worker expressly reporting no active card model must stay disabled');
});
test('client features match original 16-dimensional server card model schema',()=>{
 const x=features({type:'pi',flags:['doublePi']},{type:'animal',flags:['godori']});
 assert.equal(x.length,16);
 assert.equal(x[2],1);assert.equal(x[4],1);
 assert.equal(x[9],1);assert.equal(x[11],1);
});
test('activated model can break a true strategic tie between two ordinary animals',()=>{
 const result=evaluate({
  handIds:['m2-3','m5-3'],floorIds:['m2-1','m5-1'],deck,
  recommendedHandId:'m5-3',recommendedFloorId:'m5-1',model:model(11,2)
 });
 assert.equal(result?.handId,'m2-3');
 assert.equal(result?.floorId,'m2-1');
 assert.equal(result?.version,4);
});
test('model cannot demote immediate Bright capture even with extreme opposite weights',()=>{
 const result=evaluate({
  handIds:['m1-3','m5-3'],floorIds:['m1-1','m5-1'],deck,
  recommendedHandId:'m1-3',recommendedFloorId:'m1-1',model:model(9,8)
 });
 assert.equal(result,null);
});
test('two-in-hand one-on-floor family priority cannot be overridden by Willow 2x Single',()=>{
 const result=evaluate({
  handIds:['m6-3','m6-4','m12-4'],floorIds:['m6-1','m12-3'],deck,
  recommendedHandId:'m6-3',recommendedFloorId:'m6-1',model:model(8,8)
 });
 assert.equal(result,null);
});
test('a model cannot override a valuable physical hand card with weaker same-family one',()=>{
 const d=[...deck,{id:'m5-4',month:5,type:'animal',flags:[]}];
 const result=evaluate({
  handIds:['m5-3','m5-4','m2-3'],floorIds:['m5-1','m2-1'],deck:d,
  recommendedHandId:'m5-3',recommendedFloorId:'m5-1',model:model(11,8)
 });
 assert.equal(result,null);
});
test('ambiguous dual table targets and no-match discards remain native decisions',()=>{
 const d=[...deck,{id:'m5-4',month:5,type:'animal',flags:[]}];
 assert.equal(evaluate({
  handIds:['m2-3','m5-3'],floorIds:['m2-1','m5-1','m5-4'],deck:d,
  recommendedHandId:'m5-3',recommendedFloorId:'m5-1',model:model(11,2)
 }),null);
 assert.equal(evaluate({
  handIds:['m2-3','m5-3'],floorIds:['m12-3'],deck,
  recommendedHandId:'m5-3',recommendedFloorId:'m12-3',model:model(11,2)
 }),null);
});
test('an immediate seven-point finishing capture cannot be sacrificed to model weights',()=>{
 const scorer=({captured})=>({total:captured.some(c=>c.id==='m5-1')?7:0});
 const result=evaluate({
  handIds:['m2-3','m5-3'],floorIds:['m2-1','m5-1'],deck,
  recommendedHandId:'m5-3',recommendedFloorId:'m5-1',model:model(11,8),
  scorePlayer:scorer
 });
 assert.equal(result,null);
});
test('failed or uncertain score calculations fail closed rather than trusting learned rankings',()=>{
 const result=evaluate({
  handIds:['m2-3','m5-3'],floorIds:['m2-1','m5-1'],deck,
  recommendedHandId:'m5-3',recommendedFloorId:'m5-1',model:model(11,8),
  scorePlayer:()=>{throw Error('unavailable');}
 });
 assert.equal(result,null);
});
test('invalid or draft-only models cannot activate locally',()=>{
 const input={
  handIds:['m2-3','m5-3'],floorIds:['m2-1','m5-1'],deck,
  recommendedHandId:'m5-3',recommendedFloorId:'m5-1'
 };
 assert.equal(evaluate({...input,model:null}),null);
 assert.equal(evaluate({...input,model:{weights:Array(16).fill(NaN),version:2}}),null);
});
