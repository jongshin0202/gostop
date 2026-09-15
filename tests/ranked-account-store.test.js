import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {AccountStore} from '../server/ranked-account-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return structuredClone(this.map.get(key));}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const now='2026-09-15T04:45:00.000Z';
const post=(path,body)=>new Request(`https://accounts${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
async function registered(store,email,nickname){return (await (await store.fetch(post('/register',{email,nickname,password:'UsefulPass9',confirmPassword:'UsefulPass9'}))).json()).account;}

test('force quit is idempotent, counts a loss, transfers penalty to online opponent, and credits leaderboard coins only to winner',async()=>{
  const store=new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now:()=>now}),quitter=await registered(store,'quit@example.com','Quitter'),winner=await registered(store,'winner@example.com','Winner');
  const body={gameId:'force-1',sessionId:'session-1',mode:'online',accountId:quitter.id,opponentAccountId:winner.id,penaltyCoins:31,quitterMilestones:{SHAKE:1},opponentMilestones:{KISS:1},reason:'disconnect-timeout',recordedAt:now};
  const first=await (await store.fetch(post('/internal/force-quit',body))).json();assert.equal(first.ok,true);assert.equal(first.penaltyCoins,31);assert.equal(first.account.walletCoins,169);assert.equal(first.opponent.walletCoins,231);
  const q=await store.accountById(quitter.id),w=await store.accountById(winner.id);assert.equal(q.forceQuits,1);assert.equal(q.stats.global.gamesPlayed,1);assert.equal(q.stats.global.totalCoinsWon,0);assert.equal(q.stats.global.milestones.SHAKE,1);assert.equal(w.stats.global.gamesPlayed,1);assert.equal(w.stats.global.wins,1);assert.equal(w.stats.global.totalCoinsWon,31);assert.equal(w.stats.global.milestones.KISS,1);
  const duplicate=await (await store.fetch(post('/internal/force-quit',body))).json();assert.equal(duplicate.duplicate,true);assert.equal((await store.accountById(quitter.id)).walletCoins,169);assert.equal((await store.accountById(winner.id)).walletCoins,231);
});
