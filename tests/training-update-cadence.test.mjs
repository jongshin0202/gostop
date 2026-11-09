import test from 'node:test';
import assert from 'node:assert/strict';
import {recordCompletedTrainingGame,recordSuccessfulLiveUpdate,
 recordSuccessfulDevelopmentModelUpdate} from '../training-learning/update-cadence.mjs';
const add=(state,disagreement=false)=>recordCompletedTrainingGame(state,disagreement);
test('20 completed games qualify without a disagreement',()=>{
 let s={};
 for(let n=1;n<20;n++){s=add(s);assert.equal(s.eligibilityReason,null);}
 s=add(s);
 assert.equal(s.completedGames,20);
 assert.equal(s.eligibilityReason,'20-completed-games');
});
test('10 clean games also require a differing game at least 11 games earlier',()=>{
 let s=add({},true);
 assert.equal(s.lastDisagreementCompletedGame,1);
 for(let n=1;n<=10;n++){s=add(s);assert.equal(s.eligibilityReason,null);}
 assert.equal(s.completedGames,11);
 assert.equal(s.consecutiveAgreementGames,10);
 s=add(s);
 assert.equal(s.completedGames,12);
 assert.equal(s.eligibilityReason,'10-agreement-games-after-disagreement');
});
test('a subsequent disagreement resets the full 10-clean-game streak',()=>{
 let s=add({},true);
 for(let n=0;n<8;n++)s=add(s);
 s=add(s,true);
 assert.equal(s.consecutiveAgreementGames,0);
 for(let n=0;n<9;n++){s=add(s);assert.equal(s.eligibilityReason,null);}
 s=add(s);
 assert.equal(s.eligibilityReason,'20-completed-games');
});
test('successful dev-only weight activation resets window, not lifetime count',()=>{
 let s=add({},true);
 for(let n=0;n<11;n++)s=add(s);
 s=recordSuccessfulDevelopmentModelUpdate(s,1);
 assert.equal(s.completedGames,12);
 assert.equal(s.lastDisagreementCompletedGame,null);
 assert.equal(s.gamesSinceLiveUpdate,0);
 assert.equal(s.disagreementObservedAfterUpdate,false);
 for(let n=0;n<19;n++){s=add(s);assert.equal(s.eligibilityReason,null);}
 s=add(s);
 assert.equal(s.eligibilityReason,'20-completed-games');
});
test('legacy state without a recorded discrepancy age never activates the early gate',()=>{
 let s={completedGames:9,gamesSinceLiveUpdate:9,consecutiveAgreementGames:9,
  disagreementObservedAfterUpdate:true};
 s=add(s);
 assert.equal(s.consecutiveAgreementGames,10);
 assert.equal(s.eligibilityReason,null);
 assert.equal(s.lastDisagreementCompletedGame,null);
});
test('invalid feedback and premature update fail closed',()=>{
 assert.throws(()=>add({},'not-boolean'),/boolean/);
 assert.throws(()=>recordSuccessfulLiveUpdate({},1),/No validated/);
 assert.throws(()=>recordSuccessfulDevelopmentModelUpdate({},1),/No validated/);
 assert.throws(()=>recordSuccessfulDevelopmentModelUpdate({eligibilityReason:'20-completed-games'},0),/Invalid/);
});
