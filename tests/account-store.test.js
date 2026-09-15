import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountStore,passwordProblem} from '../server/account-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const makeStore=(iso='2026-09-15T03:30:00.000Z')=>new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:globalThis.crypto,now:()=>iso});
const post=(path,body,headers={})=>new Request(`https://accounts${path}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});

test('registration creates account, awards signup and first daily coins, and returns a session',async()=>{
  const store=makeStore();
  const response=await store.fetch(post('/register',{email:'Player@example.com',nickname:'Player One',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  assert.equal(response.status,201);const body=await response.json();
  assert.equal(body.ok,true);assert.equal(body.account.walletCoins,200);assert.equal(body.awards.signupCoins,100);assert.equal(body.awards.dailyCoins,100);assert.ok(body.session.token.length>=40);
});

test('daily login reward is awarded only once per UTC day',async()=>{
  const store=makeStore();
  const registered=await (await store.fetch(post('/register',{email:'daily@example.com',nickname:'DailyPlayer',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const login=await (await store.fetch(post('/login',{email:'daily@example.com',password:'BetterPass9'}))).json();
  assert.equal(login.awards.dailyCoins,0);assert.equal(login.account.walletCoins,200);
  const me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${registered.session.token}`}}))).json();
  assert.equal(me.awards.dailyCoins,0);assert.equal(me.account.walletCoins,200);
});

test('leaderboard counts only coins won while wallet includes wins and losses',async()=>{
  const store=makeStore();
  const a=await (await store.fetch(post('/register',{email:'a@example.com',nickname:'Alpha',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const b=await (await store.fetch(post('/register',{email:'b@example.com',nickname:'Beta',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  await store.fetch(post('/internal/game/settle',{gameId:'g1',mode:'online',participants:[{accountId:a.account.id,won:true,walletDelta:17,coinsWon:17},{accountId:b.account.id,won:false,walletDelta:-17,coinsWon:0}]}));
  await store.fetch(post('/internal/game/settle',{gameId:'g2',mode:'online',participants:[{accountId:a.account.id,won:false,walletDelta:-12,coinsWon:0},{accountId:b.account.id,won:true,walletDelta:12,coinsWon:12}]}));
  const board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json();
  const alpha=board.global.find(row=>row.nickname==='Alpha'),beta=board.global.find(row=>row.nickname==='Beta');
  assert.equal(alpha.totalCoins,17);assert.equal(alpha.gamesPlayed,2);assert.equal(alpha.score,8.5);assert.equal(beta.totalCoins,12);assert.equal(beta.score,6);
  const storedA=await store.accountById(a.account.id);assert.equal(storedA.walletCoins,205);
});

test('duplicate game settlement is idempotent',async()=>{
  const store=makeStore();
  const a=await (await store.fetch(post('/register',{email:'idempotent@example.com',nickname:'Idempotent',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const settlement={gameId:'same-game',mode:'solo',participants:[{accountId:a.account.id,won:true,walletDelta:9,coinsWon:9}]};
  assert.equal((await (await store.fetch(post('/internal/game/settle',settlement))).json()).ok,true);
  assert.equal((await (await store.fetch(post('/internal/game/settle',settlement))).json()).duplicate,true);
  assert.equal((await store.accountById(a.account.id)).walletCoins,209);
});

test('common and too-short passwords are rejected',()=>{
  assert.ok(passwordProblem('12345'));assert.ok(passwordProblem('qwerty'));assert.ok(passwordProblem('short7'));assert.equal(passwordProblem('UsefulPass9'),null);
});
