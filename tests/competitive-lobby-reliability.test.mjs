import test from 'node:test';
import assert from 'node:assert/strict';
import {Lobby} from '../server/lobby-development.mjs';
const socket=()=>({messages:[],send(value){this.messages.push(JSON.parse(value));},serializeAttachment(){}});
const make=(id,nickname,coins=100)=>({clientId:id+'-socket',account:{id,nickname,walletCoins:coins},
 socket:socket(),available:true,twoPlayer:false,foreground:true,
 lastPresenceAt:Date.now(),lastActivityAt:Date.now(),connectedAt:Date.now(),
 autoMatching:false,autoMatchTried:new Set(),autoMatchCandidateId:null,tabId:'tab-'+id,
 searchQuery:'',messageQueue:Promise.resolve()});
const fixture=(count=2)=>{
 const lobby=new Lobby({waitUntil(){}},{ACCOUNT_STORE:null});
 lobby.crypto={getRandomValues(bytes){bytes.fill(42);}};
 const clients=Array.from({length:count},(_,i)=>make('p'+i,i===0?'SonGoku':i===1?'Vegeta':'Player'+i,100+i*10));
 clients.forEach(c=>lobby.clients.set(c.socket,c));
 return {lobby,clients};
};
test('auto-match responds despite indefinitely stalled external leaderboard',async()=>{
 const {lobby,clients:[a,b]}=fixture();
 lobby.leaderboardRows=()=>new Promise(()=>{});
 await Promise.race([
  lobby.handle(a,JSON.stringify({type:'autoMatchStart'})),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Auto Match blocked on leaderboard')),500))
 ]);
 const choice=a.socket.messages.find(m=>m.type==='autoMatchCandidate');
 assert.equal(choice?.candidate?.nickname,'Vegeta');
 assert.equal(b.socket.messages.some(m=>m.type==='playRequest'),false);
});
test('immediate manual Play sends notification request, and Cancel acknowledges without waiting for player directory',async()=>{
 const {lobby,clients:[a,b]}=fixture();
 lobby.leaderboardRows=()=>new Promise(()=>{});
 await lobby.handle(a,JSON.stringify({type:'challenge',accountId:b.account.id}));
 const sent=a.socket.messages.find(m=>m.type==='challengeSent');
 assert.ok(sent?.requestId);
 assert.ok(b.socket.messages.some(m=>m.type==='playRequest'&&m.requestId===sent.requestId));
 await Promise.race([
  lobby.handle(a,JSON.stringify({type:'challengeCancel',requestId:sent.requestId})),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cancel blocked')),500))
 ]);
 assert.equal(lobby.challenges.has(sent.requestId),false);
 assert.ok(b.socket.messages.some(m=>m.type==='challengeCancelled'&&m.requestId===sent.requestId));
 assert.ok(a.socket.messages.some(m=>m.type==='challengeCancelled'&&m.requestId===sent.requestId));
});
test('a search returns online matches immediately while slow offline directory lookup continues',async()=>{
 const {lobby,clients:[a,b]}=fixture();
 lobby.leaderboardRows=()=>new Promise(()=>{});
 lobby.directorySearch=()=>new Promise(()=>{});
 await Promise.race([
  lobby.handle(a,JSON.stringify({type:'search',query:'Veg'})),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Search blocked')),500))
 ]);
 const quick=a.socket.messages.find(m=>m.type==='searchResults'&&m.partial);
 assert.equal(quick?.query,'Veg');
 assert.deepEqual(quick?.players?.map(x=>x.nickname),['Vegeta']);
});
test('Online Players pages are ranked by skill, exactly ten at a time, with final partial page',async()=>{
 const {lobby,clients}=fixture(25);
 const me=clients[0];
 lobby.rowsCache=new Map(clients.map((c,i)=>[
  c.account.nickname.toLowerCase(),{coinsPerGame:i,gamesPlayed:i*3,walletCoins:100+i*10}
 ]));
 for(let offset of [0,10,20]){
  await lobby.handle(me,JSON.stringify({type:'onlinePlayersPage',offset}));
  const page=me.socket.messages.filter(m=>m.type==='onlinePlayersPage').at(-1);
  assert.equal(page.offset,offset);
  assert.equal(page.total,24);
  assert.equal(page.players.length,Math.min(10,24-offset));
  assert.equal(new Set(page.players.map(x=>x.accountId)).size,page.players.length);
  assert.ok(page.players.every(x=>x.accountId!==me.account.id&&x.challengeable));
  assert.deepEqual(page.players.map(p=>p.similarity),
   page.players.map(p=>p.similarity).slice().sort((a,b)=>b-a));
 }
});
test('refresh scheduling does not await leaderboard and coalesces repeated availability changes',async()=>{
 const {lobby,clients:[a]}=fixture(1);
 let requests=0;
 lobby.leaderboardRows=async()=>{requests++;return new Map();};
 await lobby.handle(a,JSON.stringify({type:'setAvailability',available:true,foreground:true,
  lastActivityAt:Date.now(),tabId:'tab-p0'}));
 assert.equal(a.socket.messages.some(m=>m.type==='recommendations'),false);
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.ok(a.socket.messages.some(m=>m.type==='presenceCount'));
 assert.ok(requests<=2);
});

