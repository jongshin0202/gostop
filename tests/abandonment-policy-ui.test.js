'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const room=fs.readFileSync(require.resolve('../server/ranked-room-core.mjs'),'utf8');
const finalRoom=fs.readFileSync(require.resolve('../server/ranked-room-final.mjs'),'utf8');
const accountStore=fs.readFileSync(require.resolve('../server/ranked-account-store.mjs'),'utf8');
const worker=fs.readFileSync(require.resolve('../server/worker.mjs'),'utf8');

test('daily bonus still waits for first ranked game launch and notices use public ack API',()=>{
  assert.match(worker,/\/api\/account\/notices\/ack/);
  assert.match(ranked,/withDailyLoginNotice/);
  assert.match(ranked,/type==='daily-login'/);
  assert.match(ranked,/\/api\/account\/notices\/ack/);
});

test('captured Sake Cup review never reopens picture or single choice after initial selection',()=>{
  const block=app.slice(app.indexOf('function renderCaptured'),app.indexOf('function openCaptureGroup'));
  assert.doesNotMatch(block,/openGukjinChoice\(false\)/);
  assert.doesNotMatch(block,/gukjin-review-card/);
});

test('startup locale lookup remains valid so session restore and attract initialization run',()=>{
  assert.doesNotMatch(ranked,/\$\('registerForm \.account-help'\)/);
  assert.match(ranked,/\$\('registerForm'\)\.querySelector\('\.account-help'\)/);
  assert.match(ranked,/__gostopRankedBootComplete=true/);
});

test('disconnect settlement uses current authoritative score and settlement multipliers, never future simulation',()=>{
  const estimator=room.slice(room.indexOf('export function estimateFairDisconnectSettlement'),room.indexOf('export class RankedRoomCore'));
  assert.match(estimator,/opponentScore<=quitterScore/);
  assert.match(estimator,/settlementType:'nagari'/);
  assert.match(estimator,/GoStopEngine\.calculateSettlement/);
  assert.match(estimator,/settlementType:'current-settlement'/);
  assert.doesNotMatch(estimator,/scenarioCount|seededRandom|opponentCaptureChance/);
});

test('production FinalRankedRoomCore submits current settlement to the authoritative account store',()=>{
  const block=finalRoom.slice(finalRoom.indexOf("async abandon(playerId"),finalRoom.indexOf('async startRankedSession'));
  assert.match(block,/calculateDisconnectSettlement\(playerId\)/);
  assert.match(block,/settlementType:settlement\.settlementType/);
  assert.match(block,/opponentRewardCoins:settlement\.fairPoints/);
  assert.match(block,/penaltyCoins:settlement\.fairPoints/);
  assert.match(block,/response\?\.penaltyCoins/);
  assert.doesNotMatch(block,/penaltyCoins=this\.calculatePenalty\(playerId\)/);
});

test('first timed-out technical disconnect is protected without deduct-then-refund',()=>{
  assert.match(accountStore,/isDisconnect=body\.reason==='disconnect-timeout'/);
  assert.match(accountStore,/firstOfMonth=isDisconnect&&priorMonth===0/);
  assert.match(accountStore,/penalty=settlementType==='nagari'\?0:\(firstOfMonth\?0:fairPoints\)/);
  assert.match(accountStore,/type:'disconnect-forgiven'/);
  assert.doesNotMatch(accountStore,/type:'abandonment-refund'/);
});

test('disconnect outcome notices are deferred until ranked entry, including repeat-loss notices',()=>{
  assert.doesNotMatch(ranked,/queueMicrotask\(showNextAccountNotice\)/);
  assert.doesNotMatch(ranked,/function showNextAccountNotice/);
  assert.match(ranked,/showRankedEntryNotice/);
  assert.match(ranked,/type==='disconnect-forgiven'/);
  assert.match(ranked,/type==='disconnect-loss'/);
  assert.match(ranked,/disconnectLossText/);
  assert.match(accountStore,/type:'disconnect-loss'/);
});

test('signup explains disconnect protection and requires OK before registration API call',()=>{
  assert.match(ranked,/registrationPolicyDialog/);
  assert.match(ranked,/signupPolicyText/);
  assert.match(ranked,/registrationPolicyOk/);
  const block=ranked.slice(ranked.indexOf("\$('registerForm'\).addEventListener('submit'"),ranked.indexOf('async function requireAccount'));
  assert.match(block,/registrationPolicyDialog\.showModal\(\)/);
  assert.ok(block.indexOf('registrationPolicyDialog.showModal()')<block.indexOf("api('/api/auth/register'"));
});

