import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/lobby.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Competitive Online Play has exactly Matchmaking Lobby, Search Player, and Share Link sections',()=>{
  const panel=client.slice(client.indexOf("const onlinePanel=document.createElement"),client.indexOf("const authDialog=document.createElement"));
  assert.match(panel,/data-online-section="matchmaking"/);assert.match(panel,/data-online-section="search"/);assert.match(panel,/data-online-section="share"/);
  assert.equal((panel.match(/data-online-section=/g)||[]).length,3);
  assert.match(panel,/id="autoMatchBtn"/);assert.match(panel,/id="browsePlayersBtn"/);assert.match(panel,/id="enablePlayNotificationsBtn"/);assert.match(panel,/id="onlinePlayerCount"/);
  assert.match(panel,/id="onlineNicknameSearchBtn"/);assert.match(panel,/id="browsePlayerResults"/);assert.match(panel,/id="searchPlayerResults"/);
  assert.doesNotMatch(panel,/onlineInviteEmail|Invite by Email|Send Invite/);
  assert.match(panel,/id="competitiveShareLink"/);assert.match(panel,/id="competitiveCopyLinkBtn"[^>]*>Copy URL</);
  assert.match(client,/if\(createRoom\)\{createRoom\.textContent='Create Room';controls\.appendChild\(createRoom\);\}/);
  assert.match(client,/if\(joinForm\)joinForm\.hidden=true/);
  assert.doesNotMatch(client,/controls\.appendChild\(onlineStatus\)/);
  assert.match(client,/onlineNicknameSearch'\)\.value='';\$\('lobbyStatus'\)\.textContent=''/);
});

test('Browse and Search player cards show ranks, Coins, record, matchup history, and Available Away Busy Offline states',()=>{
  assert.match(server,/const MAX_LOBBY_RESULTS=10/);
  const render=client.slice(client.indexOf('function playerStatusText'),client.indexOf('function closeRequestDialog'));
  assert.match(render,/statusNotOnline/);assert.match(render,/statusAvailableSimple/);assert.match(render,/statusAway/);assert.match(render,/statusNotAvailable/);
  assert.match(render,/playerStatusClass/);assert.match(render,/globalRank/);assert.match(render,/monthlyRank/);
  assert.match(render,/coinsLabel/);assert.match(render,/player\.wins/);assert.match(render,/player\.losses/);assert.match(render,/headToHead/);
  assert.match(render,/history\.wins/);assert.match(render,/history\.losses/);assert.match(render,/history\.coinsWon/);assert.match(render,/history\.coinsLost/);assert.match(render,/history\.lastPlayedAt/);
  assert.match(render,/const challengeable=player\.challengeable===true&&player\.online!==false/);
  assert.match(render,/playButton=challengeable\?/);
  assert.doesNotMatch(render,/leaderboardRank/);
});

test('Search is a registered-player directory lookup and overlays current online availability',()=>{
  assert.match(server,/async directorySearch\(query,requesterAccountId=null\)/);
  assert.match(server,/\/internal\/player-search/);assert.match(server,/\/internal\/player-profiles/);
  const search=server.slice(server.indexOf('async search(client,query'),server.indexOf('async broadcastRecommendations'));
  assert.match(search,/await this\.directorySearch\(query,client\.account\.id\)/);assert.match(search,/this\.presenceForAccount\(player\.accountId\)/);
  assert.match(server,/status:'offline'/);assert.match(server,/status:'in-game'/);
  assert.match(client,/statusNotOnline:'Not Online'/);assert.match(client,/statusNotAvailable:'Online - Not Available'/);assert.match(client,/statusAway:'Online - Away'/);assert.match(client,/statusAvailableSimple:'Online - Available'/);
});

