import test from 'node:test';
import assert from 'node:assert/strict';
import {Lobby,distance,similarityPercent,MATCH_WEIGHTS,MAX_LOBBY_RESULTS} from '../server/lobby.mjs';

const socket=()=>({messages:[],closed:false,closeCode:null,send(data){this.messages.push(JSON.parse(data));},close(code){this.closed=true;this.closeCode=code;}});
const account=(id,nickname,walletCoins)=>({id,nickname,walletCoins,countryCode:'US'});
let clientSequence=0;
const client=(id,nickname,walletCoins,{available=true,twoPlayer=false,autoMatching=false,mode='menu',foreground=true,lastActivityAt=Date.now(),lastPresenceAt=Date.now(),notificationsEnabled=false,tabId=null}={})=>({clientId:`test-client-${++clientSequence}`,socket:socket(),account:account(id,nickname,walletCoins),available,twoPlayer,mode,tabId,autoMatching,searchQuery:'',connectedAt:Date.now(),lastActivityAt,lastPresenceAt,foreground,notificationsEnabled});
const rowsFor=entries=>new Map(entries.map(([nickname,score,gamesPlayed,totalCoins,rank,wins=0,losses=Math.max(0,gamesPlayed-wins)])=>[
  nickname.toLowerCase(),
  {nickname,score,gamesPlayed,totalCoins,rank,wins,losses,provisional:gamesPlayed<10,countryCode:'US'}
]));
const makeLobby=(rows,directory=[])=>{
  const lobby=new Lobby({}, {ACCOUNT_STORE:null});
  lobby.crypto={getRandomValues(data){data.fill(1);return data;}};
  lobby.leaderboardRows=async()=>rows;
  lobby.directorySearch=async query=>{
    const needle=String(query||'').trim().toLowerCase();
    return directory.filter(player=>String(player.nickname||'').toLowerCase().includes(needle));
  };
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
  const entries=[['Jong',10,100,1000,1,55,45]];
  for(let i=1;i<=12;i++)entries.push([`Player${i}`,10+i*.2,100-i,1000-i*5,i+1,50,49-i]);
  const rows=rowsFor(entries),lobby=makeLobby(rows),me=client('me','Jong',1000);
  const others=entries.slice(1).map(([nickname],index)=>client(`p${index+1}`,nickname,1000-index*5));
  add(lobby,me,...others);
  const recommendations=await lobby.recommendations(me);
  assert.equal(MAX_LOBBY_RESULTS,10);
  assert.equal(recommendations.length,10);
  for(let i=1;i<recommendations.length;i++)assert.ok(recommendations[i-1].similarity>=recommendations[i].similarity);
});

test('Solo and Training presence remains challengeable while any two-player presence blocks the whole account',async()=>{
  const rows=rowsFor([
    ['Jong',10,100,1000,1],['SoloPlayer',10.1,98,990,2],['TrainingPlayer',10.15,97,985,3],['FreeTwoPlayer',10.2,97,980,4],['OtherTab',10.2,97,980,5]
  ]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),solo=client('solo','SoloPlayer',990,{mode:'competitive-solo'}),training=client('training','TrainingPlayer',985,{mode:'training'});
  const freeTwo=client('busy','FreeTwoPlayer',980,{available:false,twoPlayer:true,mode:'free-friend'});
  const sameBusyAccountOtherTab=client('busy','OtherTab',980,{available:true,twoPlayer:false,mode:'menu'});
  add(lobby,me,solo,training,freeTwo,sameBusyAccountOtherTab);
  const names=(await lobby.recommendations(me)).map(player=>player.nickname);
  assert.deepEqual(names,['SoloPlayer','TrainingPlayer']);
  assert.equal(lobby.accountTwoPlayerBusy('busy'),true);
  assert.equal(lobby.presenceForAccount('solo').status,'available');
  assert.equal(lobby.presenceForAccount('training').status,'available');
  assert.equal(lobby.presenceForAccount('busy').status,'in-game');
});

