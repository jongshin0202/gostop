import test from 'node:test';
import assert from 'node:assert/strict';
import {SpecialDecisionRanker,legalSpecialActions,specialFeatures} from '../training-learning/special-learner.mjs';
test('action vocabulary varies by actual special decision context',()=>{
 assert.deepEqual(legalSpecialActions({kind:'shake',bombReady:false}),['shake','keepForBomb']);
 assert.deepEqual(legalSpecialActions({kind:'shake',bombReady:true}),['shake','bomb']);
 assert.deepEqual(legalSpecialActions({kind:'bomb',bombReady:true}),['bomb','playOne']);
 assert.deepEqual(legalSpecialActions({kind:'none',bombReady:true}),[]);
 assert.equal(specialFeatures({kind:'shake',month:11,bombReady:true},'shake').length,16);
 assert.throws(()=>specialFeatures({},'nonsense'),/Unknown/);
});
test('special learner reinforces expert chosen option only after a completed game',()=>{
 const model=new SpecialDecisionRanker();
 const context={kind:'shake',month:11,bombReady:false};
 assert.equal(model.examples,0);
 assert.throws(()=>model.trainGame({id:'unfinished',complete:false,decisions:[]}),/completed/);
 assert.equal(model.trainGame({id:'train-1',complete:true,decisions:[{context,chosenAction:'keepForBomb'}]}),1);
 assert.equal(model.examples,1);
 assert.equal(model.rank(context).action,'keepForBomb');
 assert.equal(model.trainGame({id:'train-1',complete:true,decisions:[{context,chosenAction:'shake'}]}),0);
 const loaded=new SpecialDecisionRanker(model.export());
 assert.equal(loaded.examples,1);
 assert.equal(loaded.rank(context).action,'keepForBomb');
});
test('invalid or uncertain judgments do not train or increment examples',()=>{
 const m=new SpecialDecisionRanker();
 assert.equal(m.trainGame({id:'uncertain',complete:true,decisions:[{context:{kind:'shake',month:7,bombReady:true},chosenAction:null}]}),0);
 assert.equal(m.trainGame({id:'invalid',complete:true,decisions:[{context:{kind:'bomb',month:3,bombReady:true},chosenAction:'shake'}]}),0);
 assert.equal(m.examples,0);
 assert.throws(()=>new SpecialDecisionRanker({weights:[NaN]}),/Invalid/);
});
