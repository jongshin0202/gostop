// Pure release-cadence policy. A trigger is eligibility to validate and publish,
// not proof that production has received or activated a model.
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
export function recordCompletedTrainingGame(previous={},hadDisagreement=false){
  if(typeof hadDisagreement!=='boolean')throw new TypeError('Disagreement must be boolean');
  const gamesSinceLiveUpdate=count(previous.gamesSinceLiveUpdate)+1;
  const completedGames=count(previous.completedGames)+1;
  const consecutiveAgreementGames=hadDisagreement?0:count(previous.consecutiveAgreementGames)+1;
  const disagreementObservedAfterUpdate=Boolean(previous.disagreementObservedAfterUpdate)||hadDisagreement;
  const eligibilityReason=gamesSinceLiveUpdate>=20?'20-completed-games':
    disagreementObservedAfterUpdate&&consecutiveAgreementGames>=10?
      '10-agreement-games-after-disagreement':null;
  return {...previous,completedGames,gamesSinceLiveUpdate,consecutiveAgreementGames,
    disagreementObservedAfterUpdate,eligibilityReason};
}
export function recordSuccessfulLiveUpdate(previous={},modelVersion){
  if(!Number.isSafeInteger(modelVersion)||modelVersion<1)throw new TypeError('Invalid model version');
  if(!previous.eligibilityReason)throw new Error('No validated update trigger');
  return {...previous,liveModelVersion:modelVersion,lastLiveUpdateAt:new Date().toISOString(),
    lastLiveUpdateAtGame:count(previous.completedGames),gamesSinceLiveUpdate:0,
    consecutiveAgreementGames:0,disagreementObservedAfterUpdate:false,eligibilityReason:null};
}
