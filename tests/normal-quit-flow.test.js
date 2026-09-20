import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('finished-game dialog always offers Play Again and Quit Game',()=>{
  assert.match(html,/id="playAgainBtn"[^>]*data-i18n="playAgain"/);
  assert.match(html,/id="resultQuitBtn"[^>]*data-i18n="resultQuit"(?![^>]*hidden)/);
  assert.match(app,/if\(els\.resultQuitBtn\)els\.resultQuitBtn\.hidden=false/);
});

test('finished-game Quit Game requires confirmation and No returns to Play Again result dialog',()=>{
  const start=app.indexOf("els.resultQuitBtn.addEventListener");
  const end=app.indexOf("els.cancelNewGameBtn.addEventListener",start);
  const flow=app.slice(start,end);
  assert.match(flow,/onlineQuitFromResult=true/);
  assert.match(flow,/quitConfirmTitle\.textContent=t\('resultQuitConfirm'\)/);
  assert.match(flow,/quitConfirmDialog\.showModal\(\)/);
  assert.match(flow,/quitNoBtn\.addEventListener[^]*if\(onlineQuitFromResult&&!els\.resultDialog\.open\)els\.resultDialog\.showModal\(\)/);
  assert.match(flow,/quitYesBtn\.addEventListener[^]*onlineSubmit\(\{type:'quitGame'\}\)/);
  assert.match(flow,/else\{els\.quitConfirmDialog\.close\(\);onlineQuitFromResult=false;cancelLocalGamePresentation\(\);setTrainingMode\(false\);els\.soloStartOverlay\.hidden=false;\}/);
});

test('normal in-game Quit Game continues to use quitGame session flow rather than abandonment',()=>{
  assert.match(app,/optionsQuitBtn\.addEventListener/);
  assert.match(app,/quitYesBtn\.addEventListener[^]*onlineSubmit\(\{type:'quitGame'\}\)/);
});


