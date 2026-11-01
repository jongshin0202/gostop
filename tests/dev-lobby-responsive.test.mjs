import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevResponsiveLobby} from '../dev-site/instrument-lobby-responsiveness.mjs';
import {instrumentDevOnlinePlayersWorker} from '../dev-site/instrument-online-players-worker.mjs';
import {Lobby} from '../dev-site/worker-dist/server/lobby.mjs';
const socket=()=>({messages:[],send(data){this.messages.push(JSON.parse(data));},close(){}});
let sequence=0;
const client=(id,nickname)=>({
 clientId:'client-'+ ++sequence,socket:socket(),
 account:{id,nickname,walletCoins:1000,countryCode:'US'},
 available:true,twoPlayer:false,foreground:true,mode:'menu',
 tabId:'tab-'+id,autoMatching:false,autoMatchTried:new Set(),
 connectedAt:Date.now(),lastActivityAt:Date.now(),lastPresenceAt:Date.now(),
 searchQuery:'',notificationsEnabled:false
});
function lobby(){
 const l=new Lobby({waitUntil(promise){promise.catch(()=>{});}}, {ACCOUNT_STORE:null});
 l.crypto={getRandomValues(a){a.fill(1);return a;}};
 l.cachedLeaderboardRows=new Map();l.cachedLeaderboardAt=Date.now();
 l.directoryProfiles=async()=>[];
 l.directorySearch=async()=>[];
 return l;
}
const add=(l,...items)=>{for(const c of items)l.clients.set(c.socket,c);};
const deadline=(promise,ms=200)=>Promise.race([promise,
 new Promise((_,reject)=>setTimeout(()=>reject(new Error('User action exceeded '+ms+'ms')),ms))]);

test('frozen lobby remains intact and generated development-only Worker has bounded interactive paths',async()=>{
 const frozen=await readFile(new URL('../server/lobby.mjs',import.meta.url),'utf8');
 const generated=await readFile(new URL('../dev-site/worker-dist/server/lobby.mjs',import.meta.url),'utf8');
 assert.equal(generated,instrumentDevOnlinePlayersWorker(instrumentDevResponsiveLobby(frozen)));
 assert.notEqual(generated,frozen);
 assert.ok(!frozen.includes('scheduleRecommendations(){'));
 assert.ok(generated.includes('scheduleRecommendations(){'));
 const config=await readFile(new URL('../wrangler.dev.responsive.toml',import.meta.url),'utf8');
 assert.match(config,/main = "dev-site\/worker-dist\/server\/worker\.mjs"/);
 assert.match(config,/name = "gostop-authority-dev"/);
});

test('Vegeta receives manual Play immediately even with unresponsive leaderboard',async()=>{
 const l=lobby(),son=client('son','SonGoku'),veg=client('veg','Vegeta');
 add(l,son,veg);
 l.leaderboardRows=()=>new Promise(()=>{});
 l.directoryProfiles=()=>new Promise(()=>{});
 await deadline(l.enqueueClientMessage(son,JSON.stringify({type:'challenge',accountId:'veg'})));
 const sent=son.socket.messages.find(x=>x.type==='challengeSent');
 const incoming=veg.socket.messages.find(x=>x.type==='playRequest');
 assert.ok(sent?.requestId);
 assert.equal(incoming?.requestId,sent.requestId);
 assert.equal(incoming.from.nickname,'SonGoku');
});

test('Cancel Request cannot be held behind a stuck Jung search',async()=>{
 const l=lobby(),son=client('son','SonGoku'),veg=client('veg','Vegeta');
 add(l,son,veg);
 await l.enqueueClientMessage(son,JSON.stringify({type:'challenge',accountId:'veg'}));
 const sent=son.socket.messages.find(x=>x.type==='challengeSent');
 assert.ok(sent?.requestId);
 l.directorySearch=()=>new Promise(()=>{});
 const pendingSearch=l.enqueueClientMessage(son,JSON.stringify({type:'search',query:'Jung'}));
 await new Promise(resolve=>setTimeout(resolve,0));
 await deadline(l.enqueueClientMessage(son,JSON.stringify({type:'challengeCancel',requestId:sent.requestId})));
 assert.ok(son.socket.messages.some(x=>x.type==='challengeCancelled'&&x.requestId===sent.requestId));
 assert.ok(veg.socket.messages.some(x=>x.type==='challengeCancelled'&&x.requestId===sent.requestId));
 assert.equal(l.challenges.has(sent.requestId),false);
 void pendingSearch.catch(()=>{});
});

test('Auto Match responds without waiting on the account-store',async()=>{
 const l=lobby(),son=client('son','SonGoku'),veg=client('veg','Vegeta');
 add(l,son,veg);
 l.leaderboardRows=()=>new Promise(()=>{});
 l.directoryProfiles=()=>new Promise(()=>{});
 await deadline(l.enqueueClientMessage(son,JSON.stringify({type:'autoMatchStart'})));
 assert.ok(son.socket.messages.some(x=>x.type==='autoMatchStarted'));
 assert.equal(son.socket.messages.find(x=>x.type==='autoMatchCandidate')?.candidate?.nickname,'Vegeta');
});

test('Search Player shows a recoverable error instead of waiting indefinitely on an account error',async()=>{
 const l=lobby(),son=client('son','SonGoku');add(l,son);
 l.directorySearch=async()=>{throw new Error('store unavailable');};
 await deadline(l.enqueueClientMessage(son,JSON.stringify({type:'search',query:'Jung'})));
 assert.ok(son.socket.messages.some(x=>x.type==='searchStarted'));
 assert.match(son.socket.messages.find(x=>x.type==='searchError')?.message||'',/temporarily unavailable/);
});
