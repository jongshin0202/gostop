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
