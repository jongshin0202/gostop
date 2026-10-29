'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const optimizer=require('../training-optimization.js');
const card=(id,month,type,flags=[],ribbonSet)=>({id,month,type,flags,ribbonSet});
const choice=(hand,target,extra={})=>({card:hand,target,profile:{godoriRoute:{alive:false},ribbonRoutes:{}},...extra});
test('isolated Training strategy chooses a 2x Single from hand over ordinary Single for same table target',()=>{
  const target=card('m11-1',11,'ribbon');
  const list=[choice(card('m11-2',11,'pi'),target),choice(card('m11-3',11,'pi',['doublePi']),target)];
  const before=JSON.stringify(list),best=optimizer.rank(list);
  assert.equal(best.cardId,'m11-3');
  assert.equal(best.reasonKey,'use-higher-value-hand');
  assert.equal(JSON.stringify(list),before,'pure scorer must not mutate state');
});
test('isolated Training strategy prefers a Single over an ordinary Picture from the same family',()=>{
  const target=card('m6-2',6,'ribbon');
  assert.equal(optimizer.rank([choice(card('m6-1',6,'animal'),target),choice(card('m6-3',6,'pi'),target)]).cardId,'m6-3');
});
test('viable 5-BIRDIES Godori can override ordinary Single preference',()=>{
  const target=card('m2-2',2,'ribbon');
  const profile={godoriRoute:{alive:true},ribbonRoutes:{}};
  const bird=choice(card('m2-1',2,'animal',['godori']),target,{profile});
  const pi=choice(card('m2-4',2,'pi'),target,{profile});
  assert.equal(optimizer.rank([pi,bird]).cardId,'m2-1');
});
test('bright outranks ordinary table Single when scoring urgency is equal',()=>{
  const a=choice(card('m1-2',1,'ribbon'),card('m1-1',1,'bright'));
  const b=choice(card('m4-3',4,'pi'),card('m4-4',4,'pi'));
  assert.equal(optimizer.rank([b,a]).targetId,'m1-1');
});
test('already impossible ribbon route is not prioritized above a 2x Single capture',()=>{
  const stripe=choice(card('m1-3',1,'pi'),card('m1-2',1,'ribbon',[],'red'),{profile:{ribbonRoutes:{red:{alive:false}}}});
  const double=choice(card('m11-1',11,'ribbon'),card('m11-3',11,'pi',['doublePi']));
  assert.equal(optimizer.rank([stripe,double]).targetId,'m11-3');
});
test('reserved capture is avoided while another legal capture exists',()=>{
  const reserved=choice(card('m1-2',1,'ribbon'),card('m1-1',1,'bright'),{reserved:true});
  const live=choice(card('m4-3',4,'pi'),card('m4-4',4,'pi'));
  assert.equal(optimizer.rank([reserved,live]).cardId,'m4-3');
});
test('single available move does not invent lower-value comparisons',()=>{
  const a=choice(card('m5-3',5,'pi'),card('m5-4',5,'pi'));
  const r=optimizer.rank([a]);assert.equal(r.hasAlternative,false);assert.notEqual(r.reasonKey,'use-higher-value-hand');
});
test('no-match training candidate chooses least-risk discard with no invented capture',()=>{
  const a={card:card('m1-1',1,'bright'),target:null,discardRisk:999};
  const b={card:card('m8-3',8,'pi'),target:null,discardRisk:10};
  const r=optimizer.rank([a,b]);assert.equal(r.cardId,'m8-3');assert.equal(r.targetId,null);assert.equal(r.reasonKey,'safest-discard');
});
