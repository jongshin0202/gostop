'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');

test('ranked hand follows authority but recovers when only projected eligibility is stale',()=>{
  const gate=app.slice(app.indexOf('function rankedHandTurnAvailable'),app.indexOf('function rankedHandInputEnabled'));
  assert.match(gate,/if\(!connected\|\|blocked\)return false/);
  assert.match(gate,/viewerCanInteract\?\.\(snapshot,\{connected:true,pendingActionId:null,blocked:false\}\)\)return true/);
  assert.match(gate,/if\(snapshot\?\.nextAction\)return false/);
  assert.match(gate,/state\.turn===PLAYER_A&&!state\.winner&&!state\.pendingTurn&&!state\.pendingDecision/);
  assert.match(gate,/state\.human\?\.hand\)&&state\.human\.hand\.length>0/);
  assert.match(app,/function rankedHandInputEnabled\(\)\{[\s\S]*if\(!rankedHandTurnAvailable\(\)\)return false;[\s\S]*return !session\?\.pendingActionId/);
  assert.match(app,/const handInputDisabled=onlineMode\?!rankedHandTurnAvailable\(\):\(presentation\.locked\|\|state\.turn!==PLAYER_A\)/);
  assert.match(app,/el\.disabled=handInputDisabled/);
});

test('ranked hand is blocked only by authoritative/session flow, never stale presentation motion state',()=>{
  const gate=app.slice(app.indexOf('function rankedHandTurnAvailable'),app.indexOf('function rankedHandInputEnabled'));
  assert.match(gate,/flow\?\.ended\|\|flow\?\.replayReady\?\.you\|\|flow\?\.newGameRequest\|\|flow\?\.opponentReconnectUntil\|\|els\.quitConfirmDialog\?\.open/);
  assert.doesNotMatch(gate,/presentation\.activePhysicalMotions/);
});

test('fifteen-second main-menu attract eligibility ignores stale gameplay dialogs but blocks account warnings',()=>{
  assert.match(ranked,/const ATTRACT_IDLE_MS=15000/);
  const idle=ranked.slice(ranked.indexOf('function mainMenuIdleEligible'),ranked.indexOf('let lastMenuActivityAt'));
  for(const blocker of ['!authDialog.open','!registrationPolicyDialog.open','!successDialog.open','!verificationDialog.open','!requestDialog.open','!friendRequestSentDialog.open','!playerInfoDialog.open','!settingsDialog.open','!accountNoticeDialog.open','!returnGameDialog.open'])assert.ok(idle.includes(blocker),blocker);
  assert.doesNotMatch(idle,/document\.querySelector\('dialog\[open\]'\)/);
});


test('ranked click bookkeeping is in lexical scope for humanPlay',()=>{
  const actions=app.indexOf('const onlineActions=new Map();');
  const human=app.indexOf('async function humanPlay(cardId, clickedEl)');
  const production=app.indexOf("}else{\n    preloadCardFaces();");
  assert.ok(actions>=0&&human>actions,'onlineActions must be declared before humanPlay');
  assert.ok(production>human,'humanPlay remains outside the production-only branch');
  assert.ok(actions<production,'onlineActions must not be production-branch scoped');
});

test('attract mode uses a persistent fifteen-second visibility-aware idle watcher',()=>{
  assert.match(ranked,/let lastMenuActivityAt=Date\.now\(\)/);
  assert.match(ranked,/function startAttractWatcher\(\)[\s\S]*setInterval\(\(\)=>\{[\s\S]*Date\.now\(\)-lastMenuActivityAt<ATTRACT_IDLE_MS[\s\S]*openLeaderboard\(true\)/);
  assert.match(ranked,/void openLeaderboard\(true\)/);
  assert.doesNotMatch(ranked,/clearInterval\(attractTimer\)/);
  assert.match(ranked,/lastMenuActivityAt=Date\.now\(\);startAttractWatcher\(\)/);
});