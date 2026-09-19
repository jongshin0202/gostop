import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {AccountStore} from '../server/ranked-account-store.mjs';

class MemoryStorage{constructor(){this.map=new Map();}async get(key){return structuredClone(this.map.get(key));}async put(key,value){this.map.set(key,structuredClone(value));}async delete(key){this.map.delete(key);}async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}}
const post=(path,body,token)=>new Request(`https://accounts${path}`,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
async function registered(store,email,nickname){return (await (await store.fetch(post('/register',{email,nickname,password:'UsefulPass9',confirmPassword:'UsefulPass9'}))).json());}

test('first technical disconnect each month is free to quitter but still rewards leading opponent',async()=>{let clock='2026-09-15T04:45:00.000Z';const store=new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now:()=>clock}),q=await registered(store,'quit@example.com','Quitter'),w=await registered(store,'winner@example.com','Winner'),base={gameId:'force-1',sessionId:'s1',mode:'online',accountId:q.account.id,opponentAccountId:w.account.id,fairPoints:31,settlementType:'current-settlement',reason:'disconnect-timeout',recordedAt:clock};const one=await (await store.fetch(post('/internal/force-quit',base))).json();assert.equal(one.penaltyCoins,0);assert.equal(one.account.walletCoins,200);assert.equal(one.firstOfMonth,true);assert.equal(one.accountNotice.type,'disconnect-forgiven');assert.equal(one.opponentNotice.rewardCoins,31);const wAck=await (await store.fetch(post('/notices/ack',{noticeId:one.opponentNotice.id},w.session.token))).json();assert.equal(wAck.account.walletCoins,231);const qAck=await (await store.fetch(post('/notices/ack',{noticeId:one.accountNotice.id},q.session.token))).json();assert.equal(qAck.account.walletCoins,200);assert.equal(qAck.notice.appliedCoins,0);clock='2026-09-16T04:45:00.000Z';const two=await (await store.fetch(post('/internal/force-quit',{...base,gameId:'force-2',recordedAt:clock}))).json();assert.equal(two.firstOfMonth,false);assert.equal(two.penaltyCoins,31);assert.equal(two.account.walletCoins,169);assert.equal(two.accountNotice.type,'disconnect-loss');assert.equal(two.accountNotice.coinsLost,31);const lossAck=await (await store.fetch(post('/notices/ack',{noticeId:two.accountNotice.id},q.session.token))).json();assert.equal(lossAck.account.walletCoins,169);assert.equal(lossAck.notice.appliedCoins,0);clock='2026-10-01T04:45:00.000Z';const three=await (await store.fetch(post('/internal/force-quit',{...base,gameId:'force-3',recordedAt:clock}))).json();assert.equal(three.firstOfMonth,true);assert.equal(three.penaltyCoins,0);});
test('nagari disconnect transfers no Coins but consumes monthly protection',async()=>{let clock='2026-11-02T04:45:00.000Z';const store=new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now:()=>clock}),q=await registered(store,'nq@example.com','NagariQ'),w=await registered(store,'nw@example.com','NagariW');const one=await (await store.fetch(post('/internal/force-quit',{gameId:'n1',accountId:q.account.id,opponentAccountId:w.account.id,fairPoints:0,settlementType:'nagari',reason:'disconnect-timeout',recordedAt:clock}))).json();assert.equal(one.firstOfMonth,true);assert.equal(one.penaltyCoins,0);assert.equal(one.accountNotice,null);clock='2026-11-03T04:45:00.000Z';const two=await (await store.fetch(post('/internal/force-quit',{gameId:'n2',accountId:q.account.id,opponentAccountId:w.account.id,fairPoints:12,settlementType:'current-settlement',reason:'disconnect-timeout',recordedAt:clock}))).json();assert.equal(two.firstOfMonth,false);assert.equal(two.penaltyCoins,12);});
test('migration removes legacy abandonment notices and starts new allowance cleanly',async()=>{const storage=new MemoryStorage(),store=new AccountStore({storage},{},{cryptoApi:webcrypto,now:()=> '2026-09-17T12:00:00.000Z'}),q=await registered(store,'legacy@example.com','Legacy'),account=await store.accountById(q.account.id);account.pendingNotices=[...(account.pendingNotices||[]),{id:'abandonment:old',type:'abandonment',penaltyCoins:27}];account.abandonmentPolicyVersion=1;delete account.disconnectPolicyVersion;await storage.put(`account:${account.id}`,account);const me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${q.session.token}`}}))).json();assert.equal(me.notices.some(x=>x.type==='abandonment'),false);const migrated=await store.accountById(q.account.id);assert.deepEqual(migrated.disconnectsByMonth,{});assert.equal(migrated.disconnectPolicyVersion,2);});

test('daily login credits 198 to 298 immediately and notice acknowledgement does not undo or double-credit it',async()=>{
  let clock='2026-09-15T04:45:00.000Z';
  const storage=new MemoryStorage(),store=new AccountStore({storage},{},{cryptoApi:webcrypto,now:()=>clock}),user=await registered(store,'daily@example.com','DailyPlayer');
  const account=await store.accountById(user.account.id);account.walletCoins=198;account.lastDailyAwardDate='2026-09-15';await storage.put(`account:${account.id}`,account);
  clock='2026-09-16T04:45:00.000Z';
  const me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${user.session.token}`}}))).json();
  assert.equal(me.account.walletCoins,298);const notice=me.notices.find(item=>item.type==='daily-login');assert.ok(notice);
  const ack=await (await store.fetch(post('/notices/ack',{noticeId:notice.id},user.session.token))).json();
  assert.equal(ack.account.walletCoins,298);assert.equal(ack.notice.appliedCoins,0);assert.equal((await store.accountById(account.id)).walletCoins,298);
});