test('dev lobby rejects a ghost Online request when account authority says recipient is already playing',async()=>{
 const {lobby,clients:[host,phone]}=fixture();
 lobby.env.ACCOUNT_STORE={
  idFromName:()=> 'global',
  get:()=>({fetch:async request=>{
   const {accountId}=await request.json();
   return new Response(JSON.stringify({ok:true,busy:accountId===phone.account.id}),
    {headers:{'content-type':'application/json'}});
  }})
 };
 await lobby.handle(host,JSON.stringify({type:'challenge',accountId:phone.account.id}));
 assert.equal(host.socket.messages.at(-1)?.type,'challengeError');
 assert.equal(lobby.challenges.size,0,'no ghost play request may be created');
 assert.equal(phone.socket.messages.some(m=>m.type==='playRequest'),false);
});
test('dev lobby cannot accept a stale or backgrounded invitation without a matching current receipt',async()=>{
 const {lobby,clients:[host,phone]}=fixture();
 await lobby.handle(host,JSON.stringify({type:'challenge',accountId:phone.account.id}));
 const requestId=host.socket.messages.find(m=>m.type==='challengeSent')?.requestId;
 assert.ok(requestId);
 await lobby.handle(phone,JSON.stringify({type:'challengeResponse',requestId,accept:true}));
 assert.equal(lobby.challenges.has(requestId),false,'unacknowledged browser must not accept');
 assert.equal(host.socket.messages.some(m=>m.type==='challengeAcceptedCreateRoom'),false);
 await lobby.handle(host,JSON.stringify({type:'challenge',accountId:phone.account.id}));
 const sentRequests=host.socket.messages.filter(m=>m.type==='challengeSent');
 assert.equal(sentRequests.length,2,'a second request must be sent after the previous one was cancelled');
 const second=sentRequests.at(-1)?.requestId;
 assert.ok(second); // this fixture uses a fixed crypto byte pattern; ids may repeat across attempts
 await lobby.handle(phone,JSON.stringify({type:'challengeReceipt',requestId:second}));
 phone.foreground=false;
 await lobby.handle(phone,JSON.stringify({type:'challengeResponse',requestId:second,accept:true}));
 assert.equal(lobby.challenges.has(second),false,'background browser cannot confirm a match');
 assert.equal(host.socket.messages.some(m=>m.type==='challengeAcceptedCreateRoom'),false);
});

test('Auto Match Play expires after 30 seconds and clears the requester instead of silently finding another opponent',async()=>{
 const {lobby,clients:[phone,pc]}=fixture(2);
 lobby.broadcastRecommendations=async()=>{};
 await lobby.handle(phone,JSON.stringify({type:'autoMatchStart'}));
 assert.equal(phone.socket.messages.findLast(m=>m.type==='autoMatchCandidate')?.candidate?.accountId,pc.account.id);
 await lobby.handle(phone,JSON.stringify({type:'autoMatchAccept',accountId:pc.account.id}));
 const invite=phone.socket.messages.findLast(m=>m.type==='challengeSent');
 assert.ok(invite?.requestId);
 assert.equal(invite.automatic,true);
 assert.ok(pc.socket.messages.some(m=>m.type==='playRequest'&&m.requestId===invite.requestId));
 const challenge=lobby.challenges.get(invite.requestId);
 assert.ok(challenge);
 challenge.expiresAt=Date.now()-10;
 assert.equal(await lobby.expireChallenge(invite.requestId),true);
 assert.equal(lobby.challenges.has(invite.requestId),false);
 assert.equal(phone.autoMatching,false);
 assert.equal(phone.autoMatchCandidateId,null);
 const noAnswer=phone.socket.messages.filter(m=>m.type==='challengeNoAnswer');
 assert.equal(noAnswer.length,1);
 assert.equal(noAnswer[0].requestId,invite.requestId);
 assert.equal(noAnswer[0].automatic,true);
 assert.equal(phone.socket.messages.filter(m=>m.type==='challengeSent').length,1,
  'timeout must NOT start another invitation without user authorization');
 assert.equal(phone.socket.messages.filter(m=>m.type==='autoMatchCandidate').length,1,
  'timeout must NOT reopen Auto Match silently');
 assert.ok(pc.socket.messages.some(m=>m.type==='challengeMissed'&&m.requestId===invite.requestId));
});

test('expiration during slow authoritative busy check cannot revive an already expired request',async()=>{
 const {lobby,clients:[sender,recipient]}=fixture(2);
 lobby.broadcastRecommendations=async()=>{};
 await lobby.handle(sender,JSON.stringify({type:'challenge',accountId:recipient.account.id}));
 const id=sender.socket.messages.find(m=>m.type==='challengeSent')?.requestId;
 assert.ok(id);
 await lobby.handle(recipient,JSON.stringify({type:'challengeReceipt',requestId:id}));
 let resolveCheck;
 lobby.accountsFreeForCompetitive=()=>new Promise(resolve=>{resolveCheck=resolve;});
 const accepting=lobby.handle(recipient,JSON.stringify({type:'challengeResponse',requestId:id,accept:true}));
 assert.equal(typeof resolveCheck,'function');
 const challenge=lobby.challenges.get(id);challenge.expiresAt=Date.now()-10;
 await lobby.expireChallenge(id);
 resolveCheck(true);
 await accepting;
 assert.equal(lobby.challenges.has(id),false);
 assert.equal(sender.socket.messages.some(m=>m.type==='challengeAcceptedCreateRoom'),false);
 assert.equal(recipient.socket.messages.some(m=>m.type==='challengeAcceptedWaiting'),false);
 assert.equal(recipient.socket.messages.findLast(m=>m.type==='challengeError')?.code,'REQUEST_EXPIRED');
});
