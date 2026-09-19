import test from 'node:test';
import assert from 'node:assert/strict';
import {Lobby,distance,similarityPercent,MATCH_WEIGHTS} from '../server/lobby.mjs';

const socket=()=>({messages:[],send(data){this.messages.push(JSON.parse(data));}});
const account=(id,nickname,walletCoins)=>({id,nickname,walletCoins,countryCode:'US'});
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

test('live recommendations exclude the same account and order available players by weighted similarity',async()=>{
  const rows=rowsFor([
    ['Jong',10,100,1000,1],
    ['Jong Other Tab',10,100,1000,2],
    ['Close',10.5,98,1029,3],
    ['Medium',13,75,975,4],
    ['Far',25,8,200,5],
    ['Busy',10.1,101,1020,6]
  ]);
  const lobby=makeLobby(rows);
  const me={socket:socket(),account:account('acct-me','Jong',1000),available:true,autoMatching:false};
  const sameAccount={socket:socket(),account:account('acct-me','Jong Other Tab',1000),available:true,autoMatching:false};
  const close={socket:socket(),account:account('acct-close','Close',1010),available:true,autoMatching:false};
  const medium={socket:socket(),account:account('acct-medium','Medium',850),available:true,autoMatching:false};
  const far={socket:socket(),account:account('acct-far','Far',100),available:true,autoMatching:false};
  const busy={socket:socket(),account:account('acct-busy','Busy',1000),available:false,autoMatching:false};
  for(const client of [me,sameAccount,close,medium,far,busy])lobby.clients.set(client.socket,client);

  const recommendations=await lobby.recommendations(me);
  assert.deepEqual(recommendations.map(player=>player.nickname),['Close','Medium','Far']);
  assert.equal(recommendations.some(player=>player.accountId==='acct-me'),false);
  assert.equal(recommendations.some(player=>player.nickname==='Busy'),false);
  assert.ok(recommendations[0].similarity>=recommendations[1].similarity);
  assert.equal(recommendations[0].coinsPerGame,10.5);
  assert.equal(recommendations[0].totalCoinsEarned,1029);
});

test('nickname search only returns currently available players and preserves exact-name priority',async()=>{
  const rows=rowsFor([
    ['Jong',8,40,320,1],
    ['Sonogong',8.1,42,340,2],
    ['Sonogong2',8.05,41,330,3],
    ['SonogongBusy',8,40,320,4]
  ]);
  const lobby=makeLobby(rows);
  const me={socket:socket(),account:account('me','Jong',320),available:true,autoMatching:false};
  const exact={socket:socket(),account:account('exact','Sonogong',340),available:true,autoMatching:false};
  const partial={socket:socket(),account:account('partial','Sonogong2',330),available:true,autoMatching:false};
  const busy={socket:socket(),account:account('busy','SonogongBusy',320),available:false,autoMatching:false};
  for(const client of [me,exact,partial,busy])lobby.clients.set(client.socket,client);

  const result=await lobby.search(me,'sonogong');
  assert.deepEqual(result.map(player=>player.nickname),['Sonogong','Sonogong2']);
});

test('Auto Match pairs with the closest available online player even when only the requester pressed Auto Match',async()=>{
  const rows=rowsFor([
    ['Jong',10,100,1000,1],
    ['Near',10.2,102,1040,2],
    ['Far',30,5,150,3],
    ['Browser',10.01,100,1000,4]
  ]);
  const lobby=makeLobby(rows);
  const me={socket:socket(),account:account('me','Jong',1000),available:true,autoMatching:true};
  const near={socket:socket(),account:account('near','Near',1020),available:true,autoMatching:true};
  const far={socket:socket(),account:account('far','Far',150),available:true,autoMatching:true};
  const browser={socket:socket(),account:account('browser','Browser',1000),available:true,autoMatching:false};
  for(const client of [me,near,far,browser])lobby.clients.set(client.socket,client);

  assert.equal(await lobby.tryAutoMatch(me),true);
  assert.equal(me.available,false);
  assert.equal(browser.available,false);
  assert.equal(me.autoMatching,false);
  assert.equal(browser.autoMatching,false);
  assert.equal(near.available,true);
  assert.equal(far.available,true);

  const creator=me.socket.messages.find(message=>message.type==='challengeAcceptedCreateRoom');
  const waiting=browser.socket.messages.find(message=>message.type==='challengeAcceptedWaiting');
  assert.equal(creator?.automatic,true);
  assert.equal(creator?.opponent?.nickname,'Browser');
  assert.equal(waiting?.opponent?.nickname,'Jong');
});

test('Auto Match waits when no other available online player exists',async()=>{
  const rows=rowsFor([['Jong',10,10,100,1],['Busy',10,10,100,2]]);
  const lobby=makeLobby(rows);
  const me={socket:socket(),account:account('me','Jong',100),available:true,autoMatching:true};
  const busy={socket:socket(),account:account('busy','Busy',100),available:false,autoMatching:false};
  lobby.clients.set(me.socket,me);lobby.clients.set(busy.socket,busy);

  assert.equal(await lobby.tryAutoMatch(me),false);
  assert.equal(me.available,true);
  assert.equal(me.autoMatching,true);
  assert.ok(me.socket.messages.some(message=>message.type==='autoMatchWaiting'));
});
