import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {BackupStore} from '../server/backup-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return structuredClone(this.map.get(key));}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const request=(path,{method='GET',body}={})=>new Request(`https://backup${path}`,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
const make=()=>new BackupStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now:()=> '2026-09-20T07:00:00.000Z'});

test('backup store keeps primary and safety snapshots in isolated slots and promotes safety after restore',async()=>{
  const store=make(),primary={accountEntries:[{key:'account:a',value:{id:'a',walletCoins:200}},{key:'game:g1',value:{gameId:'g1'}}],rooms:[{roomCode:'ABCDEFGHJK2345',room:{roomCode:'ABCDEFGHJK2345'}}]};
  let response=await store.fetch(request('/snapshot/write',{method:'POST',body:{slot:'primary',snapshot:primary,metadata:{fingerprint:'fp1',resetMode:'full',accountCount:1,gameCount:1,sessionCount:0}}}));assert.equal(response.status,201);
  let status=await (await store.fetch(request('/status'))).json();assert.ok(status.primary);assert.equal(status.primary.fingerprint,'fp1');assert.equal(status.primary.accountEntries,2);assert.equal(status.primary.rooms,1);
  const safety={accountEntries:[{key:'account:b',value:{id:'b',walletCoins:300}}],rooms:[]};
  await store.fetch(request('/snapshot/write',{method:'POST',body:{slot:'safety',snapshot:safety,metadata:{fingerprint:'fp2',accountCount:1}}}));
  const promoted=await (await store.fetch(request('/promote-safety',{method:'POST',body:{}}))).json();assert.equal(promoted.primary.fingerprint,'fp2');
  status=await (await store.fetch(request('/status'))).json();assert.equal(status.primary.fingerprint,'fp2');assert.equal(status.safety,null);
  const snapshot=await (await store.fetch(request('/snapshot/primary'))).json();assert.equal(snapshot.snapshot.accountEntries[0].key,'account:b');
});

test('purging an account removes matching records from all restore points so deletion cannot be undone from backup',async()=>{
  const store=make(),snapshot={accountEntries:[
    {key:'account:acct-1',value:{id:'acct-1',email:'a@example.com'}},
    {key:'email:a@example.com',value:'acct-1'},
    {key:'game:g1',value:{participants:[{accountId:'acct-1'}]}},
    {key:'account:acct-2',value:{id:'acct-2'}}
  ],rooms:[{roomCode:'ABCDEFGHJK2345',room:{participants:[{accountId:'acct-1'}]}}]};
  await store.fetch(request('/snapshot/write',{method:'POST',body:{slot:'primary',snapshot,metadata:{fingerprint:'original'}}}));
  const purged=await (await store.fetch(request('/purge-account',{method:'POST',body:{accountId:'acct-1'}}))).json();assert.equal(purged.ok,true);assert.ok(purged.updated[0].removed>=4);
  const restored=await (await store.fetch(request('/snapshot/primary'))).json();assert.equal(restored.snapshot.metadata.fingerprint,'');assert.deepEqual(restored.snapshot.accountEntries.map(x=>x.key),['account:acct-2']);assert.equal(restored.snapshot.rooms.length,0);
});
