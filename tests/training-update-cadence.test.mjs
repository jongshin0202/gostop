import test from 'node:test';
import assert from 'node:assert/strict';
import {recordCompletedTrainingGame,recordSuccessfulLiveUpdate} from '../training-learning/update-cadence.mjs';
const add=(state,disagreement=false)=>recordCompletedTrainingGame(state,disagreement);
test('twenty completed games qualifies even with no disagreement',()=>{
 let state={};for(let n=1;n<=19;n++){state=add(state);assert.equal(state.eligibilityReason,null);}
 state=add(state);assert.equal(state.eligibilityReason,'20-completed-games');
 assert.equal(state.completedGames,20);
});
test('ten consecutive no-disagreement games requires an earlier disagreement',()=>{
 let state=add({},true);
 for(let n=1;n<=9;n++){state=add(state,false);assert.equal(state.eligibilityReason,null);}
 state=add(state,false);
 assert.equal(state.consecutiveAgreementGames,10);
 assert.equal(state.eligibilityReason,'10-agreement-games-after-disagreement');
 assert.equal(state.completedGames,11);
});
test('a later disagreement resets agreement streak and delays early trigger',()=>{
 let state=add({},true);
 for(let i=0;i<8;i++)state=add(state,false);
 state=add(state,true);assert.equal(state.consecutiveAgreementGames,0);
 for(let i=0;i<9;i++){state=add(state,false);assert.equal(state.eligibilityReason,null);}
 state=add(state,false);
 assert.equal(state.completedGames,20);
 assert.equal(state.eligibilityReason,'20-completed-games');
});
test('a successful update resets its window while preserving lifetime totals',()=>{
 let state=add({},true);for(let i=0;i<10;i++)state=add(state,false);
 state=recordSuccessfulLiveUpdate(state,1);
 assert.equal(state.completedGames,11);
 assert.equal(state.gamesSinceLiveUpdate,0);
 assert.equal(state.disagreementObservedAfterUpdate,false);
 assert.equal(state.eligibilityReason,null);
 for(let i=0;i<10;i++)state=add(state,false);
 assert.equal(state.eligibilityReason,null);
});
test('bad state and invalid publication versions fail closed',()=>{
 assert.throws(()=>add({},'no'),/boolean/);
 assert.throws(()=>recordSuccessfulLiveUpdate({},1),/No validated/);
 assert.throws(()=>recordSuccessfulLiveUpdate({eligibilityReason:'20-completed-games'},0),/Invalid model/);
});
