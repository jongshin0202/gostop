import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/lobby.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('connection protection signup notice stays short and action-focused',()=>{
  assert.ok(client.includes("signupPolicyText:'If you disconnect during a Coin game, you have 1 minute to return.\\n\\nYour first forced disconnect each month is protected, so no Coins are deducted. After that, a disconnect may count as a loss if your opponent was ahead.\\n\\nPress OK to continue.'"));
  assert.doesNotMatch(client,/Sometimes a ranked game can be interrupted by a Wi-Fi/);
});

test('Competitive Online Play has only Matchmaking Lobby and Search Player; share-link room creation stays Friendly-only',()=>{
  const panel=client.slice(client.indexOf("const onlinePanel=document.createElement"),client.indexOf("const authDialog=document.createElement"));
  assert.match(panel,/data-online-section="matchmaking"/);assert.match(panel,/data-online-section="search"/);assert.doesNotMatch(panel,/data-online-section="share"/);
  assert.equal((panel.match(/data-online-section=/g)||[]).length,2);
  assert.match(panel,/id="autoMatchBtn"/);assert.match(panel,/id="browsePlayersBtn"/);assert.match(panel,/id="searchPlayersBtn"/);assert.doesNotMatch(panel,/id="enablePlayNotificationsBtn"/);assert.match(panel,/id="onlinePlayerCount"/);
  assert.match(client,/notificationsBtn\.id='enablePlayNotificationsBtn'/);assert.match(client,/settingsControlsHost/);assert.match(client,/accountMenuControls\.append\(accountLanguageControl,notificationsBtn\)/);
  assert.match(panel,/id="onlineNicknameSearchBtn"/);assert.match(panel,/id="browsePlayerResults"/);assert.match(panel,/id="searchPlayerResults"/);
  assert.doesNotMatch(panel,/onlineInviteEmail|Invite by Email|Send Invite|competitiveShareLink|competitiveCopyLinkBtn|Share Link/);
  assert.match(client,/if\(createRoom\)\{createRoom\.hidden=true;createRoom\.style\.display='none';\}/);
  assert.match(client,/if\(joinForm\)\{joinForm\.hidden=true;joinForm\.style\.display='none';\}/);
  assert.doesNotMatch(client,/controls\.appendChild\(onlineStatus\)/);
  assert.match(client,/onlineNicknameSearch'\)\.value='';\$\('lobbyStatus'\)\.textContent=''/);
});

test('Language and notification controls live in Settings instead of the main menu or Online Play panel',()=>{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(index,/id="languageBtn"/);assert.doesNotMatch(index,/id="languageMenu"/);
  assert.match(client,/settingsDialog\.id='settingsDialog'/);assert.match(client,/languageBtn\.id='languageBtn'/);assert.match(client,/languageMenu\.id='languageMenu'/);assert.match(client,/accountMenuControls\.append\(accountLanguageControl,notificationsBtn\)/);assert.match(client,/settingsControlsHost'\)\.appendChild\(accountMenuControls\)/);
  assert.match(client,/accountSettingsBtn/);assert.match(client,/settingsOk/);
  const panel=client.slice(client.indexOf("const onlinePanel=document.createElement"),client.indexOf("const authDialog=document.createElement"));
  assert.doesNotMatch(panel,/enablePlayNotificationsBtn/);
});

test('rank zero displays Not Yet Ranked with a transient hover or focus explanation and leaderboard has no provisional P prefix',()=>{
  assert.match(client,/notYetRanked:'Not Yet Ranked'/);assert.match(client,/rankAfterTen:'User will be ranked after first 10 games played'/);
  assert.match(client,/function notYetRankedHtml\(\)/);assert.match(client,/class="not-yet-ranked" tabindex="0"/);assert.match(client,/class="rank-tooltip" role="tooltip"/);
  assert.match(client,/\.not-yet-ranked:hover \.rank-tooltip/);assert.match(client,/\.not-yet-ranked:focus \.rank-tooltip/);
  const board=client.slice(client.indexOf('function leaderboardRowHtml'),client.indexOf('function nextLeaderboard'));
  assert.match(board,/rankNumberHtml\(row\.rank\)/);assert.doesNotMatch(board,/\?['"]P /);
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

test('Browse Top 10 and Search Player replace one another and refresh independently after reconnect',()=>{
  assert.match(client,/browsePlayerResults" class="online-player-list" hidden/);assert.match(client,/data-online-section="search" hidden/);assert.match(client,/searchPlayerResults" class="online-player-list" hidden/);
  const render=client.slice(client.indexOf('function renderLobbyPresence'),client.indexOf('function connectLobby'));
  assert.match(render,/list=\$\('browsePlayerResults'\)/);assert.match(render,/list\.hidden=!browsePlayersActive/);
  const browse=client.slice(client.indexOf("\$('browsePlayersBtn').addEventListener"),client.indexOf("\$('enablePlayNotificationsBtn').addEventListener"));
  assert.match(browse,/browsePlayersActive=true/);assert.match(browse,/lobbySearchActive=false/);assert.match(browse,/searchSection\.hidden=true/);assert.match(browse,/searchPlayerResults'\)\.hidden=true/);assert.match(browse,/type:'recommendations'/);
  assert.match(browse,/searchPlayersBtn/);assert.match(browse,/browsePlayersActive=false/);assert.match(browse,/searchSection\.hidden=false/);assert.match(browse,/browsePlayerResults'\)\.hidden=true/);
  const search=client.slice(client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"),client.indexOf("\$('autoMatchBtn').addEventListener"));
  assert.match(search,/browsePlayersActive=false/);assert.match(search,/lobbySearchActive=!!query/);assert.match(search,/searchPlayerResults/);assert.match(search,/type:'search',query/);
  const transport=client.slice(client.indexOf('function connectLobby'),client.indexOf('function closeLobby'));
  assert.match(transport,/browsePlayersActive\)requestRecommendations\(\)/);assert.match(transport,/lobbySearchActive/);assert.match(transport,/lobbySend\(\{type:'search',query\}\)/);
});

test('lobby presence carries a stable per-tab ID so refresh replaces only that tab connection',()=>{
  assert.match(client,/const LOBBY_TAB_ID_KEY='gostop-lobby-tab-id'/);
  assert.match(client,/sessionStorage\.getItem\(LOBBY_TAB_ID_KEY\)/);
  assert.match(client,/sessionStorage\.setItem\(LOBBY_TAB_ID_KEY,value\)/);
  assert.match(client,/type:'setAvailability',tabId:lobbyTabId/);
  assert.match(server,/claimTabInstance\(client,tabId\)/);
  assert.match(server,/other\.account\?\.id!==client\.account\?\.id\|\|other\.tabId!==id/);
  assert.match(server,/socket\.close\(4004,'Same tab reconnected'\)/);
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

test('notification button toggles app notifications, lights green when enabled, and keeps blocked state clickable',()=>{
  assert.match(client,/const NOTIFICATION_PREF_KEY='gostop-play-notifications-enabled'/);
  assert.match(client,/notificationsBtn\.className='account-menu-control notification-control'/);
  assert.match(client,/\.notification-control\.notification-enabled/);assert.match(client,/\.notification-control\.notification-enabled::before/);
  assert.match(client,/button\.classList\.toggle\('notification-enabled',enabled\)/);assert.match(client,/button\.setAttribute\('aria-pressed',String\(enabled\)\)/);
  assert.match(client,/button\.disabled=false/);assert.match(client,/button\.title=Notification\.permission==='denied'/);
  assert.match(client,/function disablePlayNotifications\(\)/);assert.match(client,/function togglePlayNotifications\(\)/);assert.match(client,/setNotificationPreference\(false\)/);
  assert.match(client,/Notification\.requestPermission\(\)/);assert.match(client,/serviceWorker\.register\('\.\/gostop-notifications-sw\.js\?v=20260920-1'\)/);
  assert.match(client,/showPlayRequestNotification\(message\)/);assert.match(client,/showNotification\('GoStop Live! Play Request'/);
  assert.match(server,/const available=heartbeatFresh&&!client\.twoPlayer&&client\.available!==false/);assert.match(server,/notifyable=away&&client\.notificationsEnabled===true/);
  assert.match(server,/state\.active\|\|state\.away/);assert.match(server,/status:'away'/);assert.match(server,/challengeable:!this\.pendingChallengeFor\(accountId\)/);
});

test('blocked browser notifications show a recovery dialog instead of silently doing nothing',()=>{
  assert.match(client,/id="notificationBlockedTitle">Notifications Blocked/);assert.match(client,/id="notificationBlockedReady"/);assert.match(client,/id="notificationBlockedRetry"/);assert.match(client,/id="notificationBlockedCancel"/);
  assert.match(client,/notificationBlockedText:'Notifications are blocked for this site/);assert.match(client,/notificationBlockedSteps:'Use the site controls next to the address bar/);
  assert.match(client,/notificationChangedCheck:'I changed Notifications for this site to Allow'/);assert.match(client,/recheckNotifications:'Check Again & Enable'/);
  assert.match(client,/if\(permission==='denied'\)[^]*showNotificationBlockedDialog\(\)/);
  assert.match(client,/notificationBlockedReady'\)\.addEventListener\('change'/);assert.match(client,/retryBlockedNotifications/);
  assert.match(client,/navigator\.permissions\.query\(\{name:'notifications'\}\)/);assert.match(client,/notificationEnablePending/);
});

test('incoming player request is Yes No and accepting a Solo game is covered until multiplayer begins',()=>{
  assert.match(client,/id="requestAccept"[^>]*>Yes</);assert.match(client,/id="requestDecline"[^>]*>No</);
  assert.match(client,/prepareToAcceptMultiplayerChallenge/);assert.match(client,/\/api\/solo\/leave-for-challenge/);assert.match(client,/GoStopGameBridge\?\.prepareForMultiplayerChallenge/);
  const accept=client.slice(client.indexOf("\$('requestAccept').addEventListener"),client.indexOf("\$('requestDecline').addEventListener"));
  assert.match(accept,/showMatchHandoff\(rt\('startingMatch'\)\)/);assert.match(accept,/challengeResponse',requestId:request\.requestId,accept:true/);
  assert.match(app,/prepareForMultiplayerChallenge\(\)/);assert.match(app,/if\(isTwoPlayerOnline\)return false/);assert.match(app,/if\(onlineMode\)returnOnlineToMenu\(\)/);
});

test('missed play requests are stored, show local date/time, and support arrows, OK, and Clear All',()=>{
  assert.match(client,/const MISSED_REQUESTS_KEY='gostop-missed-play-requests'/);
  assert.match(client,/id="missedRequestTitle">Missed Play Request/);assert.match(client,/id="missedRequestPrev"/);assert.match(client,/id="missedRequestNext"/);assert.match(client,/id="missedRequestOk"/);assert.match(client,/id="missedRequestClearAll"/);
  assert.match(client,/function enqueueMissedRequest\(message\)/);assert.match(client,/when\.toLocaleString\(\)/);assert.match(client,/items\.splice/);assert.match(client,/writeMissedRequests\(\[\]\)/);
  assert.match(client,/message\.type==='challengeMissed'/);assert.match(client,/message\.type==='challengeNoAnswer'/);assert.match(client,/noResponseText/);
  assert.match(server,/const CHALLENGE_TTL_MS=30000/);assert.match(server,/type:'challengeNoAnswer'/);assert.match(server,/type:'challengeMissed'/);assert.match(server,/await this\.tryAutoMatch\(creator\)/);
});

test('manual Play shows Waiting immediately while Auto Match waits until the candidate is accepted',()=>{
  assert.match(client,/id="outgoingRequestTitle">Waiting for Opponent to Respond</);assert.match(client,/id="cancelOutgoingRequest"[^>]*>Cancel Request</);
  assert.match(client,/function showOutgoingRequest\(message\)/);
  const render=client.slice(client.indexOf('function renderPlayers'),client.indexOf('function closeRequestDialog'));
  assert.match(render,/showOutgoingRequest\(optimistic\)/);assert.match(render,/type:'challenge',accountId:button\.dataset\.challengeAccountId/);
  assert.match(client,/message\.type==='challengeSent'[^]*showOutgoingRequest\(message\)/);
  const autoStart=client.slice(client.indexOf("\$('autoMatchBtn').addEventListener"),client.indexOf("\$('autoMatchCandidateAccept').addEventListener"));
  assert.doesNotMatch(autoStart,/showOutgoingRequest/);assert.match(autoStart,/type:'autoMatchStart'/);
  const auto=client.slice(client.indexOf("\$('autoMatchCandidateAccept').addEventListener"),client.indexOf("function roomShareUrl"));
  assert.match(auto,/autoMatchCandidateAccept[^]*button\.disabled=true[^]*type:'autoMatchAccept',accountId:autoMatchCandidate\.accountId/);assert.doesNotMatch(auto,/showOutgoingRequest/);
  assert.match(client,/message\.type==='playRequest'[^]*type:'challengeReceipt'/);assert.match(server,/message\.type==='challengeReceipt'/);assert.match(server,/deliverPendingChallenge\(client\)/);assert.match(client,/message\.type==='playRequest'[^]*closeLeaderboard\(true\)/);assert.match(server,/CHALLENGE_DELIVERY_RETRY_MS=1500/);assert.match(server,/retryChallengeDelivery\(id\)/);
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
  assert.match(app,/async createCompetitiveRoom\(\)/);assert.match(app,/async joinCompetitiveRoom\(roomCode,\{resumeExisting=false\}=\{\}\)/);
  const handler=client.slice(client.indexOf('async function createAcceptedChallengeRoom'),client.indexOf('async function prepareToAcceptMultiplayerChallenge'));
  assert.match(handler,/bridge\.createCompetitiveRoom\(\)/);assert.match(handler,/bridge\.joinCompetitiveRoom\(message\.roomCode\)/);
  assert.doesNotMatch(handler,/createRoom\?\.click\(\)|joinForm\.requestSubmit\(\)/);
  assert.match(server,/fromClientId/);assert.match(server,/toClientId/);assert.match(server,/challenge\.status='room-ready'/);assert.match(server,/message\.type==='challengeJoined'/);assert.match(server,/type:'challengeRoomHandoffComplete'/);
});

test('Auto Match previews the best candidate, supports Someone Else, then sends the request only after Accept',()=>{
  assert.match(client,/id="autoMatchCandidateTitle">Matched Opponent/);assert.match(client,/id="autoMatchCandidateAccept"[^>]*>Accept</);assert.match(client,/id="autoMatchCandidateNext"[^>]*>Someone Else</);assert.match(client,/id="autoMatchCandidateCancel"[^>]*>Cancel Auto Match</);
  assert.match(client,/message\.type==='autoMatchCandidate'/);assert.match(client,/showAutoMatchCandidate\(message\.candidate\|\|null\)/);
  assert.match(client,/function renderOpponentProfile\(rootId,player\)/);assert.match(client,/player\.headToHead/);assert.match(client,/player\.gamesPlayed/);assert.match(client,/player\.wins/);assert.match(client,/player\.losses/);assert.match(client,/player\.totalCoinsEarned/);assert.match(client,/neverPlayedBefore/);
  assert.match(client,/autoMatchCandidateNext[^]*type:'autoMatchNext'/);assert.match(client,/autoMatchCandidateAccept[^]*type:'autoMatchAccept'/);assert.match(client,/autoMatchCandidateCancel[^]*type:'autoMatchCancel'/);
  assert.match(client,/function showAutoMatchWaiting\(\)/);assert.match(client,/Looking for Another Player/);assert.match(client,/No other available players right now/);assert.match(client,/message\.type==='autoMatchWaiting'[^]*showAutoMatchWaiting\(\)/);
  assert.match(server,/type:'autoMatchCandidate',candidate:toProfile/);assert.match(server,/message\.type==='autoMatchNext'/);assert.match(server,/message\.type==='autoMatchAccept'/);assert.match(server,/acceptAutoMatchCandidate\(client,message\.accountId\)/);assert.match(server,/enqueueClientMessage\(client,data\)/);assert.match(server,/messageQueue:Promise\.resolve\(\)/);assert.match(server,/addEventListener\('message',event=>\{void this\.enqueueClientMessage\(client,event\.data\);\}\)/);
  assert.match(server,/startChallenge\(client,target,rows,\{automatic:true,toProfileOverride:toProfile\}\)/);assert.match(server,/challengeRequestMessage\(challenge\)/);assert.match(server,/sendToAccount\(target\.account\.id,this\.challengeRequestMessage\(challenge\)\)/);
  assert.match(server,/type:'challengeAcceptedCreateRoom'/);assert.match(server,/type:'challengeAcceptedWaiting'/);
});

test('Share Link creation and referral conversion tracking are exposed only by Friendly Play With Friend',()=>{
  assert.match(client,/id="freeShareLink"/);assert.match(client,/id="freeCopyLinkBtn"/);assert.doesNotMatch(client,/id="competitiveShareLink"/);assert.doesNotMatch(client,/id="competitiveCopyLinkBtn"/);
  assert.match(client,/function roomShareUrl\(roomCode,mode,referralToken=''/);assert.match(client,/searchParams\.set\('room'/);assert.match(client,/searchParams\.set\('mode',mode==='free'\?'free':'competitive'\)/);assert.match(client,/if\(\/\^\[a-f0-9\]\{64\}\$\/i\.test\(String\(referralToken\|\|''\)\)\)url\.searchParams\.set\('ref',referralToken\)/);
  assert.match(client,/async function showRoomShareLink\(roomCode,mode\)\{\s*if\(mode!=='free'\)return/);assert.match(client,/let referralToken='';if\(account\)/);assert.match(client,/\/api\/referrals\/create/);
  assert.match(client,/event\.detail\?\.adapter\?\.anonymous!==true\)return/);assert.match(client,/showRoomShareLink\(roomCode,'free'\)/);assert.match(app,/async joinFreeRoom\(roomCode\)/);
});

test('Copy Link confirms success with a transient Link Copied dialog for 1.5 seconds',()=>{
  assert.match(client,/linkCopiedDialog\.id='linkCopiedDialog'/);assert.match(client,/<h2>Link Copied<\/h2>/);
  const copied=client.slice(client.indexOf('function showLinkCopiedDialog'),client.indexOf('async function shareFriendlyInvite'));
  assert.match(copied,/navigator\.clipboard\.writeText\(link\.href\);showLinkCopiedDialog\(\)/);
  assert.match(copied,/setTimeout\(\(\)=>\{[^]*linkCopiedDialog\.close\(\);\},1500\)/);
});


test('Free Play With Friend is link-only with no manual Room ID join controls',()=>{
  assert.match(client,/id="freeCreateRoomBtn"[^>]*>Create Room \/ Share Link</);
  assert.match(client,/id="freeShareLinkBox"/);assert.match(client,/id="freeCopyLinkBtn"[^>]*>Copy Link</);
  assert.doesNotMatch(client,/id="freeJoinForm"/);assert.doesNotMatch(client,/id="freeRoomCode"/);assert.doesNotMatch(client,/id="freeJoinBtn"/);
  assert.doesNotMatch(client,/gostop-free-online-join/);
  const freeCreate=app.slice(app.indexOf("addEventListener('gostop-free-online-create'"),app.indexOf("if(typeof globalThis.CustomEvent"));
  assert.match(freeCreate,/t\('waitingForOpponent'\)/);assert.doesNotMatch(freeCreate,/shareRoomCode/);assert.doesNotMatch(freeCreate,/gostop-free-online-join/);
  const begin=app.slice(app.indexOf('const beginOnline=async'),app.indexOf("addEventListener('gostop-online-snapshot'"));
  assert.match(begin,/anonymous\?t\('waitingForOpponent'\):t\('roomWaitingConnection'/);
  assert.match(begin,/anonymous\?t\('waitingForOpponent'\):t\('roomWaitingOpponent'/);
});

test('active Competitive game can continue on a second device and reconnect countdown is conditional',()=>{
  const flow=client.slice(client.indexOf('async function settleInitialReconnectDecision'),client.indexOf('function clearVerificationTokenFromUrl'));
  assert.match(flow,/\['solo','online'\]\.includes\(mode\)/);
  assert.match(flow,/activeElsewhere=active\?\.connected===true/);
  assert.match(flow,/reconnecting=active\?\.connected===false&&reconnectUntil>Date\.now\(\)/);
  assert.match(flow,/joinCompetitiveRoom\(active\.roomCode,\{resumeExisting:true\}\)/);
  assert.match(flow,/returnGameCountdown'\)\.hidden=!activeReconnectPending\(\)/);
  assert.match(flow,/if\(activeReconnectPending\(\)\)void finishReconnectAsAbandonment\(\);else/);
});

test('Competitive direct link lets a guest play first while logged-in invitees stay Competitive',()=>{
  assert.match(client,/inviteMode=inviteUrl\.searchParams\.get\('mode'\)==='free'\?'free':'competitive'/);
  const invite=client.slice(client.indexOf('async function launchInviteRoom'),client.indexOf('globalThis.GoStopRanked'));
  assert.match(invite,/if\(inviteMode==='free'\)[^]*joinFreeRoom\(code\)/);
  assert.match(invite,/if\(!account\)\{[^]*writeFriendlyReferralContext[^]*joinGuestCompetitiveRoom\(code\)/);
  assert.match(invite,/joinCompetitiveRoom\(code\)/);assert.doesNotMatch(invite,/requireAccount\(/);
  const guestJoin=app.slice(app.indexOf('async joinGuestCompetitiveRoom'),app.indexOf('async createFreeRoom'));
  assert.match(guestJoin,/OnlineSessionAdapter\(\{anonymous:true\}\)/);assert.match(guestJoin,/adapter\.join\(code\)/);assert.match(guestJoin,/beginOnline\(room,\{anonymous:true,statusElement:onlineStatus,adapter\}\)/);
});

test('same-account tabs are excluded and fresh tab-aware clients supersede legacy lobby residue',()=>{
  assert.match(server,/id===client\.account\.id/);assert.match(server,/accountTwoPlayerBusy\(id\)/);
  assert.match(server,/effectiveClientsForAccount\(accountId\)/);
  assert.match(server,/freshModern\.length\?clients\.filter\(client=>client\.tabId\):clients/);
  assert.match(server,/this\.effectiveClientsForAccount\(accountId\)\.some\(client=>!!client\.twoPlayer&&this\.clientPresence\(client\)\.heartbeatFresh\)/);
});

test('Competitive Solo handoff route ends authoritative Solo session before multiplayer acceptance',()=>{
  const worker=fs.readFileSync(new URL('../server/worker.mjs',import.meta.url),'utf8');
  const gameRoom=fs.readFileSync(new URL('../server/game-room.mjs',import.meta.url),'utf8');
  const rankedRoom=fs.readFileSync(new URL('../server/ranked-room-core.mjs',import.meta.url),'utf8');
  assert.match(worker,/\/api\/solo\/leave-for-challenge/);assert.match(worker,/leave-solo-for-challenge/);assert.match(gameRoom,/url\.pathname==='\/leave-solo-for-challenge'/);
  assert.match(rankedRoom,/async leaveSoloForChallenge\(accountId\)/);assert.match(rankedRoom,/endRankedSession\('accepted-multiplayer-challenge'\)/);
  const handoff=rankedRoom.slice(rankedRoom.indexOf('async leaveSoloForChallenge'),rankedRoom.indexOf('async join',rankedRoom.indexOf('async leaveSoloForChallenge')));
  assert.doesNotMatch(handoff,/force-quit|abandon\(/);
});


test('frontend cache versions advance after Friendly referral and boot-screen fixes',()=>{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/i18n\.js\?v=20260925-5/);
  assert.match(index,/styles\.css\?v=20260925-2/);
  assert.match(index,/game-engine\.js\?v=20260925-2/);
  assert.match(index,/ranked-client\.js\?v=20260925-26/);
  assert.match(index,/online-client\.js\?v=20260925-4/);
  assert.match(index,/app\.js\?v=20260925-12/);
  assert.match(index,/presentation-plan\.js\?v=20260925-20/);
  assert.match(index,/diagnostics\.js\?v=20260925-2/);
  assert.match(index,/data-i18n="opponentEnded">Session Ended</);
});

test('production browser REST calls use same-origin while lobby WebSocket remains direct',()=>{
  const client=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
  assert.match(client,/productionSameOriginRest/);
  assert.match(client,/location\.origin/);
  assert.match(client,/\/api\/lobby\/ws/);
});
