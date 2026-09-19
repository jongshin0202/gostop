import test from 'node:test';
import assert from 'node:assert/strict';
import {Lobby,distance,similarityPercent,MATCH_WEIGHTS,MAX_LOBBY_RESULTS} from '../server/lobby.mjs';

const socket=()=>({messages:[],send(data){this.messages.push(JSON.parse(data));}});
const account=(id,nickname,walletCoins)=>({id,nickname,walletCoins,countryCode:'US'});
const client=(id,nickname,walletCoins,{available=true,twoPlayer=false,autoMatching=false}={})=>({socket:socket(),account:account(id,nickname,walletCoins),available,twoPlayer,autoMatching,searchQuery:''});
const rowsFor=entries=>new Map(entries.map(([nickname,score,gamesPlayed,totalCoins,rank])=>[
  nickname.toLowerCase(),
  {nickname,score,gamesPlayed,totalCoins,rank,provisional:gamesPlayed<10,countryCode:'US'}
]));
const makeLobby=rows=>{
  const lobby=new Lobby({}, {ACCOUNT_STORE:null});
  lobby.crypto={getRandomValues(data){data.fill(1);return data;}};
  lobby.leaderboardRows=async()=>rows;
  return lobby;
};
const add=(lobby,...clients)=>{for(const item of clients)lobby.clients.set(item.socket,item);};

test('matchmaking weights coins earned per game most heavily',()=>{
  assert.deepEqual(MATCH_WEIGHTS,{coinsPerGame:.60,gamesPlayed:.25,walletCoins:.15});
  const me={coinsPerGame:10,gamesPlayed:100,walletCoins:1000};
  const rateGap={coinsPerGame:5,gamesPlayed:100,walletCoins:1000};
  const gamesGap={coinsPerGame:10,gamesPlayed:50,walletCoins:1000};
  const walletGap={coinsPerGame:10,gamesPlayed:100,walletCoins:500};
  assert.ok(distance(me,rateGap)>distance(me,gamesGap));
  assert.ok(distance(me,gamesGap)>distance(me,walletGap));
});

test('matchmaking distance prefers closer skill and remains symmetric and finite',()=>{
  const me={coinsPerGame:8,gamesPlayed:40,walletCoins:320};
  const close={coinsPerGame:8.5,gamesPlayed:42,walletCoins:300};
  const far={coinsPerGame:20,gamesPlayed:4,walletCoins:-500};
  assert.ok(distance(me,close)<distance(me,far));
  assert.equal(distance(me,close),distance(close,me));
  assert.ok(Number.isFinite(distance({coinsPerGame:0,gamesPlayed:0,walletCoins:-20},{coinsPerGame:0,gamesPlayed:0,walletCoins:0})));
  assert.ok(similarityPercent(me,close)>similarityPercent(me,far));
});

test('Browse Top 10 returns at most ten challengeable players ordered by skill similarity',async()=>{
  const entries=[['Jong',10,100,1000,1]];
  for(let i=1;i<=12;i++)entries.push([`Player${i}`,10+i*.2,100-i,1000-i*5,i+1]);
  const rows=rowsFor(entries),lobby=makeLobby(rows),me=client('me','Jong',1000);
  const others=entries.slice(1).map(([nickname],index)=>client(`p${index+1}`,nickname,1000-index*5));
  add(lobby,me,...others);
  const recommendations=await lobby.recommendations(me);
  assert.equal(MAX_LOBBY_RESULTS,10);
  assert.equal(recommendations.length,10);
  for(let i=1;i<recommendations.length;i++)assert.ok(recommendations[i-1].similarity>=recommendations[i].similarity);
});

test('Solo and Training-style presence remains challengeable while any two-player presence blocks the account',async()=>{
  const rows=rowsFor([
    ['Jong',10,100,1000,1],['SoloPlayer',10.1,98,990,2],['FreeTwoPlayer',10.2,97,980,3],['OtherTab',10.2,97,980,4]
  ]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),solo=client('solo','SoloPlayer',990,{available:true,twoPlayer:false});
  const freeTwo=client('busy','FreeTwoPlayer',980,{available:false,twoPlayer:true});
  const sameBusyAccountOtherTab=client('busy','OtherTab',980,{available:true,twoPlayer:false});
  add(lobby,me,solo,freeTwo,sameBusyAccountOtherTab);
  const names=(await lobby.recommendations(me)).map(player=>player.nickname);
  assert.deepEqual(names,['SoloPlayer']);
  assert.equal(lobby.accountTwoPlayerBusy('busy'),true);
});

