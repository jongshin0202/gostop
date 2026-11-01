import test from 'node:test';
import assert from 'node:assert/strict';
import {Lobby} from '../server/lobby.mjs';
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
