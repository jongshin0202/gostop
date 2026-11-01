import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Lobby} from '../dev-site/worker-dist/server/lobby.mjs';
import {instrumentDevOnlinePlayersClient} from '../dev-site/instrument-online-players-client.mjs';
import {instrumentDevResponsiveLobby} from '../dev-site/instrument-online-lobby-responsiveness.mjs';
import {instrumentDevFriendlyInvite} from '../dev-site/instrument-friendly-invite.mjs';
let n=0;
function client(id,nickname,{online=true,twoPlayer=false,wallet=1000}={}){
 const now=Date.now();
 return {clientId:'online-roster-'+(++n),
  socket:{messages:[],send(data){this.messages.push(JSON.parse(data));},close(){}},
  account:{id,nickname,walletCoins:wallet,countryCode:'US'},
  tabId:'tab-'+id,available:!twoPlayer,twoPlayer,foreground:true,
  connectedAt:now,lastActivityAt:now,lastPresenceAt:online?now:now-120000,
  mode:twoPlayer?'competitive-online':'menu',notificationsEnabled:false};
}
const make=()=>{
 const l=new Lobby({waitUntil(p){p.catch(()=>{});}},{ACCOUNT_STORE:null});
 l.cachedLeaderboardRows=new Map();l.cachedLeaderboardAt=Date.now();
 return l;
};
test('Online Players returns all online accounts in 10-player pages and correctly stops at boundaries',async()=>{
 const l=make(),me=client('viewer','SonGoku');
 l.clients.set(me.socket,me);
 for(let i=1;i<=24;i++){
  const c=client('id-'+i,'Player'+String(i).padStart(2,'0'));
  l.clients.set(c.socket,c);
 }
 await l.handle(me,JSON.stringify({type:'onlinePlayers',offset:0}));
 let p=me.socket.messages.at(-1);
 assert.equal(p.type,'onlinePlayers');assert.equal(p.total,24);
 assert.equal(p.players.length,10);assert.equal(p.offset,0);
 assert.equal(p.hasPrevious,false);assert.equal(p.hasNext,true);
 assert.equal(new Set(p.players.map(x=>x.accountId)).size,10);
 await l.handle(me,JSON.stringify({type:'onlinePlayers',offset:10}));
 p=me.socket.messages.at(-1);assert.equal(p.offset,10);assert.equal(p.players.length,10);
 assert.equal(p.hasPrevious,true);assert.equal(p.hasNext,true);
 await l.handle(me,JSON.stringify({type:'onlinePlayers',offset:20}));
 p=me.socket.messages.at(-1);assert.equal(p.offset,20);assert.equal(p.players.length,4);
 assert.equal(p.hasPrevious,true);assert.equal(p.hasNext,false);
 await l.handle(me,JSON.stringify({type:'onlinePlayers',offset:900}));
 assert.equal(me.socket.messages.at(-1).offset,20,'past-last-page clamps to final page');
 await l.handle(me,JSON.stringify({type:'onlinePlayers',offset:-99}));
 assert.equal(me.socket.messages.at(-1).offset,0,'negative offsets clamp to first page');
});
test('Online Players reflects authoritative presence and does not offer Play to an in-game account',async()=>{
 const l=make(),me=client('me','SonGoku'),veg=client('veg','Vegeta'),
 busy=client('busy','Busy',{twoPlayer:true}),stale=client('stale','Gone',{online:false});
 for(const c of [me,veg,busy,stale])l.clients.set(c.socket,c);
 const list=l.listOnlinePlayers(me);
 assert.equal(list.total,2);
 assert.deepEqual(new Set(list.players.map(x=>x.nickname)),new Set(['Vegeta','Busy']));
 assert.equal(list.players.find(x=>x.nickname==='Vegeta').challengeable,true);
 assert.equal(list.players.find(x=>x.nickname==='Busy').challengeable,false);
 assert.equal(list.players.find(x=>x.nickname==='Busy').status,'in-game');
});
test('Online Players sorts by existing skill similarity, not alphabetical order',()=>{
 const l=make(),me=client('me','SonGoku'),similar=client('similar','Zeta'),
 far=client('far','Alpha');
 for(const c of [me,similar,far])l.clients.set(c.socket,c);
 l.cachedLeaderboardRows=new Map([
  ['songoku',{gamesPlayed:100,totalCoins:1000,coinsPerGame:10}],
  ['zeta',{gamesPlayed:98,totalCoins:980,coinsPerGame:10}],
  ['alpha',{gamesPlayed:1,totalCoins:100,coinsPerGame:100}]
 ]);
 const list=l.listOnlinePlayers(me);
 assert.equal(list.players[0].nickname,'Zeta');
 assert.ok(list.players[0].similarity>list.players[1].similarity);
});
test('generated Online Players client has a fourth button and paging controls without changing protected source',async()=>{
 const original=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const generated=instrumentDevOnlinePlayersClient(instrumentDevResponsiveLobby(instrumentDevFriendlyInvite(original)));
 assert.ok(generated.includes('id="onlinePlayersBtn"'));
 assert.ok(generated.includes('id="onlineRosterPrev"'));
 assert.ok(generated.includes('id="onlineRosterNext"'));
 assert.ok(generated.includes("message.type==='onlinePlayers'"));
 assert.equal(original.includes('id="onlinePlayersBtn"'),false);
 assert.doesNotThrow(()=>new Function(generated),'development ranked client must parse');
});