test('nickname search returns currently challengeable players and preserves exact-name priority',async()=>{
  const rows=rowsFor([
    ['Jong',8,40,320,1],['Sonogong',8.1,42,340,2],['Sonogong2',8.05,41,330,3],['SonogongBusy',8,40,320,4]
  ]);
  const lobby=makeLobby(rows),me=client('me','Jong',320),exact=client('exact','Sonogong',340),partial=client('partial','Sonogong2',330),busy=client('busy','SonogongBusy',320,{available:false,twoPlayer:true});
  add(lobby,me,exact,partial,busy);
  const result=await lobby.search(me,'sonogong');
  assert.deepEqual(result.map(player=>player.nickname),['Sonogong','Sonogong2']);
});

test('manual player selection sends a Yes/No play request rather than starting a game immediately',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.2,102,1040,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),target=client('target','Sonogong',1040);
  add(lobby,me,target);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'target'}));
  const sent=me.socket.messages.find(message=>message.type==='challengeSent');
  const request=target.socket.messages.find(message=>message.type==='playRequest');
  assert.ok(sent?.requestId);
  assert.equal(request?.requestId,sent.requestId);
  assert.equal(request?.from?.nickname,'Jong');
  assert.equal(me.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'),false);
});

test('Auto Match requests the closest available skill match and still requires that player to accept',async()=>{
  const rows=rowsFor([
    ['Jong',10,100,1000,1],['Closest',10.01,100,1002,2],['Near',10.2,102,1040,3],['Far',30,5,150,4]
  ]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000,{autoMatching:true}),closest=client('closest','Closest',1002),near=client('near','Near',1020),far=client('far','Far',150);
  add(lobby,me,closest,near,far);
  assert.equal(await lobby.tryAutoMatch(me),true);
  const sent=me.socket.messages.find(message=>message.type==='challengeSent');
  const request=closest.socket.messages.find(message=>message.type==='playRequest');
  assert.equal(sent?.automatic,true);
  assert.equal(sent?.to?.nickname,'Closest');
  assert.equal(request?.automatic,true);
  assert.equal(me.available,true);
  assert.equal(closest.available,true);
  assert.equal(me.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'),false);

  await lobby.handle(closest,JSON.stringify({type:'challengeResponse',requestId:sent.requestId,accept:true}));
  assert.equal(me.available,false);
  assert.equal(closest.available,false);
  assert.equal(me.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'),true);
  assert.equal(closest.socket.messages.some(message=>message.type==='challengeAcceptedWaiting'),true);
});

test('Auto Match waiting wakes automatically when a challengeable player becomes available',async()=>{
  const rows=rowsFor([['Jong',10,10,100,1],['Sonogong',10.1,11,110,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',100,{autoMatching:true}),other=client('other','Sonogong',110,{available:false,twoPlayer:false});
  add(lobby,me,other);
  assert.equal(await lobby.tryAutoMatch(me),false);
  assert.ok(me.socket.messages.some(message=>message.type==='autoMatchWaiting'));

  await lobby.handle(other,JSON.stringify({type:'setAvailability',available:true,twoPlayer:false}));
  assert.ok(other.socket.messages.some(message=>message.type==='playRequest'));
  assert.ok(me.socket.messages.some(message=>message.type==='challengeSent'));
});

test('a pending request is cancelled if either player enters a two-player game before answering',async()=>{
  const rows=rowsFor([['Jong',10,10,100,1],['Sonogong',10,10,100,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',100),other=client('other','Sonogong',100);
  add(lobby,me,other);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'other'}));
  const request=other.socket.messages.find(message=>message.type==='playRequest');
  assert.ok(request);
  await lobby.handle(other,JSON.stringify({type:'setAvailability',available:false,twoPlayer:true}));
  assert.equal(lobby.challenges.has(request.requestId),false);
  assert.ok(me.socket.messages.some(message=>message.type==='challengeCancelled'&&message.requestId===request.requestId));
});
