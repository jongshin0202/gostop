import test from 'node:test';
import assert from 'node:assert/strict';
import {OpeningStrategyRanker,STRATEGIES,validEvidence,validChoices,EVIDENCE_LENGTH} from '../training-learning/opening-learner.mjs';
const evidence=[1,.2,.1,.3,0,.2,0,0,.6,.2,0,0];
test('eight opening strategy categories support independent multi-selection',()=>{
 assert.equal(STRATEGIES.length,8);assert.equal(EVIDENCE_LENGTH,12);
 assert.ok(STRATEGIES.includes('brights')&&STRATEGIES.includes('singles'));
 assert.ok(validEvidence(evidence));
 assert.equal(validEvidence([Infinity,...evidence.slice(1)]),false);
 assert.ok(validChoices(['brights','singles']));
 assert.equal(validChoices(['brights','brights']),false);
});
test('only confirmed selections from completed games train opening weights once',()=>{
 const learner=new OpeningStrategyRanker();
 assert.throws(()=>learner.trainGame({id:'in-progress',complete:false,openings:[]}),/completed/);
 assert.equal(learner.trainGame({id:'game-1',complete:true,openings:[
  {choice:'confirmed',selected:['brights','singles'],evidence}]}),1);
 const p=learner.predict(evidence);
 assert.ok(p.find(x=>x.strategy==='brights').probability>.5);
 assert.ok(p.find(x=>x.strategy==='singles').probability>.5);
 assert.ok(p.find(x=>x.strategy==='godori').probability<.5);
 assert.equal(learner.trainGame({id:'game-1',complete:true,openings:[
  {choice:'confirmed',selected:['godori'],evidence}]}),0);
 assert.equal(learner.examples,1);
 const restored=new OpeningStrategyRanker(learner.export());
 assert.equal(restored.examples,1);
 assert.deepEqual(restored.export().weights,learner.export().weights);
});
test('uncertain and malformed opening labels never train',()=>{
 const m=new OpeningStrategyRanker();
 assert.equal(m.trainGame({id:'uncertain',complete:true,openings:[
  {choice:'unsure',selected:[],evidence}]}),0);
 assert.equal(m.trainGame({id:'malformed',complete:true,openings:[
  {choice:'confirmed',selected:['invalid'],evidence}]}),0);
 assert.equal(m.examples,0);
 assert.throws(()=>new OpeningStrategyRanker({weights:[[NaN]]}),/Invalid/);
});