test('foreground plus activity within five minutes is Available; hidden or stale activity is Away and still challengeable',()=>{
  const rows=rowsFor([['Viewer',1,1,1,1],['Active',1,1,1,2],['Hidden',1,1,1,3],['Idle',1,1,1,4]]),lobby=makeLobby(rows),now=Date.now(),viewer=client('viewer','Viewer',100),active=client('active','Active',100,{foreground:true,lastActivityAt:now}),hidden=client('hidden','Hidden',100,{foreground:false,lastActivityAt:now}),idle=client('idle','Idle',100,{foreground:true,lastActivityAt:now-300001});
  add(lobby,viewer,active,hidden,idle);
  assert.equal(lobby.presenceForAccount('active').status,'available');assert.equal(lobby.presenceForAccount('active').challengeable,true);
  assert.equal(lobby.presenceForAccount('hidden').status,'away');assert.equal(lobby.presenceForAccount('hidden').challengeable,true);
  assert.equal(lobby.presenceForAccount('idle').status,'away');assert.equal(lobby.presenceForAccount('idle').challengeable,true);
});

test('Away remains challengeable even without notification permission while notification capability is tracked separately',()=>{
  const rows=rowsFor([['Viewer',1,1,1,1],['Away',1,1,1,2]]),lobby=makeLobby(rows),now=Date.now(),viewer=client('viewer','Viewer',100),away=client('away','Away',100,{foreground:false,lastActivityAt:now,notificationsEnabled:false,lastPresenceAt:now});
  add(lobby,viewer,away);
  assert.equal(lobby.presenceForAccount('away').status,'away');assert.equal(lobby.presenceForAccount('away').challengeable,true);assert.equal(lobby.presenceForAccount('away').notificationsEnabled,false);
  away.notificationsEnabled=true;assert.equal(lobby.presenceForAccount('away').notificationsEnabled,true);
});


test('stale lobby heartbeat is not challengeable or counted online',()=>{
  const rows=rowsFor([['Viewer',1,1,1,1],['Ghost',1,1,1,2]]),lobby=makeLobby(rows),now=Date.now(),viewer=client('viewer','Viewer',100,{lastPresenceAt:now}),ghost=client('ghost','Ghost',100,{foreground:false,lastActivityAt:now,lastPresenceAt:now-90001});
  add(lobby,viewer,ghost);
  assert.equal(lobby.clientCanReceiveChallenge(ghost),false);
  assert.deepEqual(lobby.presenceForAccount('ghost'),{online:false,challengeable:false,status:'offline',mode:'offline'});
  assert.equal(lobby.onlineAccountCount(viewer),0);
});

test('stale two-player sibling cannot block a fresh menu socket for the same account',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.1,100,1000,2]]),lobby=makeLobby(rows),now=Date.now(),jong=client('jong','Jong',1000,{lastPresenceAt:now}),staleBusy=client('jong','Jong',1000,{available:false,twoPlayer:true,mode:'competitive-online',lastPresenceAt:now-90001}),sono=client('sono','Sonogong',1000,{lastPresenceAt:now});
  add(lobby,jong,staleBusy,sono);
  assert.equal(lobby.accountTwoPlayerBusy('jong'),false);
  assert.equal(lobby.presenceForAccount('jong').status,'available');
  const rowsNow=await lobby.leaderboardRows();
  const challenge=lobby.startChallenge(jong,sono,rowsNow,{automatic:true});
  assert.ok(challenge);
  assert.ok(jong.socket.messages.some(message=>message.type==='challengeSent'));
  assert.ok(sono.socket.messages.some(message=>message.type==='playRequest'));
});

test('fresh two-player sibling still blocks the account',()=>{
  const rows=rowsFor([['Jong',10,100,1000,1]]),lobby=makeLobby(rows),now=Date.now(),menu=client('jong','Jong',1000,{lastPresenceAt:now}),busy=client('jong','Jong',1000,{available:false,twoPlayer:true,mode:'competitive-online',lastPresenceAt:now});
  add(lobby,menu,busy);
  assert.equal(lobby.accountTwoPlayerBusy('jong'),true);
  assert.equal(lobby.presenceForAccount('jong').status,'in-game');
});


