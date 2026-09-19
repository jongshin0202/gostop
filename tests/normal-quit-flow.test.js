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
  assert.match(cancel,/els\.firstPpeokDialog/);
  assert.match(cancel,/milestoneOverlay\.classList\.remove\('show'\)/);
  const poop=app.slice(app.indexOf('async function resolveExtractedSpecialTurn'),app.indexOf('async function playFullTurn'));
  assert.match(poop,/const localGeneration=localGameGeneration/);
  assert.match(poop,/await showSpecialTransient\('POOPED!'/);
  assert.match(poop,/if\(!isLocalGamePresentationCurrent\(localGeneration\)\)return;/);
  assert.match(poop,/showFirstPoopNotice\(side,localGeneration\)/);
  const notice=app.slice(app.indexOf('function showFirstPoopNotice'),app.indexOf('function setLocale'));
  assert.match(notice,/!isLocalGamePresentationCurrent\(generation\)/);
  const schedule=app.slice(app.indexOf('function scheduleTurnStart'),app.indexOf('function bestAiBombMonth'));
  assert.match(schedule,/if\(onlineMode\|\|!localGameActive\)return/);
  assert.match(schedule,/setTimeout\(\(\)=>\{if\(isLocalGamePresentationCurrent\(generation\)\)aiTurn\(\);\},820\)/);
});


test('Free Play With Friend quit bypasses presentation queue and ends both views immediately',()=>{
  const onlineState=app.slice(app.indexOf('let activeOnlineStatus=onlineStatus'),app.indexOf('onlineSubmit=function'));
  assert.match(onlineState,/onlinePresentationEpoch=0/);
  const clear=app.slice(app.indexOf('function clearOnlineGameplayPresentation'),app.indexOf('function onlineFlowBlocks'));
  assert.match(clear,/resetHandPresentationState\(\)/);
  assert.match(clear,/els\.firstPpeokDialog/);
  assert.match(clear,/milestoneOverlay\.classList\.remove\('show'\)/);
  const snapshot=app.slice(app.indexOf("adapter.addEventListener('snapshot'"),app.indexOf("adapter.addEventListener('actionAccepted'"));
  assert.match(snapshot,/snapshot\?\.sessionFlow\?\.ended/);
  assert.match(snapshot,/onlinePresentationEpoch\+\+/);
  assert.match(snapshot,/onlinePresentationQueue=Promise\.resolve\(\)/);
  assert.match(snapshot,/clearOnlineGameplayPresentation\(\);reconcileOnlineFlow\(event\.detail\.snapshot\);return/);
  const reconcile=app.slice(app.indexOf('function reconcileOnlineFlow'),app.indexOf('function returnOnlineToMenu'));
  assert.match(reconcile,/flow\.ended/);
  assert.match(reconcile,/flow\.disconnectCancelled\|\|flow\.endedByYou\)returnOnlineToMenu\(\)/);
  assert.match(reconcile,/setDialog\(els\.opponentEndedDialog,true\)/);
  const transition=app.slice(app.indexOf('async function presentOnlineTransition'),app.indexOf('async function submitOnlineCardPlay'));
  assert.match(transition,/epoch=onlinePresentationEpoch/);
  assert.match(transition,/isOnlinePresentationCurrent\(epoch\)/);
});