test('Browse and Search use separate result lists and refresh independently after reconnect',()=>{
  assert.match(client,/browsePlayerResults" class="online-player-list" hidden/);assert.match(client,/searchPlayerResults" class="online-player-list" hidden/);
  const render=client.slice(client.indexOf('function renderLobbyPresence'),client.indexOf('function connectLobby'));
  assert.match(render,/list=\$\('browsePlayerResults'\)/);assert.match(render,/list\.hidden=!browsePlayersActive/);
  const browse=client.slice(client.indexOf("\$('browsePlayersBtn').addEventListener"),client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"));
  assert.match(browse,/browsePlayersActive=true/);assert.match(browse,/browsePlayerResults/);assert.match(browse,/type:'recommendations'/);
  const search=client.slice(client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"),client.indexOf("\$('autoMatchBtn').addEventListener"));
  assert.match(search,/lobbySearchActive=!!query/);assert.match(search,/searchPlayerResults/);assert.match(search,/type:'search',query/);
  const transport=client.slice(client.indexOf('function connectLobby'),client.indexOf('function closeLobby'));
  assert.match(transport,/browsePlayersActive\)requestRecommendations\(\)/);assert.match(transport,/lobbySearchActive/);assert.match(transport,/lobbySend\(\{type:'search',query\}\)/);
});

test('presence requires foreground activity within five minutes and publishes notification capability',()=>{
  assert.match(client,/const PRESENCE_AWAY_MS=300000/);assert.match(client,/const PRESENCE_HEARTBEAT_MS=30000/);
  assert.match(client,/function tabForeground\(\)/);assert.match(client,/document\.visibilityState==='visible'/);assert.match(client,/document\.hasFocus/);
  assert.match(client,/lastActivityAt:lastPlayerActivityAt/);assert.match(client,/foreground:tabForeground\(\)/);assert.match(client,/notificationsEnabled:notificationPermissionGranted\(\)/);
  assert.match(client,/document\.addEventListener\('pointerdown',markPlayerActivity/);assert.match(client,/document\.addEventListener\('visibilitychange',syncLobbyAvailability/);
  assert.match(server,/const PRESENCE_AWAY_MS=300000/);assert.match(server,/const PRESENCE_HEARTBEAT_STALE_MS=90000/);assert.match(server,/status:'away'/);
  assert.match(app,/function publishPlayerActivity\(active,mode='',twoPlayer=false\)/);assert.match(app,/publishPlayerActivity\(true,training\?'training':'free-solo',false\)/);
  assert.match(app,/const twoPlayer=!!anonymous\|\|room\?\.rankedMode!=='solo'/);
});

test('play request notifications are opt-in and Away Play requires a fresh notification-capable tab',()=>{
  assert.match(client,/enablePlayNotificationsBtn/);assert.match(client,/Notification\.requestPermission\(\)/);assert.match(client,/serviceWorker\.register\('\.\/gostop-notifications-sw\.js\?v=20260920-1'\)/);
  assert.match(client,/showPlayRequestNotification\(message\)/);assert.match(client,/showNotification\('GoStop Live! Play Request'/);
  assert.match(server,/notifyable=away&&client\.notificationsEnabled===true&&heartbeatFresh/);
  assert.match(server,/clientCanReceiveChallenge\(client\)/);
});

test('incoming player request is Yes No and accepting a Solo game is covered until multiplayer begins',()=>{
  assert.match(client,/id="requestAccept"[^>]*>Yes</);assert.match(client,/id="requestDecline"[^>]*>No</);
  assert.match(client,/prepareToAcceptMultiplayerChallenge/);assert.match(client,/\/api\/solo\/leave-for-challenge/);assert.match(client,/GoStopGameBridge\?\.prepareForMultiplayerChallenge/);
  const accept=client.slice(client.indexOf("\$('requestAccept').addEventListener"),client.indexOf("\$('requestDecline').addEventListener"));
  assert.match(accept,/showMatchHandoff\(rt\('startingMatch'\)\)/);assert.match(accept,/challengeResponse',requestId:request\.requestId,accept:true/);
  assert.match(app,/prepareForMultiplayerChallenge\(\)/);assert.match(app,/if\(isTwoPlayerOnline\)return false/);assert.match(app,/if\(onlineMode\)returnOnlineToMenu\(\)/);
});

test('requester sees Waiting for Opponent to Respond immediately and can cancel before acceptance',()=>{
  assert.match(client,/id="outgoingRequestTitle">Waiting for Opponent to Respond</);assert.match(client,/id="cancelOutgoingRequest"[^>]*>Cancel Request</);
  assert.match(client,/function showOutgoingRequest\(message\)/);
  const render=client.slice(client.indexOf('function renderPlayers'),client.indexOf('function closeRequestDialog'));
  assert.match(render,/showOutgoingRequest\(optimistic\)/);assert.match(render,/type:'challenge',accountId:button\.dataset\.challengeAccountId/);
  assert.match(client,/message\.type==='challengeSent'[^]*showOutgoingRequest\(message\)/);
  const auto=client.slice(client.indexOf("\$('autoMatchBtn').addEventListener"),client.indexOf("\$('autoMatchCancelBtn').addEventListener"));
  assert.match(auto,/showOutgoingRequest\(\{requestId:null,automatic:true,to:null\}\)/);
  const cancel=client.slice(client.indexOf("\$('cancelOutgoingRequest').addEventListener"),client.indexOf("\$('declinedDialogOk').addEventListener"));
  assert.match(cancel,/type:'challengeCancel'/);assert.match(cancel,/type:'autoMatchCancel'/);assert.match(server,/message\.type==='challengeCancel'/);
});

test('decline always sends requester a dedicated Request Declined dialog with OK and refreshes results',()=>{
  assert.match(client,/id="declinedDialogTitle">Request Declined</);assert.match(client,/id="declinedDialogOk"[^>]*>OK</);
  assert.match(server,/type:'challengeDeclined'/);
  const decline=client.slice(client.indexOf("if(message.type==='challengeDeclined')"),client.indexOf("if(message.type==='challengeCancelled'"));
  assert.match(decline,/requestDeclinedText/);assert.match(decline,/declinedDialog\.showModal\(\)/);assert.match(decline,/refreshVisibleLobbyResults\(\)/);
  assert.match(server,/lastRequestAt\.delete\(challenge\.from\)/);
});

test('accepted challenge uses explicit app bridge and stays active until second player joins same room',()=>{
  assert.match(app,/async createCompetitiveRoom\(\)/);assert.match(app,/async joinCompetitiveRoom\(roomCode\)/);
  const handler=client.slice(client.indexOf('async function createAcceptedChallengeRoom'),client.indexOf('async function prepareToAcceptMultiplayerChallenge'));
  assert.match(handler,/bridge\.createCompetitiveRoom\(\)/);assert.match(handler,/bridge\.joinCompetitiveRoom\(message\.roomCode\)/);
  assert.doesNotMatch(handler,/createRoom\?\.click\(\)|joinForm\.requestSubmit\(\)/);
  assert.match(server,/fromClientId/);assert.match(server,/toClientId/);assert.match(server,/challenge\.status='room-ready'/);assert.match(server,/message\.type==='challengeJoined'/);assert.match(server,/type:'challengeRoomHandoffComplete'/);
});

test('Auto Match chooses a target but still routes through same request acceptance flow',()=>{
  assert.match(client,/type:'autoMatchStart'/);assert.match(server,/startChallenge\(client,partner,rows,\{automatic:true\}\)/);
  assert.match(server,/type:'playRequest'/);assert.match(server,/message\.type==='challengeResponse'/);assert.match(server,/type:'challengeAcceptedCreateRoom'/);assert.match(server,/type:'challengeAcceptedWaiting'/);
});

test('Share Link creates a direct URL with Copy URL while direct-link joining remains supported',()=>{
  assert.match(client,/id="freeShareLink"/);assert.match(client,/id="competitiveShareLink"/);assert.match(client,/id="freeCopyLinkBtn"/);assert.match(client,/id="competitiveCopyLinkBtn"[^>]*>Copy URL</);
  assert.match(client,/function roomShareUrl\(roomCode,mode\)/);assert.match(client,/searchParams\.set\('room'/);assert.match(client,/searchParams\.set\('mode',mode==='free'\?'free':'competitive'\)/);
  assert.match(client,/function showRoomShareLink\(roomCode,mode\)/);assert.match(client,/navigator\.clipboard\.writeText\(link\.href\)/);
  assert.match(client,/gostop-online-room-created/);assert.match(app,/async joinFreeRoom\(roomCode\)/);assert.match(app,/async joinCompetitiveRoom\(roomCode\)/);
});

test('Competitive direct link requires Log In or Create ID first and resumes intent after either flow',()=>{
  assert.match(client,/inviteMode=inviteUrl\.searchParams\.get\('mode'\)==='free'\?'free':'competitive'/);
  const invite=client.slice(client.indexOf('async function launchInviteRoom'),client.indexOf('globalThis.GoStopRanked'));
  assert.match(invite,/if\(inviteMode==='free'\)[^]*joinFreeRoom\(code\)/);assert.match(invite,/requireAccount\(async\(\)=>/);assert.match(invite,/joinCompetitiveRoom\(code\)/);
  assert.match(client,/let .*accountContinuation=null/);assert.match(client,/function continueAfterAccount\(\)/);
  assert.match(client,/saveSession\(data\);authDialog\.close\(\);continueAfterAccount\(\)/);
  assert.match(client,/registrationOk'\)\.addEventListener[^]*continueAfterAccount\(\)/);
});

test('same-account tabs are excluded and any two-player tab makes account busy',()=>{
  assert.match(server,/id===client\.account\.id/);assert.match(server,/accountTwoPlayerBusy\(id\)/);assert.match(server,/this\.clientsForAccount\(accountId\)\.some\(client=>!!client\.twoPlayer\)/);
});

test('Competitive Solo handoff route ends authoritative Solo session before multiplayer acceptance',()=>{
  const worker=fs.readFileSync(new URL('../server/worker.mjs',import.meta.url),'utf8');
  const gameRoom=fs.readFileSync(new URL('../server/game-room.mjs',import.meta.url),'utf8');
  const rankedRoom=fs.readFileSync(new URL('../server/ranked-room-core.mjs',import.meta.url),'utf8');
  assert.match(worker,/\/api\/solo\/leave-for-challenge/);assert.match(worker,/leave-solo-for-challenge/);assert.match(gameRoom,/url\.pathname==='\/leave-solo-for-challenge'/);
  assert.match(rankedRoom,/async leaveSoloForChallenge\(accountId\)/);assert.match(rankedRoom,/endRankedSession\('accepted-multiplayer-challenge'\)/);
  const handoff=rankedRoom.slice(rankedRoom.indexOf('async leaveSoloForChallenge'),rankedRoom.indexOf('async connect',rankedRoom.indexOf('async leaveSoloForChallenge')));
  assert.doesNotMatch(handoff,/force-quit|abandon\(/);
});


test('frontend cache versions advance after pause-expiry and lobby cleanup fixes',()=>{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/i18n\.js\?v=20260920-1/);
  assert.match(index,/ranked-client\.js\?v=20260920-4/);
  assert.match(index,/app\.js\?v=20260920-2/);
  assert.match(index,/data-i18n="opponentEnded">Session Ended</);
});