test('same browser tab reconnect replaces its older lobby socket immediately',()=>{
  const rows=rowsFor([['Jong',10,100,1000,1]]),lobby=makeLobby(rows),now=Date.now(),old=client('jong','Jong',1000,{available:false,twoPlayer:true,mode:'competitive-online',lastPresenceAt:now,tabId:'tab-a'}),fresh=client('jong','Jong',1000,{available:true,twoPlayer:false,mode:'menu',lastPresenceAt:now});
  add(lobby,old,fresh);
  assert.equal(lobby.accountTwoPlayerBusy('jong'),true);
  lobby.claimTabInstance(fresh,'tab-a');
  assert.equal(fresh.tabId,'tab-a');
  assert.equal(lobby.clientsForAccount('jong').length,1);
  assert.equal(lobby.clientsForAccount('jong')[0],fresh);
  assert.equal(old.socket.closed,true);
  assert.equal(old.socket.closeCode,4004);
  assert.equal(lobby.accountTwoPlayerBusy('jong'),false);
});

test('different browser tabs remain independent and a real second two-player tab still blocks',()=>{
  const rows=rowsFor([['Jong',10,100,1000,1]]),lobby=makeLobby(rows),now=Date.now(),game=client('jong','Jong',1000,{available:false,twoPlayer:true,mode:'competitive-online',lastPresenceAt:now,tabId:'tab-game'}),menu=client('jong','Jong',1000,{available:true,twoPlayer:false,mode:'menu',lastPresenceAt:now});
  add(lobby,game,menu);
  lobby.claimTabInstance(menu,'tab-menu');
  assert.equal(lobby.clientsForAccount('jong').length,2);
  assert.equal(game.socket.closed,false);
  assert.equal(lobby.accountTwoPlayerBusy('jong'),true);
});

test('same-tab takeover preserves challenge ownership on the new socket',()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10,100,1000,2]]),lobby=makeLobby(rows),now=Date.now(),old=client('jong','Jong',1000,{lastPresenceAt:now,tabId:'tab-a'}),fresh=client('jong','Jong',1000,{lastPresenceAt:now}),sono=client('sono','Sonogong',1000,{lastPresenceAt:now});
  add(lobby,old,fresh,sono);
  const challenge=lobby.startChallenge(old,sono,rows,{automatic:true});assert.ok(challenge);assert.equal(challenge.fromClientId,old.clientId);
  lobby.claimTabInstance(fresh,'tab-a');
  assert.equal(challenge.fromClientId,fresh.clientId);
  assert.equal(lobby.clientsForAccount('jong').includes(old),false);
});test('online count includes busy online accounts while Browse recommendations remain challengeable-only',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Available',10.1,90,900,2],['Busy',10.2,80,800,3]]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),available=client('available','Available',900),busy=client('busy','Busy',800,{available:false,twoPlayer:true,mode:'competitive-online'});
  add(lobby,me,available,busy);
  assert.equal(lobby.onlineAccountCount(me),2);
  const recommendations=await lobby.recommendations(me);assert.deepEqual(recommendations.map(player=>player.nickname),['Available']);
});

test('player search looks up registered players even when offline or already in a two-player game and overlays profile status',async()=>{
  const rows=rowsFor([['Jong',8,40,320,1,20,20]]);
  const directory=[
    {accountId:'offline',nickname:'Sonogong',walletCoins:340,score:8.1,gamesPlayed:42,wins:24,losses:18,totalCoins:340,rank:2,provisional:false,countryCode:'US'},
    {accountId:'busy',nickname:'SonogongBusy',walletCoins:500,score:9.2,gamesPlayed:50,wins:30,losses:20,totalCoins:460,rank:1,provisional:false,countryCode:'US'}
  ];
  const lobby=makeLobby(rows,directory),me=client('me','Jong',320),busy=client('busy','SonogongBusy',500,{available:false,twoPlayer:true,mode:'competitive-online'});
  add(lobby,me,busy);
  const result=await lobby.search(me,'sonogong');
  assert.deepEqual(result.map(player=>player.nickname),['Sonogong','SonogongBusy']);
  assert.equal(result[0].online,false);assert.equal(result[0].status,'offline');assert.equal(result[0].challengeable,false);
  assert.equal(result[0].walletCoins,340);assert.equal(result[0].wins,24);assert.equal(result[0].losses,18);assert.equal(result[0].score,8.1);assert.equal(result[0].rank,2);
  assert.equal(result[1].online,true);assert.equal(result[1].status,'in-game');assert.equal(result[1].challengeable,false);
});

