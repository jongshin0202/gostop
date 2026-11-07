import test from 'node:test';
import assert from 'node:assert/strict';
import {recordCompletedTrainingGame,recordSuccessfulLiveUpdate} from '../training-learning/update-cadence.mjs';
const add=(state,disagreement=false)=>recordCompletedTrainingGame(state,disagreement);

test('ten completed games qualifies even without any disagreement',()=>{
 let state={};
 for(let n=1;n<=9;n++){state=add(state);assert.equal(state.eligibilityReason,null);}
 state=add(state);
 assert.equal(state.eligibilityReason,'10-completed-games');
 assert.equal(state.completedGames,10);
});

test('five consecutive clean games require an earlier disagreement after activation',()=>{
 let state=add({},true);
 for(let n=1;n<=4;n++){state=add(state,false);assert.equal(state.eligibilityReason,null);}
 state=add(state,false);
 assert.equal(state.consecutiveAgreementGames,5);
 assert.equal(state.eligibilityReason,'5-agreement-games-after-disagreement');
 assert.equal(state.completedGames,6);
});

test('a subsequent disagreement restarts the five-clean-game early gate',()=>{
 let state=add({},true);
 for(let i=0;i<3;i++)state=add(state,false);
 state=add(state,true);
 assert.equal(state.consecutiveAgreementGames,0);
 for(let i=0;i<4;i++){state=add(state,false);assert.equal(state.eligibilityReason,null);}
 state=add(state,false);
 assert.equal(state.completedGames,10);
 assert.equal(state.eligibilityReason,'10-completed-games');
});

test('successful development weight update resets cadence window, not lifetime games',()=>{
 let state=add({},true);
 for(let i=0;i<5;i++)state=add(state,false);
 state=recordSuccessfulLiveUpdate(state,1);
 assert.equal(state.completedGames,6);
 assert.equal(state.gamesSinceLiveUpdate,0);
 assert.equal(state.disagreementObservedAfterUpdate,false);
 assert.equal(state.eligibilityReason,null);
 for(let i=0;i<9;i++)state=add(state,false);
 assert.equal(state.eligibilityReason,null);
 state=add(state,false);
 assert.equal(state.eligibilityReason,'10-completed-games');
});

test('missing feedback and invalid model publication fail closed',()=>{
 assert.throws(()=>add({},'no'),/boolean/);
 assert.throws(()=>recordSuccessfulLiveUpdate({},1),/No validated/);
 assert.throws(()=>recordSuccessfulLiveUpdate({eligibilityReason:'10-completed-games'},0),/Invalid model/);
});