test('local quit cancels stale First Poop and delayed AI presentation work',()=>{
  assert.match(app,/let localGameGeneration=0,localGameActive=false/);
  const cancel=app.slice(app.indexOf('function cancelLocalGamePresentation'),app.indexOf('async function launchLocalGame'));
  assert.match(cancel,/localGameActive=false;localGameGeneration\+\+/);
  assert.match(cancel,/invalidateGameplayPresentation\(\)/);
  const invalidate=app.slice(app.indexOf('function invalidateGameplayPresentation'),app.indexOf('function showGameplayModal'));
  assert.match(invalidate,/gameplayPresentationActive=false;gameplayPresentationEpoch\+\+/);
  assert.match(invalidate,/closeAllGameplayPresentationUi\(\)/);
  const poop=app.slice(app.indexOf('async function resolveExtractedSpecialTurn'),app.indexOf('async function playFullTurn'));
  assert.match(poop,/const localGeneration=localGameGeneration/);
  assert.match(poop,/await showSpecialTransient\('POOPED!'/);
  assert.match(poop,/isLocalGamePresentationCurrent\(localGeneration\)\|\|!isGameplayPresentationCurrent\(epoch\)/);
  assert.match(poop,/showFirstPoopNotice\(side,localGeneration,epoch\)/);
  const notice=app.slice(app.indexOf('function showFirstPoopNotice'),app.indexOf('function setLocale'));
  assert.match(notice,/!isLocalGamePresentationCurrent\(generation\)\|\|!isGameplayPresentationCurrent\(epoch\)/);
  const schedule=app.slice(app.indexOf('function scheduleTurnStart'),app.indexOf('function bestAiBombMonth'));
  assert.match(schedule,/if\(onlineMode\|\|!localGameActive\)return/);
  assert.match(schedule,/setTimeout\(\(\)=>\{if\(isLocalGamePresentationCurrent\(generation\)\)aiTurn\(\);\},820\)/);
});


test('Free Play With Friend quit bypasses presentation queue and ends both views immediately',()=>{
  const onlineState=app.slice(app.indexOf('let activeOnlineStatus=onlineStatus'),app.indexOf('onlineSubmit=function'));
  assert.match(onlineState,/onlinePresentationEpoch=0/);
  const clear=app.slice(app.indexOf('function clearOnlineGameplayPresentation'),app.indexOf('function onlineFlowBlocks'));
  assert.match(clear,/invalidateGameplayPresentation\(\)/);
  const invalidate=app.slice(app.indexOf('function invalidateGameplayPresentation'),app.indexOf('function showGameplayModal'));
  assert.match(invalidate,/resetHandPresentationState\(\)/);
  assert.match(invalidate,/closeAllGameplayPresentationUi\(\)/);
  const snapshot=app.slice(app.indexOf("adapter.addEventListener('snapshot'"),app.indexOf("adapter.addEventListener('actionAccepted'"));
  assert.match(snapshot,/snapshot\?\.sessionFlow\?\.ended/);
  assert.match(snapshot,/onlinePresentationEpoch\+\+/);
  assert.match(snapshot,/onlinePresentationQueue=Promise\.resolve\(\)/);
  assert.match(snapshot,/clearOnlineGameplayPresentation\(\);reconcileOnlineFlow\(event\.detail\.snapshot\);globalThis\.dispatchEvent\(new CustomEvent\('gostop-online-snapshot'/);
  const reconcile=app.slice(app.indexOf('function reconcileOnlineFlow'),app.indexOf('function returnOnlineToMenu'));
  assert.match(reconcile,/flow\.ended/);
  assert.match(reconcile,/flow\.disconnectCancelled\|\|flow\.endedByYou\)returnOnlineToMenu\(\)/);
  assert.match(reconcile,/setDialog\(els\.opponentEndedDialog,true\)/);
  const transition=app.slice(app.indexOf('async function presentOnlineTransition'),app.indexOf('async function submitOnlineCardPlay'));
  assert.match(transition,/epoch=onlinePresentationEpoch/);
  assert.match(transition,/isOnlinePresentationCurrent\(epoch\)/);
});


test('game exit invalidates gameplay presentation without closing ranked flow dialogs owned by ranked-client',()=>{
  assert.match(app,/let gameplayPresentationEpoch=0,gameplayPresentationActive=false/);
  const close=app.slice(app.indexOf('function closeAllGameplayPresentationUi'),app.indexOf('function invalidateGameplayPresentation'));
  assert.match(close,/dialog\[open\]:not\(\.ranked-flow-dialog\):not\(\.gostop-account-dialog\):not\(\.gostop-request-dialog\)/);
  const invalidate=app.slice(app.indexOf('function invalidateGameplayPresentation'),app.indexOf('function showGameplayModal'));
  assert.match(invalidate,/gameplayPresentationActive=false;gameplayPresentationEpoch\+\+/);
  assert.match(invalidate,/closeAllGameplayPresentationUi\(\)/);
  const localCancel=app.slice(app.indexOf('function cancelLocalGamePresentation'),app.indexOf('async function launchLocalGame'));
  assert.match(localCancel,/invalidateGameplayPresentation\(\)/);
  const onlineClear=app.slice(app.indexOf('function clearOnlineGameplayPresentation'),app.indexOf('function onlineFlowBlocks'));
  assert.match(onlineClear,/invalidateGameplayPresentation\(\)/);
});

test('all delayed gameplay dialogs use the central presentation gate',()=>{
  const presenters=[
    ['Gukjin','function openGukjinChoice','function showActionCue'],
    ['Bomb/Shake','async function chooseBomb','function showShakeChoice'],
    ['Shake reveal','async function presentShakeDeclaration','function openShakeReview'],
    ['Go Stop','async function presentOnlineGoStopDecision','function bestAiCard'],
    ['Results','async function humanGoStop','function finishByScore'],
    ['First Poop','function showFirstPoopNotice','function setLocale']
  ];
  for(const [name,start,end] of presenters){
    const block=app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
    assert.match(block,/showGameplay(?:Modal|Dialog)\(/,name);
    assert.doesNotMatch(block,/\.showModal\(\)|\.show\(\)/,name);
  }
  const normal=app.slice(app.indexOf('async function presentNormalResolution'),app.indexOf('async function presentPiTransferEvents'));
  assert.match(normal,/isGameplayPresentationCurrent\(epoch\)/);
  assert.match(normal,/promptGukjinChoice\(side,result\.events,epoch\)/);
  const turn=app.slice(app.indexOf('async function playFullTurn'),app.indexOf('async function executeDeckOnlyTurn'));
  assert.match(turn,/epoch=gameplayPresentationEpoch/);
  assert.match(turn,/isGameplayPresentationCurrent\(epoch\)/);
});