test('player search preserves an explicit zero-loss count instead of treating every non-win as a loss',async()=>{
  const rows=rowsFor([['Jong',8,40,320,1,20,20]]);
  const directory=[{accountId:'nagari',nickname:'NagariPlayer',walletCoins:200,score:0,gamesPlayed:1,wins:0,losses:0,totalCoins:0,rank:2,provisional:true,countryCode:'US'}];
  const lobby=makeLobby(rows,directory),me=client('me','Jong',320);add(lobby,me);
  const [player]=await lobby.search(me,'nagari');
  assert.equal(player.gamesPlayed,1);assert.equal(player.wins,0);assert.equal(player.losses,0);
});

test('play request reaches every target tab and accepted handoff binds to the tab that answers',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.2,102,1040,2]]),lobby=makeLobby(rows);
  const jongPrimary=client('jong','Jong',1000),jongOther=client('jong','Jong',1000,{foreground:false}),sonoPrimary=client('sono','Sonogong',1040),sonoOther=client('sono','Sonogong',1040,{foreground:false});
  add(lobby,jongPrimary,jongOther,sonoPrimary,sonoOther);
  await lobby.handle(jongPrimary,JSON.stringify({type:'challenge',accountId:'sono'}));
  const request=sonoPrimary.socket.messages.find(message=>message.type==='playRequest');assert.ok(request?.requestId);assert.ok(sonoOther.socket.messages.some(message=>message.type==='playRequest'&&message.requestId===request.requestId));
  await lobby.handle(sonoOther,JSON.stringify({type:'challengeResponse',requestId:request.requestId,accept:true}));
  assert.equal(jongPrimary.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'),true);assert.equal(jongOther.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'),false);
  assert.equal(sonoOther.socket.messages.some(message=>message.type==='challengeAcceptedWaiting'),true);assert.equal(sonoPrimary.socket.messages.some(message=>message.type==='challengeAcceptedWaiting'),false);
  assert.ok(sonoPrimary.socket.messages.some(message=>message.type==='challengeResolved'&&message.requestId===request.requestId));
  await lobby.handle(jongPrimary,JSON.stringify({type:'challengeRoomReady',requestId:request.requestId,roomCode:'ABCDEFGHJK2345'}));
  assert.equal(sonoOther.socket.messages.some(message=>message.type==='challengeRoomReady'&&message.roomCode==='ABCDEFGHJK2345'),true);assert.equal(sonoPrimary.socket.messages.some(message=>message.type==='challengeRoomReady'),false);
});

test('manual player selection sends a Yes/No play request rather than starting a game immediately',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.2,102,1040,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),target=client('target','Sonogong',1040);
  add(lobby,me,target);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'target'}));
  const sent=me.socket.messages.find(message=>message.type==='challengeSent'),request=target.socket.messages.find(message=>message.type==='playRequest');
  assert.ok(sent?.requestId);assert.equal(request?.requestId,sent.requestId);assert.equal(request?.from?.nickname,'Jong');
  assert.equal(me.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'),false);
});

test('requester can cancel while waiting and target receives cancellation',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.2,102,1040,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),target=client('target','Sonogong',1040);add(lobby,me,target);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'target'}));
  const request=me.socket.messages.find(message=>message.type==='challengeSent');assert.ok(request);
  await lobby.handle(me,JSON.stringify({type:'challengeCancel',requestId:request.requestId}));
  assert.equal(lobby.challenges.has(request.requestId),false);
  assert.ok(target.socket.messages.some(message=>message.type==='challengeCancelled'&&message.requestId===request.requestId));
  assert.ok(me.socket.messages.some(message=>message.type==='challengeCancelled'&&message.requestId===request.requestId));
});

