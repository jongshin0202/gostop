'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

class MemoryStorage{
  constructor(entries=[]){this.map=new Map(entries);}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,value);}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>String(key).startsWith(prefix)));}
}

test('AccountStore removes pending notices whose IDs were already acknowledged',async()=>{
  const {AccountStore}=await import('../server/account-store.mjs');
  const daily={id:'daily:2026-09-19',type:'daily-login',coins:100,walletBefore:1571,walletAfter:1671,createdAt:'2026-09-19T14:00:00.000Z'};
  const account={id:'acct_test',walletCoins:1671,pendingNotices:[daily],acknowledgedNoticeIds:[daily.id],updatedAt:'2026-09-19T14:00:00.000Z'};
  const storage=new MemoryStorage([[`account:${account.id}`,account]]);
  const store=new AccountStore({storage},{},{now:()=> '2026-09-19T15:00:00.000Z'});

  assert.deepEqual(store.noticeList(account),[]);
  await store.prepareNotices(account);

  assert.deepEqual(account.pendingNotices,[]);
  assert.deepEqual(store.noticeList(account),[]);
  assert.equal((await storage.get(`account:${account.id}`)).pendingNotices.length,0);
});

test('AccountStore preserves a genuinely unacknowledged Daily Login Bonus notice',async()=>{
  const {AccountStore}=await import('../server/account-store.mjs');
  const daily={id:'daily:2026-09-19',type:'daily-login',coins:100,walletBefore:1571,walletAfter:1671,createdAt:'2026-09-19T14:00:00.000Z'};
  const account={id:'acct_test_2',walletCoins:1671,pendingNotices:[daily],acknowledgedNoticeIds:[],updatedAt:'2026-09-19T14:00:00.000Z'};
  const storage=new MemoryStorage([[`account:${account.id}`,account]]);
  const store=new AccountStore({storage},{},{now:()=> '2026-09-19T15:00:00.000Z'});

  await store.prepareNotices(account);

  assert.equal(account.pendingNotices.length,1);
  assert.equal(store.noticeList(account)[0].id,daily.id);
});
