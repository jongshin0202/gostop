'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const ranked=fs.readFileSync(path.join(root,'ranked-client.js'),'utf8');

test('ranked card input self-recovers from stale client action bookkeeping',()=>{
  const block=app.slice(app.indexOf('async function humanPlay'),app.indexOf('async function submitOnlineCardPlay'));
  assert.match(block,/if\(onlineActions\.size>0\)\{[\s\S]*pendingActionId[\s\S]*if\(pendingActionId\)return;[\s\S]*onlineActions\.clear\(\)/);
  assert.doesNotMatch(block,/if\(onlineActions\.size>0\)return;/);
});

test('a delayed authority projection cannot disable the already playable presented hand',()=>{
  const source=app.slice(app.indexOf('function rankedHandTurnAvailable()'),app.indexOf('function rankedHandInputEnabled()'));
  const context={
    onlineMode:true,repairOrphanedRankedPendingAction(){},
    latestOnlineSnapshot:{seatId:'playerA',state:{turn:'playerB',pendingTurn:{}},nextAction:{type:'resolveSpecialTurn'}},
    state:{openingSpecialsComplete:true,turn:'playerA',winner:null,pendingTurn:null,pendingDecision:null,human:{hand:[{id:'m1-1'}]}},
    PLAYER_A:'playerA',els:{quitConfirmDialog:{open:false}},
    goStopOnlineSession:{socket:{readyState:1}},WebSocket:{OPEN:1},
    GoStopOnline:{viewerCanInteract(){return false;}}
  };
  assert.equal(vm.runInNewContext(`${source};rankedHandTurnAvailable()`,context),true);
});

test('disconnect cleanup cannot leave ranked hand permanently blocked',()=>{
  assert.match(app,/addEventListener\('disconnected',[\s\S]*onlineActions\.clear\(\)[\s\S]*onlinePendingCardId=null[\s\S]*pending-card/);
});

test('attract-mode click capture is active only while attract leaderboard is visible',()=>{
  assert.match(ranked,/if\(!attractMode\|\|leaderboardScreen\.hidden\|\|globalThis\.goStopOnlineSession\)return;/);
});


test('ranked input repairs orphaned and timed-out action locks instead of freezing the hand',()=>{
  assert.match(app,/const RANKED_ACTION_LOCK_TIMEOUT_MS=3500/);
  assert.match(app,/function clearRankedActionLock\(actionId=null\)[\s\S]*?session\.pendingActionId=null/);
  assert.match(app,/function repairOrphanedRankedPendingAction\(\)[\s\S]*?if\(!onlineActions\.has\(pendingActionId\)\)\{clearRankedActionLock\(pendingActionId\);return true;\}/);
  assert.match(app,/Date\.now\(\)-submittedAt>=RANKED_ACTION_LOCK_TIMEOUT_MS[\s\S]*?clearRankedActionLock\(pendingActionId\)[\s\S]*?session\.sync\?\.\(\)/);
  assert.match(app,/async function humanPlay\(cardId, clickedEl\)\{[\s\S]*?if\(onlineMode\)\{\s*repairOrphanedRankedPendingAction\(\)/);
  assert.match(app,/addEventListener\('disconnected',[\s\S]*?onlineActions\.clear\(\);onlineActionSubmittedAt\.clear\(\);adapter\.pendingActionId=null;onlinePendingCardId=null/);
});
