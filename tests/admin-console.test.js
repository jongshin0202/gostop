import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {AccountStore} from '../server/ranked-account-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){const value=this.map.get(key);return value===undefined?undefined:structuredClone(value);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const now=()=> '2026-09-15T19:00:00.000Z';
const makeStore=()=>new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now});
const request=(path,{method='GET',body,token}={})=>new Request(`https://accounts${path}`,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const post=(path,body,token)=>request(path,{method:'POST',body,token});
const patch=(path,body,token)=>request(path,{method:'PATCH',body,token});
async function hex(buffer){return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');}
async function tokenHash(token){return hex(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));}
async function secretHash(secret,saltHex,iterations=100000){
  const salt=new Uint8Array(String(saltHex).match(/../g).map(value=>parseInt(value,16))),key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);
  return hex(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
async function adminToken(store,actor='Tester'){
  const token='test-admin-session-token',hash=await tokenHash(token);await store.storage.put(`adminSession:${hash}`,{actor,createdAt:now(),expiresAt:'2026-09-16T07:00:00.000Z'});return token;
}
async function register(store,email,nickname){
  const response=await store.fetch(post('/register',{email,nickname,password:'UsefulPass9',confirmPassword:'UsefulPass9'}));assert.equal(response.status,201);return (await response.json()).account;
}
async function settle(store,gameId,participants){const response=await store.fetch(post('/internal/game/settle',{gameId,mode:'online',participants}));assert.equal(response.status,200);}

test('admin login can use a rotated verifier without exposing account password material in admin state',async()=>{
  const store=makeStore(),salt='00112233445566778899aabbccddeeff',key='test-admin-key-that-is-long',hash=await secretHash(key,salt);await store.storage.put('admin:config',{salt,hash,iterations:100000});
  const login=await store.fetch(post('/admin/login',{actor:'QA Admin',key}));assert.equal(login.status,200);const session=(await login.json()).session;assert.ok(session.token.length>=40);
  await register(store,'safe@example.com','SafePlayer');const state=await (await store.fetch(request('/admin/state',{token:session.token}))).json();const encoded=JSON.stringify(state);
  assert.equal(state.ok,true);assert.equal(state.accounts.length,1);assert.equal(encoded.includes('passwordHash'),false);assert.equal(encoded.includes('passwordSalt'),false);assert.equal(encoded.includes('passwordIterations'),false);
});

test('admin can add, modify, delete and restore an account while identity indexes and login access stay consistent',async()=>{
  const store=makeStore(),token=await adminToken(store);
  const createdResponse=await store.fetch(post('/admin/accounts',{email:'created@example.com',nickname:'CreatedPlayer',password:'UsefulPass9',walletCoins:350,globalStats:{gamesPlayed:4,wins:3,totalCoinsWon:40,milestones:{KISS:2}}},token));assert.equal(createdResponse.status,201);const created=(await createdResponse.json()).account;
  assert.equal(created.walletCoins,350);assert.equal((await store.storage.get('email:created@example.com')),created.id);
  const updatedResponse=await store.fetch(patch(`/admin/accounts/${created.id}`,{email:'changed@example.com',nickname:'ChangedPlayer',walletCoins:-25,forceQuits:3,globalStats:{gamesPlayed:8,wins:4,totalCoinsWon:72,milestones:{KISS:5}}},token));assert.equal(updatedResponse.status,200);
  assert.equal(await store.storage.get('email:created@example.com'),undefined);assert.equal(await store.storage.get('nickname:createdplayer'),undefined);assert.equal(await store.storage.get('email:changed@example.com'),created.id);assert.equal(await store.storage.get('nickname:changedplayer'),created.id);
  const board=await (await store.fetch(request('/leaderboards'))).json();assert.equal(board.global.find(row=>row.nickname==='ChangedPlayer').totalCoins,72);
  const deleted=await store.fetch(post(`/admin/accounts/${created.id}/delete`,{},token));assert.equal(deleted.status,200);const afterDelete=await (await store.fetch(request('/leaderboards'))).json();assert.equal(afterDelete.global.some(row=>row.nickname==='ChangedPlayer'),false);
  const loginAfterDelete=await store.fetch(post('/login',{email:'changed@example.com',password:'UsefulPass9'}));assert.equal(loginAfterDelete.status,401);
  const restored=await store.fetch(post(`/admin/accounts/${created.id}/restore`,{},token));assert.equal(restored.status,200);const afterRestore=await (await store.fetch(request('/leaderboards'))).json();assert.equal(afterRestore.global.some(row=>row.nickname==='ChangedPlayer'),true);
});

test('admin manual order overrides calculated leaderboard order without changing scores',async()=>{
  const store=makeStore(),token=await adminToken(store),alpha=await register(store,'alpha@example.com','Alpha'),beta=await register(store,'beta@example.com','Beta');
  await settle(store,'order-1',[{accountId:alpha.id,won:true,walletDelta:5,coinsWon:5},{accountId:beta.id,won:false,walletDelta:-5,coinsWon:0}]);
  await settle(store,'order-2',[{accountId:beta.id,won:true,walletDelta:20,coinsWon:20},{accountId:alpha.id,won:false,walletDelta:-20,coinsWon:0}]);
  const natural=await (await store.fetch(request('/leaderboards'))).json();assert.deepEqual(natural.global.map(row=>row.nickname),['Beta','Alpha']);
  const saved=await store.fetch(post('/admin/leaderboards/order',{scope:'global',orderedAccountIds:[alpha.id,beta.id]},token));assert.equal(saved.status,200);
  const manual=await (await store.fetch(request('/leaderboards'))).json();assert.deepEqual(manual.global.map(row=>row.nickname),['Alpha','Beta']);assert.equal(manual.global.find(row=>row.nickname==='Alpha').score,2.5);assert.equal(manual.global.find(row=>row.nickname==='Beta').score,10);
});

test('clearing Global leaderboard preserves Wallet Coins and can be safely undone from audit',async()=>{
  const store=makeStore(),token=await adminToken(store),alpha=await register(store,'clear@example.com','ClearPlayer');await settle(store,'clear-game',[{accountId:alpha.id,won:true,walletDelta:14,coinsWon:14}]);
  const walletBefore=(await store.accountById(alpha.id)).walletCoins;const clear=await store.fetch(post('/admin/leaderboards/clear',{scope:'global',confirmation:'CLEAR GLOBAL'},token));assert.equal(clear.status,200);
  const cleared=await (await store.fetch(request('/leaderboards'))).json();assert.equal(cleared.global[0].gamesPlayed,0);assert.equal(cleared.global[0].totalCoins,0);assert.equal((await store.accountById(alpha.id)).walletCoins,walletBefore);
  const state=await (await store.fetch(request('/admin/state',{token}))).json(),audit=state.audit.find(item=>item.action==='leaderboard-clear');assert.ok(audit&&audit.undoable);
  const undo=await store.fetch(post('/admin/undo',{auditId:audit.id},token));assert.equal(undo.status,200);const restored=await (await store.fetch(request('/leaderboards'))).json();assert.equal(restored.global[0].gamesPlayed,1);assert.equal(restored.global[0].totalCoins,14);assert.equal((await store.accountById(alpha.id)).walletCoins,walletBefore);
});

test('monthly clear is isolated from Global stats and access-key rotation invalidates old admin sessions',async()=>{
  const store=makeStore(),token=await adminToken(store),alpha=await register(store,'month@example.com','MonthPlayer');await settle(store,'month-game',[{accountId:alpha.id,won:true,walletDelta:9,coinsWon:9}]);
  const clear=await store.fetch(post('/admin/leaderboards/clear',{scope:'monthly',month:'2026-09',confirmation:'CLEAR MONTH'},token));assert.equal(clear.status,200);const board=await (await store.fetch(request('/leaderboards'))).json();assert.equal(board.global[0].totalCoins,9);assert.equal(board.monthly[0].totalCoins,0);
  const rotated=await store.fetch(post('/admin/key/rotate',{newKey:'a-brand-new-admin-key-123'},token));assert.equal(rotated.status,200);const next=(await rotated.json()).session;assert.ok(next.token);const oldState=await store.fetch(request('/admin/state',{token}));assert.equal(oldState.status,401);const newState=await store.fetch(request('/admin/state',{token:next.token}));assert.equal(newState.status,200);
});
