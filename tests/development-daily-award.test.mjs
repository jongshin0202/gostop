import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {AccountStore} from '../server/development-account-store.mjs';

class Storage{
 constructor(){this.map=new Map();}
 async get(k){return structuredClone(this.map.get(k));}
 async put(k,v){this.map.set(k,structuredClone(v));}
 async delete(k){this.map.delete(k);}
 async list({prefix=''}={}){return new Map([...this.map].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
}
const post=(path,data,zone)=>new Request('https://accounts'+path,{
 method:'POST',headers:{'content-type':'application/json','x-gostop-timezone':zone},
 body:JSON.stringify(data)
});
test('development account daily Coins cannot be re-awarded by changing browser timezone',async()=>{
 let now='2026-11-02T02:00:00.000Z'; // Nov 1 in Chicago, Nov 2 in Tokyo
 const storage=new Storage();
 const store=new AccountStore({storage},{},{cryptoApi:webcrypto,now:()=>now});
 const registration=await (await store.fetch(post('/register',{
   email:'test-dev-award@example.com',nickname:'AwardGuard',password:'BetterPass9',confirmPassword:'BetterPass9'
 },'America/Chicago'))).json();
 assert.equal(registration.awards.dailyCoins,100);
 assert.equal(registration.account.walletCoins,200);
 let account=await store.accountByEmail('test-dev-award@example.com');
 assert.equal(account.dailyAwardTimeZone,'America/Chicago');
 assert.equal(account.lastDailyAwardDate,'2026-11-01');
 const login=await (await store.fetch(post('/login',{
   email:'test-dev-award@example.com',password:'BetterPass9'
 },'Asia/Tokyo'))).json();
 assert.equal(login.awards.dailyCoins,0);
 assert.equal(login.account.walletCoins,200);
 const me=await (await store.fetch(new Request('https://accounts/me',{
   headers:{authorization:'Bearer '+registration.session.token,'x-gostop-timezone':'Pacific/Auckland'}
 }))).json();
 assert.equal(me.awards.dailyCoins,0);
 assert.equal(me.account.walletCoins,200);
 account=await store.accountByEmail('test-dev-award@example.com');
 assert.equal(account.dailyAwardTimeZone,'America/Chicago');
 assert.equal(account.lastDailyAwardDate,'2026-11-01');
 const firstLedgers=[...storage.map.values()].filter(x=>x?.type==='daily-login');
 assert.equal(firstLedgers.length,1,'one daily ledger credit on Nov 1 in established timezone');
 // At the next Chicago midnight, a single new daily award is legitimate.
 now='2026-11-02T16:00:00.000Z';
 const next=await (await store.fetch(new Request('https://accounts/me',{
   headers:{authorization:'Bearer '+registration.session.token,'x-gostop-timezone':'Pacific/Honolulu'}
 }))).json();
 assert.equal(next.awards.dailyCoins,100);
 assert.equal(next.account.walletCoins,300);
 const replay=await (await store.fetch(post('/login',{
   email:'test-dev-award@example.com',password:'BetterPass9'
 },'Asia/Tokyo'))).json();
 assert.equal(replay.awards.dailyCoins,0);
 assert.equal(replay.account.walletCoins,300);
 assert.equal([...storage.map.values()].filter(x=>x?.type==='daily-login').length,2);
});
