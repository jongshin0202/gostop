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

test('lobby presence is available only while browsing Competitive Online Play or entering a match',()=>{
  const launch=client.slice(client.indexOf('function launchRankedRoom'),client.indexOf("globalThis.addEventListener?.('gostop-online-launch-settled'"));
  assert.match(launch,/setAvailability',available:false/);
  const entry=client.slice(client.indexOf("onlinePlay.addEventListener"),client.indexOf("freeFriendBtn.addEventListener"));
  assert.match(entry,/setAvailability',available:true/);
  assert.match(entry,/onlineLobbyClose[^]*autoMatchCancel/);
  assert.match(entry,/onlineLobbyClose[^]*setAvailability',available:false/);
});

test('server pushes live recommendations when presence changes',()=>{
  assert.match(server,/async broadcastRecommendations\(\)/);
  assert.match(server,/type:'recommendations'/);
  assert.match(server,/message\.type==='setAvailability'[^]*await this\.broadcastRecommendations\(\)/);
  assert.match(server,/async disconnect\(socket\)[^]*await this\.broadcastRecommendations\(\)/);
});

test('Auto Match is an explicit opt-in queue and uses the existing authoritative room handoff',()=>{
  assert.match(client,/type:'autoMatchStart'/);
  assert.match(client,/type:'autoMatchCancel'/);
  assert.match(server,/candidateClients\(client,\{autoOnly:true\}\)/);
  assert.match(server,/createAcceptedMatch\(client,partner,rows,\{automatic:true\}\)/);
  assert.match(server,/type:'challengeAcceptedCreateRoom'/);
  assert.match(server,/type:'challengeAcceptedWaiting'/);
});
