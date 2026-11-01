import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {progress}=require('../dev-site/training-model-progress.js');

test('countdown includes current game without claiming current server counters already changed',()=>{
 const server={gamesSinceLiveUpdate:18,completedGames:53,consecutiveAgreementGames:0,
   disagreementObservedAfterUpdate:true,model:{examples:2},lastDevelopmentModelExamples:1};
 const preview=progress(server,{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(preview.gamesSinceActivation,19);
 assert.equal(preview.remaining20,1);
 assert.equal(preview.remainingClean,10);
 assert.equal(preview.earliest,1);
 assert.equal(preview.hasUnactivatedWeights,true);
 assert.equal(server.gamesSinceLiveUpdate,18,'never mutate authoritative server state');
});
test('clean streak progress follows 10-game release cadence without false promises',()=>{
 const s={gamesSinceLiveUpdate:5,consecutiveAgreementGames:8,
  disagreementObservedAfterUpdate:true};
 const clean=progress(s,{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(clean.remainingClean,1);
 assert.equal(clean.remaining20,14);
 assert.equal(clean.eligible,false);
 const last=progress({...s,consecutiveAgreementGames:9},{
  includeCurrentGame:true,hadDisagreement:false});
 assert.equal(last.remainingClean,0);
 assert.equal(last.eligible,true);
 const interrupted=progress({...s,consecutiveAgreementGames:9},{
  includeCurrentGame:true,hadDisagreement:true});
 assert.equal(interrupted.remainingClean,10);
 assert.equal(interrupted.eligible,false);
});
test('clean-game path does not exist before a disagreement after activation',()=>{
 const a=progress({gamesSinceLiveUpdate:8,consecutiveAgreementGames:8,
  disagreementObservedAfterUpdate:false},{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(a.remainingClean,null);
 assert.equal(a.remaining20,11);
 const b=progress({gamesSinceLiveUpdate:0},{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(b.remainingClean,10);
});
test('eligibility does not imply weights activated, confirmed weight changes still required',()=>{
 const p=progress({gamesSinceLiveUpdate:19,
  model:{examples:3},lastDevelopmentModelExamples:3},{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(p.eligible,true);
 assert.equal(p.remaining20,0);
 assert.equal(p.hasUnactivatedWeights,false);
 const changed=progress({gamesSinceLiveUpdate:19,goStopModel:{examples:2},
  lastDevelopmentGoStopModelExamples:1},{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(changed.hasUnactivatedWeights,true);
});
test('after successful activation counters restart and version and date survive',()=>{
 const at='2026-11-01T17:00:00.000Z';
 const p=progress({developmentModelVersion:4,lastDevelopmentModelUpdateAt:at,
  gamesSinceLiveUpdate:0,consecutiveAgreementGames:0,disagreementObservedAfterUpdate:false});
 assert.equal(p.developmentModelVersion,4);
 assert.equal(p.lastActivationAt,at);
 assert.equal(p.remaining20,20);
 assert.equal(p.remainingClean,null);
});
test('invalid or missing fields do not invent activation or a last trained model',()=>{
 const a=progress({gamesSinceLiveUpdate:-9,consecutiveAgreementGames:NaN,model:{examples:NaN}});
 assert.equal(a.remaining20,20);
 assert.equal(a.remainingClean,null);
 assert.equal(a.hasUnactivatedWeights,false);
 assert.equal(a.lastActivationAt,null);
 assert.equal(a.developmentModelVersion,0);
});