test('declining a request informs the requester and leaves the recipient available',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.2,102,1040,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),target=client('target','Sonogong',1040);add(lobby,me,target);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'target'}));const request=target.socket.messages.find(message=>message.type==='playRequest');
  await lobby.handle(target,JSON.stringify({type:'challengeResponse',requestId:request.requestId,accept:false}));
  assert.equal(target.available,true);assert.equal(lobby.challenges.has(request.requestId),false);
  assert.ok(me.socket.messages.some(message=>message.type==='challengeDeclined'&&message.by?.nickname==='Sonogong'));
});

test('accepted request stays alive until recipient actually joins the exact authoritative room',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.2,102,1040,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000),target=client('target','Sonogong',1040);add(lobby,me,target);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'target'}));const request=target.socket.messages.find(message=>message.type==='playRequest');
  await lobby.handle(target,JSON.stringify({type:'challengeResponse',requestId:request.requestId,accept:true}));
  assert.equal(lobby.challenges.get(request.requestId)?.status,'accepted');
  assert.ok(me.socket.messages.some(message=>message.type==='challengeAcceptedCreateRoom'));
  assert.ok(target.socket.messages.some(message=>message.type==='challengeAcceptedWaiting'));

  await lobby.handle(me,JSON.stringify({type:'challengeRoomReady',requestId:request.requestId,roomCode:'ABCDEFGHJK2345'}));
  assert.equal(lobby.challenges.get(request.requestId)?.status,'room-ready');
  assert.equal(lobby.challenges.get(request.requestId)?.roomCode,'ABCDEFGHJK2345');
  assert.ok(target.socket.messages.some(message=>message.type==='challengeRoomReady'&&message.roomCode==='ABCDEFGHJK2345'));
  assert.equal(me.socket.messages.some(message=>message.type==='challengeRoomHandoffComplete'),false);

  await lobby.handle(target,JSON.stringify({type:'challengeJoined',requestId:request.requestId,roomCode:'ABCDEFGHJK2345'}));
  assert.equal(lobby.challenges.has(request.requestId),false);
  assert.ok(me.socket.messages.some(message=>message.type==='challengeRoomHandoffComplete'&&message.roomCode==='ABCDEFGHJK2345'));
  assert.ok(target.socket.messages.some(message=>message.type==='challengeRoomHandoffComplete'&&message.roomCode==='ABCDEFGHJK2345'));
});

test('declining a request immediately makes the same player challengeable again',async()=>{
  const rows=rowsFor([['Jong',10,20,200,1],['Sonogong',9,20,180,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',200),other=client('other','Sonogong',180);
  add(lobby,me,other);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'other'}));
  const first=other.socket.messages.find(message=>message.type==='playRequest');
  assert.ok(first?.requestId);
  await lobby.handle(other,JSON.stringify({type:'challengeResponse',requestId:first.requestId,accept:false}));
  assert.equal(lobby.activeChallengeFor('me'),null);
  assert.equal(lobby.activeChallengeFor('other'),null);
  assert.equal(lobby.lastRequestAt.has('me'),false);
  assert.ok((await lobby.recommendations(me)).some(player=>player.accountId==='other'));
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'other'}));
  const requests=other.socket.messages.filter(message=>message.type==='playRequest');
  assert.equal(requests.length,2);
  assert.equal(requests[1].from.nickname,'Jong');
});

test('Auto Match previews the closest skill match with rich history before sending any request',async()=>{
  const rows=rowsFor([
    ['Jong',10,100,1000,1],['Closest',10.01,100,1002,2],['Near',10.2,102,1040,3],['Far',30,5,150,4]
  ]);
  const lobby=makeLobby(rows),me=client('me','Jong',1000,{autoMatching:true}),closest=client('closest','Closest',1002),near=client('near','Near',1020),far=client('far','Far',150);
  lobby.directoryProfiles=async ids=>ids.includes('closest')?[{accountId:'closest',nickname:'Closest',walletCoins:1002,score:10.01,gamesPlayed:100,wins:55,losses:45,totalCoins:1002,globalRank:2,rank:2,headToHead:{wins:3,losses:2,draws:0,coinsWon:22,coinsLost:15,lastPlayedAt:'2026-09-19T10:00:00.000Z'}}]:[];
  add(lobby,me,closest,near,far);
  assert.equal(await lobby.tryAutoMatch(me),true);
  const preview=me.socket.messages.find(message=>message.type==='autoMatchCandidate');
  assert.equal(preview?.candidate?.nickname,'Closest');assert.equal(preview?.candidate?.globalRank,2);assert.equal(preview?.candidate?.wins,55);assert.equal(preview?.candidate?.headToHead?.wins,3);assert.equal(preview?.candidate?.headToHead?.coinsLost,15);
  assert.equal(closest.socket.messages.some(message=>message.type==='playRequest'),false);assert.equal(me.socket.messages.some(message=>message.type==='challengeSent'),false);
  await lobby.handle(me,JSON.stringify({type:'autoMatchAccept'}));
  const sent=me.socket.messages.find(message=>message.type==='challengeSent'),request=closest.socket.messages.find(message=>message.type==='playRequest');
  assert.equal(sent?.automatic,true);assert.equal(sent?.to?.nickname,'Closest');assert.equal(request?.automatic,true);
});

