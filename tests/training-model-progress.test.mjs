import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {progress}=require('../dev-site/training-model-progress.js');

test('development countdown previews current game and does not mutate the server counter',()=>{
 const server={gamesSinceLiveUpdate:8,completedGames:53,consecutiveAgreementGames:0,
  disagreementObservedAfterUpdate:true,model:{examples:2},lastDevelopmentModelExamples:1};
 const preview=progress(server,{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(preview.gamesSinceActivation,9);
 assert.equal(preview.remaining10,1);
 assert.equal(preview.remainingClean,5);
 assert.equal(preview.earliest,1);
 assert.equal(preview.hasUnactivatedWeights,true);
 assert.equal(server.gamesSinceLiveUpdate,8);
});
test('five disagreement-free games after an earlier disagreement qualify early',()=>{
 const s={gamesSinceLiveUpdate:3,consecutiveAgreementGames:3,disagreementObservedAfterUpdate:true};
 const clean=progress(s,{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(clean.remainingClean,1);
 assert.equal(clean.remaining10,6);
 assert.equal(clean.eligible,false);
 const last=progress({...s,consecutiveAgreementGames:4},{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(last.remainingClean,0);
 assert.equal(last.eligible,true);
 const interrupted=progress({...s,consecutiveAgreementGames:4},{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(interrupted.remainingClean,5);
 assert.equal(interrupted.eligible,false);
});
test('clean-game shortcut is unavailable before a disagreement in the current activation window',()=>{
 const a=progress({gamesSinceLiveUpdate:5,consecutiveAgreementGames:5,
  disagreementObservedAfterUpdate:false},{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(a.remainingClean,null);
 assert.equal(a.remaining10,4);
 const b=progress({gamesSinceLiveUpdate:0},{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(b.remainingClean,5);
});
test('threshold alone does not claim new active weights without changed examples',()=>{
 const p=progress({gamesSinceLiveUpdate:9,model:{examples:3},
  lastDevelopmentModelExamples:3},{includeCurrentGame:true,hadDisagreement:false});
 assert.equal(p.eligible,true);
 assert.equal(p.remaining10,0);
 assert.equal(p.hasUnactivatedWeights,false);
 const changed=progress({gamesSinceLiveUpdate:9,goStopModel:{examples:2},
  lastDevelopmentGoStopModelExamples:1},{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(changed.hasUnactivatedWeights,true);
});
test('successful activation resets counters and preserves version and date',()=>{
 const at='2026-11-01T17:00:00.000Z';
 const p=progress({developmentModelVersion:4,lastDevelopmentModelUpdateAt:at,
  gamesSinceLiveUpdate:0,consecutiveAgreementGames:0,disagreementObservedAfterUpdate:false});
 assert.equal(p.developmentModelVersion,4);
 assert.equal(p.lastActivationAt,at);
 assert.equal(p.remaining10,10);
 assert.equal(p.remainingClean,null);
});
test('invalid and missing server fields do not invent weights',()=>{
 const a=progress({gamesSinceLiveUpdate:-9,consecutiveAgreementGames:NaN,model:{examples:NaN}});
 assert.equal(a.remaining10,10);
 assert.equal(a.remainingClean,null);
 assert.equal(a.hasUnactivatedWeights,false);
 assert.equal(a.lastActivationAt,null);
 assert.equal(a.developmentModelVersion,0);
});
