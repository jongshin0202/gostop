'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const ranked=fs.readFileSync(path.join(root,'ranked-client.js'),'utf8');

test('ranked card input self-recovers from stale client action bookkeeping',()=>{
  const block=app.slice(app.indexOf('async function humanPlay'),app.indexOf('async function submitOnlineCardPlay'));
  assert.match(block,/if\(onlineActions\.size>0\)\{[\s\S]*pendingActionId[\s\S]*if\(pendingActionId\)return;[\s\S]*onlineActions\.clear\(\)/);
  assert.doesNotMatch(block,/if\(onlineActions\.size>0\)return;/);
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