test('Auto Match Accept survives requester lobby reconnect by carrying the selected account ID',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.05,100,1000,2]]),lobby=makeLobby(rows),original=client('me','Jong',1000),sono=client('sono','Sonogong',1000);add(lobby,original,sono);
  original.autoMatching=true;
  assert.equal(await lobby.tryAutoMatch(original),true);
  const preview=original.socket.messages.find(message=>message.type==='autoMatchCandidate');assert.equal(preview?.candidate?.accountId,'sono');
  lobby.clients.delete(original.socket);
  const reconnected=client('me','Jong',1000);add(lobby,reconnected);
  await lobby.handle(reconnected,JSON.stringify({type:'autoMatchAccept',accountId:'sono'}));
  const sent=reconnected.socket.messages.find(message=>message.type==='challengeSent'),request=sono.socket.messages.find(message=>message.type==='playRequest');
  assert.equal(sent?.to?.accountId,'sono');assert.equal(request?.from?.accountId,'me');assert.equal(request?.automatic,true);
});

test('reconnected requester processes availability before queued Auto Match Accept',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.05,100,1000,2]]),lobby=makeLobby(rows),original=client('me','Jong',1000),sono=client('sono','Sonogong',1000);add(lobby,original,sono);
  original.autoMatching=true;assert.equal(await lobby.tryAutoMatch(original),true);
  const preview=original.socket.messages.find(message=>message.type==='autoMatchCandidate');assert.equal(preview?.candidate?.accountId,'sono');
  lobby.clients.delete(original.socket);
  const reconnected=client('me','Jong',1000,{available:false,foreground:false});add(lobby,reconnected);reconnected.messageQueue=Promise.resolve();
  const availability=JSON.stringify({type:'setAvailability',available:true,twoPlayer:false,mode:'menu',foreground:true,lastActivityAt:Date.now(),notificationsEnabled:false});
  const accept=JSON.stringify({type:'autoMatchAccept',accountId:'sono'});
  await Promise.all([lobby.enqueueClientMessage(reconnected,availability),lobby.enqueueClientMessage(reconnected,accept)]);
  assert.equal(reconnected.available,true);
  assert.ok(reconnected.socket.messages.some(message=>message.type==='challengeSent'&&message.to?.accountId==='sono'));
  assert.ok(sono.socket.messages.some(message=>message.type==='playRequest'&&message.from?.accountId==='me'));
});

test('pending play request is redelivered to a refreshed recipient tab and receipt is acknowledged',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.1,100,1000,2]]),lobby=makeLobby(rows),me=client('me','Jong',1000),oldTab=client('sono','Sonogong',1000);add(lobby,me,oldTab);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'sono'}));
  const first=oldTab.socket.messages.find(message=>message.type==='playRequest');assert.ok(first?.requestId);
  const refreshed=client('sono','Sonogong',1000);add(lobby,refreshed);
  await lobby.handle(refreshed,JSON.stringify({type:'setAvailability',available:true,twoPlayer:false,mode:'menu',foreground:true,lastActivityAt:Date.now(),notificationsEnabled:false}));
  const redelivered=refreshed.socket.messages.find(message=>message.type==='playRequest'&&message.requestId===first.requestId);assert.ok(redelivered);
  await lobby.handle(refreshed,JSON.stringify({type:'challengeReceipt',requestId:first.requestId}));
  const challenge=lobby.challenges.get(first.requestId);assert.ok(challenge.deliveryReceipts.has(refreshed.clientId));assert.ok(me.socket.messages.some(message=>message.type==='challengeDelivered'&&message.requestId===first.requestId));
});

