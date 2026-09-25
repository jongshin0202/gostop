'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const ranked=fs.readFileSync(path.join(root,'ranked-client.js'),'utf8');

test('ranked card input self-recovers from stale client action bookkeeping',()=>{
  const humanStart=app.indexOf('async function humanPlay'),block=app.slice(humanStart,app.indexOf('async function aiTurn',humanStart));
  assert.match(block,/if\(onlineActions\.size>0\)\{[\s\S]*pendingActionId[\s\S]*if\(pendingActionId\)return;[\s\S]*onlineActions\.clear\(\)/);
  assert.doesNotMatch(block,/if\(onlineActions\.size>0\)return;/);
});

test('disconnect cleanup cannot leave ranked hand permanently blocked',()=>{
  assert.match(app,/addEventListener\('disconnected',[\s\S]*onlineActions\.clear\(\)[\s\S]*onlinePendingCardId=null[\s\S]*pending-card/);
});

test('attract-mode click capture is active only while attract leaderboard is visible',()=>{
  assert.match(ranked,/if\(!attractMode\|\|leaderboardScreen\.hidden\|\|globalThis\.goStopOnlineSession\)return;/);
});


test('ranked playCard submission helper is in the same lexical scope as humanPlay',()=>{
  const submit=app.indexOf('async function submitOnlineCardPlay()');
  const human=app.indexOf('async function humanPlay(cardId, clickedEl)');
  const production=app.indexOf("}else{\n    preloadCardFaces();");
  assert.ok(submit>=0&&submit<human,'submitOnlineCardPlay must be declared before humanPlay');
  assert.ok(production>human,'humanPlay and submitOnlineCardPlay must both remain outside the production-only block');
});
