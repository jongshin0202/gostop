import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AccountStore} from '../server/account-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const store=()=>new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:globalThis.crypto,now:()=> '2026-09-22T14:00:00.000Z'});
const req=(path,{method='POST',body,token}={})=>new Request('https://accounts'+path,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
async function register(accountStore,email,nickname){
  const response=await accountStore.fetch(req('/register',{body:{email,nickname,password:'BetterPass9',confirmPassword:'BetterPass9'}}));assert.equal(response.status,201);return response.json();
}
async function social(accountStore,token){const response=await accountStore.fetch(req('/social',{method:'GET',token}));assert.equal(response.status,200);return response.json();}
async function action(accountStore,path,token,body){const response=await accountStore.fetch(req(path,{token,body}));assert.equal(response.status,200);return response.json();}
async function settle(accountStore,gameId,a,b,winner=a){
  const response=await accountStore.fetch(req('/internal/game/settle',{body:{gameId,mode:'online',winnerPlayerId:'p-'+winner.account.id,finalPoints:3,participants:[
    {accountId:a.account.id,playerId:'p-'+a.account.id,nickname:a.account.nickname,won:winner.account.id===a.account.id,walletDelta:winner.account.id===a.account.id?3:-3,coinsWon:winner.account.id===a.account.id?3:0,points:winner.account.id===a.account.id?3:0,milestones:{}},
    {accountId:b.account.id,playerId:'p-'+b.account.id,nickname:b.account.nickname,won:winner.account.id===b.account.id,walletDelta:winner.account.id===b.account.id?3:-3,coinsWon:winner.account.id===b.account.id?3:0,points:winner.account.id===b.account.id?3:0,milestones:{}}
  ],recordedAt:'2026-09-22T13:30:00.000Z'}}));assert.equal(response.status,200);
}

test('Friend Requests are mutual only after acceptance and unfriend removes both sides',async()=>{
  const db=store(),jong=await register(db,'jong-friends@example.com','JongFriends'),son=await register(db,'son-friends@example.com','SonFriends');
  let result=await action(db,'/social/request',jong.session.token,{accountId:son.account.id});assert.equal(result.state,'outgoing');
  let jongSocial=await social(db,jong.session.token),sonSocial=await social(db,son.session.token);
  assert.equal(jongSocial.outgoing.length,1);assert.equal(jongSocial.outgoing[0].accountId,son.account.id);assert.equal(sonSocial.incoming.length,1);assert.equal(sonSocial.incoming[0].accountId,jong.account.id);
  result=await action(db,'/social/respond',son.session.token,{accountId:jong.account.id,accept:true});assert.equal(result.state,'friend');
  jongSocial=await social(db,jong.session.token);sonSocial=await social(db,son.session.token);assert.equal(jongSocial.friends[0].accountId,son.account.id);assert.equal(sonSocial.friends[0].accountId,jong.account.id);assert.equal(jongSocial.outgoing.length,0);assert.equal(sonSocial.incoming.length,0);
  await action(db,'/social/unfriend',jong.session.token,{accountId:son.account.id});jongSocial=await social(db,jong.session.token);sonSocial=await social(db,son.session.token);assert.equal(jongSocial.friends.length,0);assert.equal(sonSocial.friends.length,0);
});

test('crossed Friend Requests auto-accept and decline/cancel remove pending state',async()=>{
  const db=store(),a=await register(db,'cross-a@example.com','CrossA'),b=await register(db,'cross-b@example.com','CrossB'),c=await register(db,'cross-c@example.com','CrossC');
  await action(db,'/social/request',a.session.token,{accountId:b.account.id});const auto=await action(db,'/social/request',b.session.token,{accountId:a.account.id});assert.equal(auto.state,'friend');assert.equal(auto.autoAccepted,true);
  await action(db,'/social/request',a.session.token,{accountId:c.account.id});await action(db,'/social/unfriend',a.session.token,{accountId:c.account.id});assert.equal((await social(db,c.session.token)).incoming.length,0);
  await action(db,'/social/request',c.session.token,{accountId:a.account.id});await action(db,'/social/respond',a.session.token,{accountId:c.account.id,accept:false});assert.equal((await social(db,c.session.token)).outgoing.length,0);
});

test('played-player History aggregates head-to-head data and drives Friend recommendations',async()=>{
  const db=store(),a=await register(db,'history-a@example.com','HistoryA'),b=await register(db,'history-b@example.com','HistoryB'),c=await register(db,'history-c@example.com','HistoryC');
  await settle(db,'history-game-1',a,b,a);await settle(db,'history-game-2',a,b,b);
  const snapshot=await social(db,a.session.token),history=snapshot.history.find(item=>item.accountId===b.account.id),recommended=snapshot.recommendations.find(item=>item.accountId===b.account.id);
  assert.ok(history);assert.equal(history.gamesPlayedTogether,2);assert.equal(history.wins,1);assert.equal(history.losses,1);assert.equal(history.friendState,'none');
  assert.ok(recommended);assert.equal(recommended.playedTogether,2);assert.match(recommended.reason,/Played 2 games together/);
  assert.ok(snapshot.recommendations.some(item=>item.accountId===c.account.id));
});

test('Search returns registered players with their current friendship state',async()=>{
  const db=store(),a=await register(db,'search-a@example.com','SearchAlpha'),b=await register(db,'search-b@example.com','SearchBravo');
  let response=await db.fetch(req('/social/search',{token:a.session.token,body:{query:'Bravo'}}));assert.equal(response.status,200);let data=await response.json();assert.equal(data.players.length,1);assert.equal(data.players[0].accountId,b.account.id);assert.equal(data.players[0].friendState,'none');
  await action(db,'/social/request',a.session.token,{accountId:b.account.id});response=await db.fetch(req('/social/search',{token:a.session.token,body:{query:'Bravo'}}));data=await response.json();assert.equal(data.players[0].friendState,'outgoing');
});

test('Friends UI exposes Friends, Requests, History, Recommended, Search, Play, Add Friend, and Unfriend',()=>{
  const ranked=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8'),worker=fs.readFileSync(new URL('../server/worker.mjs',import.meta.url),'utf8'),lobby=fs.readFileSync(new URL('../server/lobby.mjs',import.meta.url),'utf8');
  assert.match(ranked,/friendsBtn\.id='friendsMenuBtn'/);assert.match(ranked,/data-social-tab="friends"/);assert.match(ranked,/data-social-tab="requests"/);assert.match(ranked,/data-social-tab="history"/);assert.match(ranked,/data-social-tab="recommendations"/);assert.match(ranked,/data-social-tab="search"/);
  assert.match(ranked,/data-social-action="play"/);assert.match(ranked,/data-social-action="add"/);assert.match(ranked,/data-social-action="unfriend"/);assert.match(ranked,/data-social-action="accept"/);assert.match(ranked,/data-social-action="decline"/);
  assert.match(ranked,/\/api\/social\/request/);assert.match(ranked,/\/api\/social\/respond/);assert.match(ranked,/\/api\/social\/unfriend/);assert.match(ranked,/\/api\/social\/search/);
  assert.match(worker,/\/api\/social/);assert.match(lobby,/message\.type==='socialProfiles'/);assert.match(ranked,/message\.type==='socialProfiles'/);
  assert.match(lobby,/message\.type==='socialChanged'/);assert.match(ranked,/notifySocialChanged\(accountId\)/);assert.match(ranked,/message\.type==='socialChanged'/);assert.match(ranked,/refreshAccount\(\)\.then\(\(\)=>\{if\(!socialScreen\.hidden\)void refreshSocial\(\);\}\)/);
  assert.match(ranked,/Why recommended:/);assert.match(ranked,/People you have played before/);
  assert.match(ranked,/id="registrationAddFriend"/);assert.match(ranked,/id="friendlyInviterFriend"/);assert.match(ranked,/Add .* as Friend/);
});


test('public Player Info returns career, login, session, head-to-head and signed Coin data',async()=>{
  const db=store(),viewer=await register(db,'profile-viewer@example.com','ProfileViewer'),opponent=await register(db,'profile-opponent@example.com','ProfileOpponent');
  let sessionResponse=await db.fetch(req('/internal/session/start',{body:{sessionId:'profile-session-1',mode:'online',accountIds:[viewer.account.id,opponent.account.id],roomCode:'ABCDEFGHJK2345'}}));assert.equal(sessionResponse.status,201);
  await settle(db,'profile-game-1',viewer,opponent,viewer);
  await settle(db,'profile-game-2',viewer,opponent,opponent);
  await action(db,'/internal/session/end',viewer.session.token,{sessionId:'profile-session-1'});
  sessionResponse=await db.fetch(req('/internal/session/start',{body:{sessionId:'profile-session-2',mode:'online',accountIds:[viewer.account.id,opponent.account.id],roomCode:'BCDEFGHJKM2345'}}));assert.equal(sessionResponse.status,201);
  await settle(db,'profile-game-3',viewer,opponent,viewer);
  const response=await db.fetch(req('/player-profile',{token:viewer.session.token,body:{accountId:opponent.account.id}}));assert.equal(response.status,200);const data=await response.json(),player=data.player;
  assert.equal(player.accountId,opponent.account.id);assert.equal(player.nickname,'ProfileOpponent');assert.ok(Number.isInteger(player.globalRank));assert.ok(Number.isInteger(player.monthlyRank));
  assert.equal(player.sessionsPlayed,2);assert.equal(player.gamesPlayed,3);assert.equal(player.wins,1);assert.equal(player.losses,2);assert.ok(player.lastLoginAt);
  assert.equal(player.headToHead.sessionsPlayedTogether,2);assert.equal(player.headToHead.gamesPlayedTogether,3);assert.equal(player.headToHead.wins,2);assert.equal(player.headToHead.losses,1);assert.equal(player.headToHead.netCoins,3);
  assert.equal(typeof player.walletCoins,'number');
  const board=await (await db.fetch(req('/leaderboards',{method:'GET'}))).json();assert.equal(board.global.find(row=>row.nickname==='ProfileOpponent').accountId,opponent.account.id);assert.equal(board.monthly.find(row=>row.nickname==='ProfileOpponent').accountId,opponent.account.id);
});

test('Friends request confirmation and reusable clickable Player Info are wired through all major nickname surfaces',()=>{
  const ranked=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8'),worker=fs.readFileSync(new URL('../server/worker.mjs',import.meta.url),'utf8'),accountStore=fs.readFileSync(new URL('../server/account-store.mjs',import.meta.url),'utf8');
  assert.match(ranked,/Friend Request Sent/);assert.match(ranked,/showFriendRequestSentDialog\(nickname\)/);assert.match(ranked,/result\?\.state==='outgoing'/);
  assert.match(ranked,/playerInfoDialog/);assert.match(ranked,/\/api\/player-profile/);assert.match(ranked,/data-player-info-account-id/);assert.match(ranked,/player-nickname-link/);
  for(const label of ['Global Rank','Monthly Rank','Sessions Played','Games Played','Games Won','Games Lost','Last Logged In','Sessions With You','Games With You','Your Wins','Your Losses','Coins vs This Player','Wallet Coins'])assert.match(ranked,new RegExp(label));
  assert.match(ranked,/playerInfoDialog\.addEventListener\('click',closePlayerInfoDialog\)/);assert.match(ranked,/playerInfoOk'\)\.addEventListener\('click',closePlayerInfoDialog\)/);
  assert.match(ranked,/renderLeaderboard\(\)/);assert.match(ranked,/playerNicknameHtml\(row\)/);assert.match(ranked,/playerNicknameHtml\(p\)/);assert.match(ranked,/playerNicknameHtml\(player\)/);assert.match(ranked,/humanName\.innerHTML=playerNicknameHtml/);assert.match(ranked,/opponentName\.innerHTML=.*playerNicknameHtml/);
  assert.match(worker,/\/api\/player-profile/);assert.match(accountStore,/async playerProfile\(request\)/);assert.match(accountStore,/async playerSessionCounts/);assert.match(accountStore,/async playerLastLoginAt/);
});

test('unfriend confirmation uses an in-app dialog instead of blocking browser confirm',()=>{
  assert.match(rankedSource,/const unfriendConfirmDialog=document\.createElement\('dialog'\)/);
  assert.match(rankedSource,/function confirmUnfriend\(nickname\)/);
  assert.match(rankedSource,/await confirmUnfriend\(nickname\)/);
  assert.doesNotMatch(rankedSource,/globalThis\.confirm\s*\(/);
});
