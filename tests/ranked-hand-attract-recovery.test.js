'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');

test('ranked hand button enablement follows authoritative viewer permission instead of stale presentation lock',()=>{
  assert.match(app,/function rankedHandInputEnabled\(\)\{[\s\S]*viewerCanInteract\?\.\(snapshot,\{connected,pendingActionId:session\?\.pendingActionId,blocked\}\)/);
  assert.match(app,/const handInputDisabled=onlineMode\?!rankedHandInputEnabled\(\):\(presentation\.locked\|\|state\.turn!==PLAYER_A\)/);
  assert.match(app,/el\.disabled=handInputDisabled/);
  assert.match(app,/blank\.disabled=handInputDisabled/);
});

test('ranked hand remains blocked during active physical motion and session-flow blockers',()=>{
  assert.match(app,/flow\?\.ended\|\|flow\?\.replayReady\?\.you\|\|flow\?\.newGameRequest\|\|flow\?\.opponentReconnectUntil\|\|els\.quitConfirmDialog\?\.open\|\|presentation\.activePhysicalMotions>0/);
});

test('ten-second main-menu attract eligibility ignores stale gameplay dialogs but blocks account warnings',()=>{
  assert.match(ranked,/const ATTRACT_IDLE_MS=10000/);
  assert.match(ranked,/function mainMenuIdleEligible\(\)\{return !overlay\.hidden&&leaderboardScreen\.hidden&&onlinePanel\.hidden&&!authDialog\.open&&!registrationPolicyDialog\.open&&!successDialog\.open&&!requestDialog\.open&&!accountNoticeDialog\.open;\}/);
  assert.doesNotMatch(ranked,/mainMenuIdleEligible\(\)[^\n]*document\.querySelector\('dialog\[open\]'\)/);
});


test('ranked click bookkeeping is in lexical scope for humanPlay',()=>{
  const actions=app.indexOf('const onlineActions=new Map();');
  const human=app.indexOf('async function humanPlay(cardId, clickedEl)');
  const production=app.indexOf("}else{\n    preloadCardFaces();");
  assert.ok(actions>=0&&human>actions,'onlineActions must be declared before humanPlay');
  assert.ok(production>human,'humanPlay remains outside the production-only branch');
  assert.ok(actions<production,'onlineActions must not be production-branch scoped');
});

test('attract mode uses a persistent ten-second visibility-aware idle watcher',()=>{
  assert.match(ranked,/let lastMenuActivityAt=Date\.now\(\)/);
  assert.match(ranked,/function startAttractWatcher\(\)[\s\S]*setInterval\(\(\)=>\{[\s\S]*Date\.now\(\)-lastMenuActivityAt<ATTRACT_IDLE_MS[\s\S]*openLeaderboard\(true\)/);
  assert.match(ranked,/void openLeaderboard\(true\)/);
  assert.doesNotMatch(ranked,/clearInterval\(attractTimer\)/);
  assert.match(ranked,/lastMenuActivityAt=Date\.now\(\);startAttractWatcher\(\)/);
});