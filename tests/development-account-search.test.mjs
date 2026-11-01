import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountStore} from '../server/development-account-store.mjs';
const account=(id,nickname,games,wins,won,lost)=>({
 id,nickname,walletCoins:200,location:{countryCode:'US',regionCode:'IL'},
 emailVerified:true,stats:{global:{gamesPlayed:games,wins,losses:games-wins,
 totalCoinsWon:won,totalCoinsLost:lost},monthly:{}}
});
test('fast development nickname lookup skips expensive game history with ranked results',async()=>{
 const users=[
  account('a','Jung',15,9,300,120),
  account('b','Jungle',1,1,30,0),
  account('c','Other',22,15,600,200)
 ];
 const state={storage:{
  list:async({prefix})=>{
   if(prefix!=='account:')throw Error('Search must not scan full game history');
   return new Map(users.map(x=>['account:'+x.id,x]));
  }
 }};
 const store=new AccountStore(state,{});
 store.ensureOutcomeHistoryRepair=()=>{throw Error('Do not trigger expensive migration during search');};
 store.headToHeadFor=()=>{throw Error('Do not scan all prior games during search');};
 const response=await store.playerSearch(new Request('https://accounts/internal/player-search',{
  method:'POST',body:JSON.stringify({query:'Jung',requesterAccountId:'c'})}));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.deepEqual(data.players.map(x=>x.nickname),['Jung','Jungle']);
 assert.equal(data.players[0].globalRank,2);
 assert.equal(data.players[0].gamesPlayed,15);
 assert.equal(data.players[0].historyUnavailable,true);
 assert.equal(data.players[1].globalRank,0);
});
test('fast nickname search never exposes suspended or unverified players',async()=>{
 const blocked={...account('x','JungSuspended',20,5,400,30),suspended:true};
 const hidden={...account('y','JungUnverified',20,5,400,30),emailVerified:false};
 const state={storage:{list:async()=>new Map([[blocked.id,blocked],[hidden.id,hidden]])}};
 const store=new AccountStore(state,{});
 const data=await store.playerSearch(new Request('https://accounts/internal/player-search',{
  method:'POST',body:JSON.stringify({query:'Jung'})})).then(r=>r.json());
 assert.deepEqual(data.players,[]);
});