test('protected disconnect notice appears only on ranked entry',()=>{
  assert.match(ranked,/showRankedEntryNotice/);
  const entry=ranked.slice(ranked.indexOf('function beginRankedEntry'),ranked.indexOf('function renderLeaderboard'));
  assert.match(entry,/showRankedEntryNotice/);
  assert.match(ranked,/rankedSolo\.addEventListener\('click',\(\)=>beginRankedEntry\('solo'/);
  assert.match(ranked,/onlinePlay\.addEventListener\('click',\(\)=>beginRankedEntry\('online'/);
  assert.match(ranked,/disconnectForgivenText/);
});

test('opponent gets one-minute technical-issue countdown with no-penalty Quit Game',()=>{
  assert.match(room,/RECONNECT_GRACE_MS=60000/);
  assert.match(ranked,/rankedReconnectCountdown/);
  assert.match(ranked,/opponentReconnectText/);
  assert.match(ranked,/quitDisconnectedGame/);
  assert.match(ranked,/cancelDisconnectedGame/);
  assert.match(room,/endRankedSession\('disconnect-cancelled'\)/);
  assert.match(room,/disconnectCancelled=true/);
});

test('disconnect grace freezes Solo computer play and settlement at disconnect-time state',()=>{
  assert.match(room,/disconnectSettlements:\{\}/);
  assert.match(room,/disconnectSettlements\[playerId\]=this\.calculateDisconnectSettlement\(playerId\)/);
  assert.match(room,/const frozen=this\.room\?\.rankFlow\?\.disconnectSettlements\?\.\[playerId\]/);
  const bot=room.slice(room.indexOf('async advanceBot()'),room.indexOf('}\n}\n\nexport {NUDGE_MS'));
  assert.match(bot,/Object\.keys\(this\.room\.rankFlow\.disconnectDeadlines\|\|\{\}\)\.length/);
});

test('normal play and hand input are frozen while opponent reconnect window is active',()=>{
  assert.match(room,/OPPONENT_RECONNECTING/);
  assert.match(app,/flow\?\.opponentReconnectUntil/);
  const hand=app.slice(app.indexOf('function rankedHandTurnAvailable'),app.indexOf('function render()'));
  assert.match(hand,/flow\?\.opponentReconnectUntil/);
  assert.match(hand,/viewerCanInteract\?\.\(snapshot,\{connected,pendingActionId:null,blocked\}\)/);
});

test('active ranked room credential persists on device but resumes only after explicit mode selection',()=>{
  assert.match(app,/localStorage\.setItem\('gostop-active-ranked-room'/);
  assert.match(app,/localStorage\.getItem\('gostop-active-ranked-room'/);
  assert.match(ranked,/ACTIVE_RANKED_ROOM_KEY='gostop-active-ranked-room'/);
  assert.doesNotMatch(ranked,/resumeActiveRankedRoom/);
  assert.match(ranked,/account\?\.activeRanked\?\.mode==='solo'/);
  assert.match(ranked,/account\?\.activeRanked\?\.mode==='online'/);
  assert.match(ranked,/launchRankedRoom\(account\.activeRanked\.roomCode\)/);
  assert.match(ranked,/joinForm\.requestSubmit\(\)/);
});

test('reconnect modal is the disconnect UI and old 45-second toast is not emitted',()=>{
  const listener=ranked.slice(ranked.indexOf("globalThis.addEventListener('gostop-online-message'"),ranked.indexOf('function revealCurrentMainMenu'));
  assert.doesNotMatch(listener,/message\.type==='opponentDisconnected'/);
  assert.match(listener,/message\.type==='opponentConnected'/);
});

test('reconnect countdown formats 60 seconds as 1:00',()=>{assert.match(ranked,/Math\.floor\(seconds\/60\).*seconds%60/);assert.doesNotMatch(ranked,/`0:\$\{String\(seconds\)/);});


test('declining a connected Solo resume clears the stale active Solo before returning to menu',()=>{
  const handler=ranked.slice(ranked.indexOf("$('returnGameNo').addEventListener"),ranked.indexOf("$('returnGameOk').addEventListener"));
  assert.match(handler,/active\?\.mode==='solo'&&active\?\.roomCode/);
  assert.match(handler,/api\('\/api\/solo\/leave-for-challenge',\{method:'POST',body:\{\}\}\)/);
  assert.match(handler,/localStorage\.removeItem\(ACTIVE_RANKED_ROOM_KEY\)/);
  assert.match(handler,/await refreshAccount\(\)/);
  assert.match(handler,/revealCurrentMainMenu\(\)/);
});
