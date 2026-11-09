/* Isolated development Training activation progress.
 * Uses authoritative server counters; never changes training state or stores
 * learning information on the device. The 20-game and ten-clean-game gates
 * reproduce training-learning/update-cadence.mjs exactly.
 */
(function(root){
'use strict';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
function progress(state={}, {includeCurrentGame=false,hadDisagreement=false}={}){
 let since=count(state.gamesSinceLiveUpdate);
 let completed=count(state.completedGames);
 let consecutive=count(state.consecutiveAgreementGames);
 let observed=state.disagreementObservedAfterUpdate===true;
 let lastDifference=Number.isSafeInteger(state.lastDisagreementCompletedGame)&&
  state.lastDisagreementCompletedGame>0?state.lastDisagreementCompletedGame:null;
 if(includeCurrentGame){
  since++;completed++;
  consecutive=hadDisagreement?0:consecutive+1;
  observed=observed||hadDisagreement;
  if(hadDisagreement)lastDifference=completed;
 }
 const remaining20=Math.max(0,20-since);
 // Both conditions must hold: 10 clean games AND the latest recorded
 // differing game at least 11 completed games earlier. Unknown historical
 // discrepancy positions never invent a valid early-activation date.
 const remainingClean=observed&&lastDifference!==null?
  Math.max(0,10-consecutive,11-(completed-lastDifference)):null;
 const earliest=remainingClean===null?remaining20:Math.min(remaining20,remainingClean);
 const eligible=remaining20===0||remainingClean===0;
 const currentModels=[
  [state.model?.examples,state.lastDevelopmentModelExamples],
  [state.specialModel?.examples,state.lastDevelopmentSpecialModelExamples],
  [state.openingModel?.examples,state.lastDevelopmentOpeningModelExamples],
  [state.goStopModel?.examples,state.lastDevelopmentGoStopModelExamples]
 ];
 const hasUnactivatedWeights=currentModels.some(([n,last])=>count(n)>count(last));
 return Object.freeze({remaining20,remainingClean,earliest,eligible,
  observedDisagreement:observed,consecutiveAgreementGames:consecutive,
  gamesSinceActivation:since,hasUnactivatedWeights,
  developmentModelVersion:count(state.developmentModelVersion),
  lastActivationAt:state.lastDevelopmentModelUpdateAt||null});
}
const api=Object.freeze({progress});
root.GoStopDevTrainingWeightProgress=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
