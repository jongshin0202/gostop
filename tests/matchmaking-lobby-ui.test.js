import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/lobby.mjs',import.meta.url),'utf8');

test('Competitive Online Play renders a live skill-matchmaking lobby',()=>{
  assert.match(client,/id="autoMatchBtn"/);
  assert.match(client,/id="autoMatchCancelBtn"/);
  assert.match(client,/id="onlinePlayerCount"/);
  assert.match(client,/Coins earned per game is weighted most heavily/);
  const render=client.slice(client.indexOf('function renderPlayers'),client.indexOf('function handleLobbyMessage'));
  assert.match(render,/player\.similarity/);
  assert.match(render,/player\.coinsPerGame\?\?player\.score/);
  assert.match(render,/player\.gamesPlayed/);
  assert.match(render,/player\.walletCoins/);
});

test('Search reconnects instead of silently doing nothing when the lobby socket is not open',()=>{
  const transport=client.slice(client.indexOf('function connectLobby'),client.indexOf('function renderPlayers'));
  assert.match(transport,/function sendLobbyMessage\(message,statusKey='lobbyConnecting'\)/);
  assert.match(transport,/pendingLobbyMessage=message/);
  assert.match(transport,/connectLobby\(\)/);
  const search=client.slice(client.indexOf("\$('onlineNicknameSearchBtn').addEventListener"),client.indexOf("\$('onlineInviteEmailBtn').addEventListener"));
  assert.match(search,/searchingOnline/);
  assert.match(search,/sendLobbyMessage\(query\?\{type:'search',query\}:\{type:'recommendations'\}/);
});

test('logged-in browsers keep global presence while gameplay activity controls availability',()=>{
  assert.match(client,/function ensureLobbyPresence\(\)/);
  assert.match(client,/function desiredLobbyAvailability\(\)\{return !!account&&!playerActivityActive&&!account\?\.activeRanked\?\.roomCode;\}/);
  assert.match(client,/function saveSession\([^]*ensureLobbyPresence\(\)/);
  assert.match(client,/async function refreshAccount\([^]*ensureLobbyPresence\(\)/);
  assert.match(client,/gostop-player-activity/);
  assert.match(client,/playerActivityActive=!!event\.detail\?\.active;syncLobbyAvailability\(\)/);
  const entry=client.slice(client.indexOf("onlinePlay.addEventListener"),client.indexOf("freeFriendBtn.addEventListener"));
  assert.doesNotMatch(entry,/onlineLobbyClose[^]*closeLobby\(\)/);
  assert.match(entry,/onlineLobbyClose[^]*autoMatchCancel/);
});

test('server pushes live recommendations when presence changes',()=>{
  assert.match(server,/async broadcastRecommendations\(\)/);
  assert.match(server,/type:'recommendations'/);
  assert.match(server,/message\.type==='setAvailability'[^]*await this\.broadcastRecommendations\(\)/);
  assert.match(server,/async disconnect\(socket\)[^]*await this\.broadcastRecommendations\(\)/);
  assert.match(server,/const query=String\(client\.searchQuery\|\|''\)\.trim\(\)/);
  assert.match(server,/type:query\?'searchResults':'recommendations'/);
});

test('Auto Match selects the closest available online player and uses the existing authoritative room handoff',()=>{
  assert.match(client,/type:'autoMatchStart'/);
  assert.match(client,/type:'autoMatchCancel'/);
  assert.match(server,/candidateClients\(client,\{includeAutoMatching:true\}\)/);
  assert.doesNotMatch(server,/candidateClients\(client,\{autoOnly:true\}\)/);
  assert.match(server,/createAcceptedMatch\(client,partner,rows,\{automatic:true\}\)/);
  assert.match(server,/type:'challengeAcceptedCreateRoom'/);
  assert.match(server,/type:'challengeAcceptedWaiting'/);
});


test('game code publishes presence activity for local and authoritative games',()=>{
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/function publishPlayerActivity\(active,mode=''\)/);
  assert.match(app,/launchLocalGame\(training=false\)[^]*publishPlayerActivity\(true,training\?'training':'free-solo'\)/);
  assert.match(app,/cancelLocalGamePresentation\(\)[^]*publishPlayerActivity\(false,'menu'\)/);
  assert.match(app,/beginOnline=async[^]*publishPlayerActivity\(true,anonymous\?'free-friend':'competitive-online'\)/);
  assert.match(app,/returnOnlineToMenu\(\)[^]*publishPlayerActivity\(false,'menu'\)/);
});