test('daily reward follows player local calendar day and migrates legacy UTC award dates from ledger timestamps',async()=>{
  let clock='2026-09-18T00:30:00.000Z';
  const storage=new MemoryStorage(),store=new AccountStore({storage},{},{cryptoApi:webcrypto,now:()=>clock}),user=await registered(store,'timezone@example.com','TimeZonePlayer');
  assert.equal(user.account.walletCoins,200);
  const legacy=await store.accountById(user.account.id);
  delete legacy.lastDailyAwardAt;delete legacy.dailyAwardTimeZone;
  legacy.lastDailyAwardDate='2026-09-18';
  await storage.put(`account:${legacy.id}`,legacy);

  const meRequest=()=>new Request('https://accounts/me',{headers:{Authorization:`Bearer ${user.session.token}`,'x-gostop-country':'US','x-gostop-region':'IL','x-gostop-timezone':'America/Chicago'}});

  clock='2026-09-18T14:00:00.000Z';
  const migrated=await (await store.fetch(meRequest())).json();
  assert.equal(migrated.awards.dailyCoins,100);
  assert.equal(migrated.account.walletCoins,300);
  let stored=await store.accountById(legacy.id);
  assert.equal(stored.lastDailyAwardDate,'2026-09-18');
  assert.equal(stored.lastDailyAwardAt,'2026-09-18T14:00:00.000Z');
  assert.equal(stored.dailyAwardTimeZone,'America/Chicago');

  clock='2026-09-19T01:00:00.000Z';
  const sameLocalDay=await (await store.fetch(meRequest())).json();
  assert.equal(sameLocalDay.awards.dailyCoins,0);
  assert.equal(sameLocalDay.account.walletCoins,300);

  clock='2026-09-19T06:00:00.000Z';
  const nextLocalDay=await (await store.fetch(meRequest())).json();
  assert.equal(nextLocalDay.awards.dailyCoins,100);
  assert.equal(nextLocalDay.account.walletCoins,400);
});


test('account exposes one authoritative active ranked session and clears it only when that session ends',async()=>{
  const store=new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now:()=> '2026-09-19T06:30:00.000Z'}),user=await registered(store,'active@example.com','ActivePlayer');
  await store.fetch(post('/internal/session/start',{sessionId:'solo-ROOMCODE12345-1-test',mode:'solo',accountIds:[user.account.id],opponent:{type:'computer',level:1},roomCode:'ROOMCODE12345A',matchId:'match-1',gameSequence:1,startedAt:'2026-09-19T06:30:00.000Z'}));
  let me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${user.session.token}`}}))).json();
  assert.deepEqual(me.account.activeRanked,{sessionId:'solo-ROOMCODE12345-1-test',mode:'solo',roomCode:'ROOMCODE12345A',startedAt:'2026-09-19T06:30:00.000Z'});
  const second=await store.fetch(post('/internal/session/start',{sessionId:'online-SECONDROOM123-1-test',mode:'online',accountIds:[user.account.id],roomCode:'SECONDROOM12345',matchId:'match-2',gameSequence:1,startedAt:'2026-09-19T06:31:00.000Z'}));
  assert.equal(second.status,409);assert.equal((await second.json()).error.code,'ACTIVE_RANKED_GAME');
  me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${user.session.token}`}}))).json();assert.equal(me.account.activeRanked.sessionId,'solo-ROOMCODE12345-1-test');
  await store.fetch(post('/internal/session/end',{sessionId:'solo-ROOMCODE12345-1-test',endedAt:'2026-09-19T06:40:00.000Z',summary:{gamesPlayed:1,reason:'quit'}}));
  me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${user.session.token}`}}))).json();
  assert.equal(me.account.activeRanked,null);
});