test('unacknowledged play request retries before timeout and stops after receipt',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.1,100,1000,2]]),lobby=makeLobby(rows),me=client('me','Jong',1000),sono=client('sono','Sonogong',1000);add(lobby,me,sono);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'sono'}));
  const first=sono.socket.messages.find(message=>message.type==='playRequest');assert.ok(first?.requestId);
  assert.equal(sono.socket.messages.filter(message=>message.type==='playRequest').length,1);
  assert.equal(lobby.retryChallengeDelivery(first.requestId),true);
  assert.equal(sono.socket.messages.filter(message=>message.type==='playRequest').length,2);
  await lobby.handle(sono,JSON.stringify({type:'challengeReceipt',requestId:first.requestId}));
  assert.equal(lobby.retryChallengeDelivery(first.requestId),false);
  assert.equal(sono.socket.messages.filter(message=>message.type==='playRequest').length,2);
});

test('searching a player before Auto Match does not suppress candidate preview or request delivery',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.05,100,1000,2]]),directory=[{accountId:'sono',nickname:'Sonogong',walletCoins:1000,score:10.05,gamesPlayed:100,wins:50,losses:50,totalCoins:1000,rank:2,globalRank:2,countryCode:'US'}],lobby=makeLobby(rows,directory);
  const me=client('me','Jong',1000),sonoFront=client('sono','Sonogong',1000),sonoAway=client('sono','Sonogong',1000,{foreground:false});add(lobby,me,sonoFront,sonoAway);
  await lobby.handle(me,JSON.stringify({type:'search',query:'Sonogong'}));assert.ok(me.socket.messages.some(message=>message.type==='searchResults'));
  await lobby.handle(me,JSON.stringify({type:'autoMatchStart'}));
  const preview=me.socket.messages.find(message=>message.type==='autoMatchCandidate');assert.equal(preview?.candidate?.nickname,'Sonogong');
  assert.equal(sonoFront.socket.messages.some(message=>message.type==='playRequest'),false);
  await lobby.handle(me,JSON.stringify({type:'autoMatchAccept'}));
  const frontRequest=sonoFront.socket.messages.find(message=>message.type==='playRequest'&&message.automatic),awayRequest=sonoAway.socket.messages.find(message=>message.type==='playRequest'&&message.automatic);
  assert.ok(frontRequest?.requestId);assert.equal(awayRequest?.requestId,frontRequest.requestId);
  assert.ok(me.socket.messages.some(message=>message.type==='challengeSent'&&message.requestId===frontRequest.requestId));
});

test('Someone Else advances through the Auto Match list without sending a request',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['First',10.01,100,1000,2],['Second',10.2,100,1000,3]]),lobby=makeLobby(rows),me=client('me','Jong',1000,{autoMatching:true}),first=client('first','First',1000),second=client('second','Second',1000);
  add(lobby,me,first,second);me.autoMatchTried=new Set();
  await lobby.tryAutoMatch(me);assert.equal(me.socket.messages.filter(message=>message.type==='autoMatchCandidate').at(-1)?.candidate?.nickname,'First');
  await lobby.handle(me,JSON.stringify({type:'autoMatchNext'}));
  assert.equal(me.socket.messages.filter(message=>message.type==='autoMatchCandidate').at(-1)?.candidate?.nickname,'Second');
  assert.ok(me.autoMatchTried.has('first'));assert.equal(first.socket.messages.some(message=>message.type==='playRequest'),false);assert.equal(second.socket.messages.some(message=>message.type==='playRequest'),false);
});

