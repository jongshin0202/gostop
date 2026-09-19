import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/lobby.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Competitive Online Play offers Auto Match, Browse Top 10, nickname Search, and skill details',()=>{
  assert.match(client,/id="autoMatchBtn"/);assert.match(client,/id="browsePlayersBtn"/);assert.match(client,/Browse Top 10/);
  assert.match(client,/id="onlineNicknameSearchBtn"/);assert.match(client,/id="onlinePlayerCount"/);assert.match(server,/const MAX_LOBBY_RESULTS=10/);
  const render=client.slice(client.indexOf('function playerStatusText'),client.indexOf('function handleLobbyMessage'));
  assert.match(render,/player\.similarity/);assert.match(render,/player\.walletCoins/);assert.match(render,/player\.wins/);assert.match(render,/player\.losses/);assert.match(render,/leaderboardScore/);assert.match(render,/leaderboardRank/);
});

test('Search is a player directory lookup and returns profile status even when player is offline or busy',()=>{
  assert.match(server,/async directorySearch\(query\)/);
  assert.match(server,/\/internal\/player-search/);
  const search=server.slice(server.indexOf('async search(client,query'),server.indexOf('async broadcastRecommendations'));
  assert.match(search,/await this\.directorySearch\(query\)/);assert.match(search,/this\.presenceForAccount\(player\.accountId\)/);
  assert.match(server,/status:'offline'/);assert.match(server,/status:'in-game'/);assert.match(server,/mode==='competitive-solo'\?'competitive-solo'/);
  const render=client.slice(client.indexOf('function playerStatusText'),client.indexOf('function handleLobbyMessage'));
  assert.match(render,/statusOffline/);assert.match(render,/statusInGame/);assert.match(render,/data-challengeable/);
});

test('Browse Top 10 is opt-in and the list stays hidden until Browse or Search is selected',()=>{
  assert.match(client,/recommendedPlayers" class="online-player-list" hidden/);
  const render=client.slice(client.indexOf('function renderLobbyPresence'),client.indexOf('function connectLobby'));
  assert.match(render,/list\.hidden=!\(browsePlayersActive\|\|lobbySearchActive\)/);
  const browse=client.slice(client.indexOf("\$('browsePlayersBtn').addEventListener"),client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"));
  assert.match(browse,/browsePlayersActive=true/);assert.match(browse,/lobbySearchActive=false/);assert.match(browse,/type:'recommendations'/);
});

test('Search reconnects instead of silently doing nothing when lobby socket is not open',()=>{
  const transport=client.slice(client.indexOf('function connectLobby'),client.indexOf('function playerStatusText'));
  assert.match(transport,/function sendLobbyMessage\(message,statusKey='lobbyConnecting'\)/);assert.match(transport,/pendingLobbyMessage=message/);assert.match(transport,/connectLobby\(\)/);
  const search=client.slice(client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"),client.indexOf("\$('autoMatchBtn').addEventListener"));
  assert.match(search,/searchingOnline/);assert.match(search,/sendLobbyMessage\(query\?\{type:'search',query\}:\{type:'recommendations'\}/);
});

test('presence distinguishes two-player busy state from Solo and Training activity and publishes exact mode',()=>{
  assert.match(client,/function desiredLobbyAvailability\(\)\{return !!account&&!playerTwoPlayerActive&&account\?\.activeRanked\?\.mode!=='online';\}/);
  assert.match(client,/twoPlayer:playerTwoPlayerActive\|\|account\?\.activeRanked\?\.mode==='online',mode:playerPresenceMode/);
  assert.match(client,/playerPresenceMode=String\(event\.detail\?\.mode\|\|'menu'\)/);
  assert.match(app,/function publishPlayerActivity\(active,mode='',twoPlayer=false\)/);assert.match(app,/publishPlayerActivity\(true,training\?'training':'free-solo',false\)/);
  assert.match(app,/const twoPlayer=!!anonymous\|\|room\?\.rankedMode!=='solo'/);
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
  assert.match(server,/challenge\.status='room-ready'/);assert.match(server,/message\.type==='challengeJoined'/);assert.match(server,/type:'challengeRoomHandoffComplete'/);
});

test('Auto Match chooses a target but still routes through same request acceptance flow',()=>{
  assert.match(client,/type:'autoMatchStart'/);assert.match(server,/startChallenge\(client,partner,rows,\{automatic:true\}\)/);
  assert.match(server,/type:'playRequest'/);assert.match(server,/message\.type==='challengeResponse'/);assert.match(server,/type:'challengeAcceptedCreateRoom'/);assert.match(server,/type:'challengeAcceptedWaiting'/);
});

test('Free and Competitive manual rooms expose clickable direct-join share links',()=>{
  assert.match(client,/id="freeShareLink"/);assert.match(client,/id="competitiveShareLink"/);assert.match(client,/id="freeCopyLinkBtn"/);assert.match(client,/id="competitiveCopyLinkBtn"/);
  assert.match(client,/function roomShareUrl\(roomCode,mode\)/);assert.match(client,/searchParams\.set\('room'/);assert.match(client,/searchParams\.set\('mode',mode==='free'\?'free':'competitive'\)/);
  assert.match(client,/function showRoomShareLink\(roomCode,mode\)/);assert.match(client,/navigator\.clipboard\.writeText\(link\.href\)/);
  assert.match(app,/async joinFreeRoom\(roomCode\)/);assert.match(app,/async joinCompetitiveRoom\(roomCode\)/);
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


test('frontend cache versions advance after matchmaking handoff fixes',()=>{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/ranked-client\.js\?v=20260919-18/);
  assert.match(index,/app\.js\?v=20260919-14/);
});
