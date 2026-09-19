import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/lobby.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Competitive Online Play offers Auto Match, Browse Top 10, nickname Search, and skill details',()=>{
  assert.match(client,/id="autoMatchBtn"/);
  assert.match(client,/id="browsePlayersBtn"/);
  assert.match(client,/Browse Top 10/);
  assert.match(client,/id="onlineNicknameSearchBtn"/);
  assert.match(client,/id="onlinePlayerCount"/);
  const render=client.slice(client.indexOf('function renderPlayers'),client.indexOf('function handleLobbyMessage'));
  assert.match(render,/player\.similarity/);
  assert.match(render,/player\.coinsPerGame\?\?player\.score/);
  assert.match(render,/player\.gamesPlayed/);
  assert.match(render,/player\.walletCoins/);
  assert.match(server,/const MAX_LOBBY_RESULTS=10/);
});

test('Browse Top 10 is opt-in and the list stays hidden until Browse or Search is selected',()=>{
  assert.match(client,/recommendedPlayers" class="online-player-list" hidden/);
  const render=client.slice(client.indexOf('function renderLobbyPresence'),client.indexOf('function connectLobby'));
  assert.match(render,/list\.hidden=!\(browsePlayersActive\|\|lobbySearchActive\)/);
  const browse=client.slice(client.indexOf("\$('browsePlayersBtn').addEventListener"),client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"));
  assert.match(browse,/browsePlayersActive=true/);
  assert.match(browse,/lobbySearchActive=false/);
  assert.match(browse,/type:'recommendations'/);
});

test('Search reconnects instead of silently doing nothing when the lobby socket is not open',()=>{
  const transport=client.slice(client.indexOf('function connectLobby'),client.indexOf('function renderPlayers'));
  assert.match(transport,/function sendLobbyMessage\(message,statusKey='lobbyConnecting'\)/);
  assert.match(transport,/pendingLobbyMessage=message/);
  assert.match(transport,/connectLobby\(\)/);
  const search=client.slice(client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"),client.indexOf("\$('autoMatchBtn').addEventListener"));
  assert.match(search,/searchingOnline/);
  assert.match(search,/sendLobbyMessage\(query\?\{type:'search',query\}:\{type:'recommendations'\}/);
});

test('presence distinguishes two-player busy state from Solo and Training activity',()=>{
  assert.match(client,/function desiredLobbyAvailability\(\)\{return !!account&&!playerTwoPlayerActive&&account\?\.activeRanked\?\.mode!=='online';\}/);
  assert.match(client,/twoPlayer:playerTwoPlayerActive\|\|account\?\.activeRanked\?\.mode==='online'/);
  assert.match(client,/gostop-player-activity/);
  assert.match(client,/playerTwoPlayerActive=!!event\.detail\?\.twoPlayer/);
  assert.match(app,/function publishPlayerActivity\(active,mode='',twoPlayer=false\)/);
  assert.match(app,/publishPlayerActivity\(true,training\?'training':'free-solo',false\)/);
  assert.match(app,/const twoPlayer=!!anonymous\|\|room\?\.rankedMode!=='solo'/);
});

test('incoming player request is a Yes No dialog and acceptance prepares Solo modes before responding',()=>{
  assert.match(client,/id="requestAccept"[^>]*>Yes</);
  assert.match(client,/id="requestDecline"[^>]*>No</);
  assert.match(client,/prepareToAcceptMultiplayerChallenge/);
  assert.match(client,/\/api\/solo\/leave-for-challenge/);
  assert.match(client,/GoStopGameBridge\?\.prepareForMultiplayerChallenge/);
  assert.match(client,/challengeResponse',requestId:request\.requestId,accept:true/);
  assert.match(app,/prepareForMultiplayerChallenge\(\)/);
  assert.match(app,/if\(isTwoPlayerOnline\)return false/);
  assert.match(app,/if\(onlineMode\)returnOnlineToMenu\(\)/);
  assert.match(app,/else if\(localGameActive\)\{cancelLocalGamePresentation\(\)/);
});

test('Auto Match chooses a target but still routes through the same request acceptance flow',()=>{
  assert.match(client,/type:'autoMatchStart'/);
  assert.match(server,/startChallenge\(client,partner,rows,\{automatic:true\}\)/);
  assert.match(server,/type:'playRequest'/);
  assert.match(server,/message\.type==='challengeResponse'/);
  assert.match(server,/type:'challengeAcceptedCreateRoom'/);
  assert.match(server,/type:'challengeAcceptedWaiting'/);
});

test('same-account tabs are excluded and any two-player tab makes that account busy',()=>{
  assert.match(server,/id===client\.account\.id/);
  assert.match(server,/accountTwoPlayerBusy\(id\)/);
  assert.match(server,/this\.clientsForAccount\(accountId\)\.some\(client=>!!client\.twoPlayer\)/);
});