test('manual Play can target an Online - Away player and expires after 30 seconds with no-answer and missed-request notices',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['Sonogong',10.1,100,1000,2]]),lobby=makeLobby(rows),me=client('me','Jong',1000),away=client('away','Sonogong',1000,{foreground:false,notificationsEnabled:false});
  add(lobby,me,away);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'away'}));
  const request=away.socket.messages.find(message=>message.type==='playRequest');assert.ok(request);assert.equal(request.expiresInSeconds,30);
  const challenge=lobby.challenges.get(request.requestId);challenge.expiresAt=Date.now()-1;await lobby.expireChallenge(request.requestId);
  assert.equal(lobby.challenges.has(request.requestId),false);
  assert.ok(me.socket.messages.some(message=>message.type==='challengeNoAnswer'&&message.by?.nickname==='Sonogong'));
  assert.ok(away.socket.messages.some(message=>message.type==='challengeMissed'&&message.from?.nickname==='Jong'&&message.createdAt));
});

test('Auto Match includes Away players and advances to the next candidate preview after 30 seconds without a reply',async()=>{
  const rows=rowsFor([['Jong',10,100,1000,1],['ClosestAway',10.01,100,1000,2],['NextAvailable',10.2,100,1000,3]]),lobby=makeLobby(rows),me=client('me','Jong',1000,{autoMatching:true}),away=client('away','ClosestAway',1000,{foreground:false}),next=client('next','NextAvailable',1000);
  add(lobby,me,away,next);
  me.autoMatchTried=new Set();assert.equal(await lobby.tryAutoMatch(me),true);
  assert.equal(me.socket.messages.find(message=>message.type==='autoMatchCandidate')?.candidate?.nickname,'ClosestAway');
  await lobby.handle(me,JSON.stringify({type:'autoMatchAccept'}));
  const first=away.socket.messages.find(message=>message.type==='playRequest');assert.ok(first);assert.equal(first.automatic,true);
  const firstChallenge=lobby.challenges.get(first.requestId);firstChallenge.expiresAt=Date.now()-1;await lobby.expireChallenge(first.requestId);
  const previews=me.socket.messages.filter(message=>message.type==='autoMatchCandidate');assert.equal(previews.at(-1)?.candidate?.nickname,'NextAvailable');
  assert.equal(next.socket.messages.some(message=>message.type==='playRequest'),false);
  assert.equal(me.autoMatching,true);assert.ok(me.autoMatchTried.has('away'));assert.equal(me.autoMatchTried.has('next'),false);
  assert.ok(away.socket.messages.some(message=>message.type==='challengeMissed'&&message.requestId===first.requestId));
});

test('Auto Match waiting wakes with a candidate preview when a challengeable player becomes available',async()=>{
  const rows=rowsFor([['Jong',10,10,100,1],['Sonogong',10.1,11,110,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',100,{autoMatching:true}),other=client('other','Sonogong',110,{available:false,twoPlayer:false});
  add(lobby,me,other);
  assert.equal(await lobby.tryAutoMatch(me),false);assert.ok(me.socket.messages.some(message=>message.type==='autoMatchWaiting'));
  await lobby.handle(other,JSON.stringify({type:'setAvailability',available:true,twoPlayer:false,mode:'menu',foreground:true,lastActivityAt:Date.now(),notificationsEnabled:false}));
  assert.equal(me.socket.messages.filter(message=>message.type==='autoMatchCandidate').at(-1)?.candidate?.nickname,'Sonogong');
  assert.equal(other.socket.messages.some(message=>message.type==='playRequest'),false);
});

test('a pending request is cancelled if either player enters a two-player game before answering',async()=>{
  const rows=rowsFor([['Jong',10,10,100,1],['Sonogong',10,10,100,2]]);
  const lobby=makeLobby(rows),me=client('me','Jong',100),other=client('other','Sonogong',100);add(lobby,me,other);
  await lobby.handle(me,JSON.stringify({type:'challenge',accountId:'other'}));const request=other.socket.messages.find(message=>message.type==='playRequest');assert.ok(request);
  await lobby.handle(other,JSON.stringify({type:'setAvailability',available:false,twoPlayer:true,mode:'free-friend'}));
  assert.equal(lobby.challenges.has(request.requestId),false);
  assert.ok(me.socket.messages.some(message=>message.type==='challengeCancelled'&&message.requestId===request.requestId));
});
