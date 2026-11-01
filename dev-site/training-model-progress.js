/* Isolated development Training activation progress.
 * Uses authoritative server counters; never changes training state or stores
 * learning information on the device. The 20-game and clean-streak gates
 * reproduce training-learning/update-cadence.mjs exactly.
 */
(function(root){
'use strict';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
function progress(state={}, {includeCurrentGame=false,hadDisagreement=false}={}){
 let since=count(state.gamesSinceLiveUpdate);
 let consecutive=count(state.consecutiveAgreementGames);
 let observed=state.disagreementObservedAfterUpdate===true;
 if(includeCurrentGame){
  since++;
  consecutive=hadDisagreement?0:consecutive+1;
  observed=observed||hadDisagreement;
 }
 const remaining20=Math.max(0,20-since);
 const remainingClean=observed?Math.max(0,10-consecutive):null;
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
