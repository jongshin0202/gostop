'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ExpertRanker,feature}=require('../training-learning/learner.js');
const card=(id,type,flags=[])=>({id,month:6,type,flags});
const single={card:card('m6-3','pi'),target:card('m6-2','ribbon')};
const double={card:card('m6-4','pi',['doublePi']),target:card('m6-2','ribbon')};
const turn={chosenId:'m6-4|m6-2',legalMoves:[single,double]};
test('shadow learner learns the expert choice without changing candidates',()=>{
 const model=new ExpertRanker();
 const before=JSON.stringify(turn);
 for(let i=0;i<12;i++)assert.equal(model.trainGame({id:'dev-example-'+i,complete:true,decisions:[turn]}),1);
 assert.equal(model.rank(turn.legalMoves).id,turn.chosenId);
 assert.equal(JSON.stringify(turn),before);
 assert.equal(model.examples,12);
});
test('completed games only, with duplicate protection',()=>{
 const model=new ExpertRanker();
 assert.throws(()=>model.trainGame({id:'unfinished',complete:false,decisions:[turn]}));
 assert.equal(model.trainGame({id:'one',complete:true,decisions:[turn]}),1);
 assert.equal(model.trainGame({id:'one',complete:true,decisions:[turn]}),0);
 assert.equal(model.examples,1);
});
test('trained weights can be exported and restored without a user account',()=>{
 const model=new ExpertRanker();
 model.trainGame({id:'x',complete:true,decisions:[turn]});
 const serialized=JSON.stringify(model.export());
 assert.doesNotMatch(serialized,/token|password|email|account/i);
 const clone=new ExpertRanker(JSON.parse(serialized));
 assert.deepEqual(clone.export(),model.export());
});
test('evaluator reports observable agreement without changing model',()=>{
 const model=new ExpertRanker();
 const before=JSON.stringify(model.export());
 const outcome=model.evaluate([turn]);
 assert.equal(outcome.n,1);
 assert.ok(outcome.accuracy===0||outcome.accuracy===1);
 assert.equal(JSON.stringify(model.export()),before);
});
test('feature extraction retains card type and 2x Single value',()=>{
 assert.notDeepEqual(feature(single.card,single.target),feature(double.card,double.target));
});
