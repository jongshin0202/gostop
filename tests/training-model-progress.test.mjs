'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {progress:check}=require('../dev-site/training-model-progress.js');
test('preview counts a game but does not change the server snapshot',()=>{
 const snapshot={gamesSinceLiveUpdate:18,consecutiveAgreementGames:0,disagreementObservedAfterUpdate:true,
  model:{examples:2},lastDevelopmentModelExamples:1};
 const p=check(snapshot,{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(p.gamesSinceActivation,19);assert.equal(p.remaining20,1);
 assert.equal(p.remainingClean,10);assert.equal(p.earliest,1);
 assert.equal(p.hasUnactivatedWeights,true);
 assert.equal(snapshot.gamesSinceLiveUpdate,18);
});
test('10 clean games after disagreement trigger only at tenth',()=>{
 const s={gamesSinceLiveUpdate:9,consecutiveAgreementGames:8,disagreementObservedAfterUpdate:true};
 const ninth=check(s,{includeCurrentGame:true});
 assert.equal(ninth.remainingClean,1);
 assert.equal(ninth.eligible,false);
 const tenth=check({...s,consecutiveAgreementGames:9},{includeCurrentGame:true});
 assert.equal(tenth.remainingClean,0);
 assert.equal(tenth.eligible,true);
 const interrupted=check({...s,consecutiveAgreementGames:9},{includeCurrentGame:true,hadDisagreement:true});
 assert.equal(interrupted.remainingClean,10);
 assert.equal(interrupted.eligible,false);
});
test('clean gate unavailable before a disagreement; count still advances',()=>{
 const p=check({gamesSinceLiveUpdate:6,consecutiveAgreementGames:6,
  disagreementObservedAfterUpdate:false},{includeCurrentGame:true});
 assert.equal(p.remainingClean,null);
 assert.equal(p.remaining20,13);
 const disputed=check({}, {includeCurrentGame:true,hadDisagreement:true});
 assert.equal(disputed.remainingClean,10);
});
test('threshold does not activate weights unless new confirmed examples exist',()=>{
 const p=check({gamesSinceLiveUpdate:19,model:{examples:3},lastDevelopmentModelExamples:3},
  {includeCurrentGame:true});
 assert.equal(p.eligible,true);assert.equal(p.remaining20,0);
 assert.equal(p.hasUnactivatedWeights,false);
 const changed=check({gamesSinceLiveUpdate:19,goStopModel:{examples:2},
  lastDevelopmentGoStopModelExamples:1},{includeCurrentGame:true});
 assert.equal(changed.hasUnactivatedWeights,true);
});
test('new activation preserves version and resets counters',()=>{
 const at='2026-11-01T17:00:00.000Z';
 const p=check({developmentModelVersion:4,lastDevelopmentModelUpdateAt:at,
  gamesSinceLiveUpdate:0,consecutiveAgreementGames:0,disagreementObservedAfterUpdate:false});
 assert.equal(p.developmentModelVersion,4);assert.equal(p.lastActivationAt,at);
 assert.equal(p.remaining20,20);assert.equal(p.remainingClean,null);
});
test('unusable server data never invents trained weights or activation',()=>{
 const a=check({gamesSinceLiveUpdate:-9,consecutiveAgreementGames:NaN,model:{examples:NaN}});
 assert.equal(a.remaining20,20);assert.equal(a.remainingClean,null);
 assert.equal(a.hasUnactivatedWeights,false);assert.equal(a.lastActivationAt,null);
 assert.equal(a.developmentModelVersion,0);
});
