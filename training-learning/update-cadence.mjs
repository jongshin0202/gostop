// Pure release-cadence policy. A trigger is eligibility to validate and publish,
// not proof that production has received or activated a model.
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
export function recordCompletedTrainingGame(previous={},hadDisagreement=false){
  if(typeof hadDisagreement!=='boolean')throw new TypeError('Disagreement must be boolean');
  const gamesSinceLiveUpdate=count(previous.gamesSinceLiveUpdate)+1;
  const completedGames=count(previous.completedGames)+1;
  const consecutiveAgreementGames=hadDisagreement?0:count(previous.consecutiveAgreementGames)+1;
  const disagreementObservedAfterUpdate=Boolean(previous.disagreementObservedAfterUpdate)||hadDisagreement;
  // The original expert requirement is conjunctive: 10 consecutive clean
  // completed games AND a prior differing game at least 11 games earlier.
  // Legacy summaries without a recorded difference index fail closed on
  // the early gate. The 20-completed-game path remains unaffected.
  const lastDisagreementCompletedGame=hadDisagreement?completedGames:
    (Number.isSafeInteger(previous.lastDisagreementCompletedGame)&&previous.lastDisagreementCompletedGame>0
      ?previous.lastDisagreementCompletedGame:null);
  const discrepancyOldEnough=lastDisagreementCompletedGame!==null&&
    completedGames-lastDisagreementCompletedGame>=11;
  const eligibilityReason=gamesSinceLiveUpdate>=20?'20-completed-games':
    disagreementObservedAfterUpdate&&consecutiveAgreementGames>=10&&discrepancyOldEnough?
      '10-agreement-games-after-disagreement':null;
  return {...previous,completedGames,gamesSinceLiveUpdate,consecutiveAgreementGames,
    disagreementObservedAfterUpdate,lastDisagreementCompletedGame,eligibilityReason};
}
export function recordSuccessfulLiveUpdate(previous={},modelVersion){
  if(!Number.isSafeInteger(modelVersion)||modelVersion<1)throw new TypeError('Invalid model version');
  if(!previous.eligibilityReason)throw new Error('No validated update trigger');
  return {...previous,liveModelVersion:modelVersion,lastLiveUpdateAt:new Date().toISOString(),
    lastLiveUpdateAtGame:count(previous.completedGames),gamesSinceLiveUpdate:0,
    consecutiveAgreementGames:0,disagreementObservedAfterUpdate:false,lastDisagreementCompletedGame:null,eligibilityReason:null};
}

/**
 * Activate versioned weights on the ISOLATED DEVELOPMENT learning server only.
 * This is not production publishing and cannot change game source code.
 * Counters reset only after the Worker actually persists the active weights.
 */
export function recordSuccessfulDevelopmentModelUpdate(previous={},version){
  if(!Number.isSafeInteger(version)||version<1)throw new TypeError('Invalid development model version');
  if(!previous.eligibilityReason)throw new Error('No validated update trigger');
  return {...previous,developmentModelVersion:version,lastDevelopmentModelUpdateAt:new Date().toISOString(),
    lastDevelopmentModelUpdateAtGame:count(previous.completedGames),gamesSinceLiveUpdate:0,
    consecutiveAgreementGames:0,disagreementObservedAfterUpdate:false,lastDisagreementCompletedGame:null,eligibilityReason:null};
}
