import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import {AccountStore} from '../server/ranked-account-store.mjs';
import worker from '../server/worker.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return structuredClone(this.map.get(key));}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const geo={'x-gostop-ip':'203.0.113.9','x-gostop-city':'Chicago','x-gostop-region-name':'Illinois','x-gostop-region':'IL','x-gostop-country':'US','x-gostop-timezone':'America/Chicago'};
const request=(path,{method='GET',body,headers={}}={})=>new Request(`https://accounts${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
const admin=(path,options={})=>request(path,{...options,headers:{'x-gostop-admin':'1',...geo,...(options.headers||{})}});
const register=async(store,email='admin-player@example.com',nickname='AdminPlayer')=>(await (await store.fetch(request('/register',{method:'POST',headers:geo,body:{email,nickname,password:'UsefulPass9',confirmPassword:'UsefulPass9'}}))).json());
const storeAt=(iso='2026-09-18T15:00:00.000Z')=>new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:webcrypto,now:()=>iso});

test('admin gateway requires configured secret and valid bearer token',async()=>{
  const origin={'Origin':'https://gostoplive.com'};
  const missing=await worker.fetch(new Request('https://worker/api/admin/health',{headers:origin}),{});
  assert.equal(missing.status,503);
  const unauthorized=await worker.fetch(new Request('https://worker/api/admin/health',{headers:origin}),{ADMIN_TOKEN:'top-secret'});
  assert.equal(unauthorized.status,401);
  const authorized=await worker.fetch(new Request('https://worker/api/admin/health',{headers:{...origin,Authorization:'Bearer top-secret'}}),{ADMIN_TOKEN:'top-secret'});
  assert.equal(authorized.status,200);assert.equal((await authorized.json()).admin,true);
});

test('player-facing account omits raw IP while protected admin detail exposes connection history',async()=>{
  const store=storeAt(),registered=await register(store);
  assert.equal(Object.hasOwn(registered.account,'ip'),false);assert.equal(Object.hasOwn(registered.account,'lastConnection'),false);
  const detail=await (await store.fetch(admin(`/admin/players/${registered.account.id}`))).json();
  assert.equal(detail.ok,true);assert.equal(detail.player.nickname,'AdminPlayer');assert.ok(detail.connections.length>=1);
  assert.equal(detail.connections[0].ip,'203.0.113.9');assert.equal(detail.connections[0].city,'Chicago');assert.equal(detail.connections[0].region,'Illinois');assert.equal(detail.connections[0].countryCode,'US');
});

test('wallet adjustment is reason-required, changes authoritative Wallet, writes ledger and immutable audit',async()=>{
  const store=storeAt(),registered=await register(store),id=registered.account.id;
  const denied=await store.fetch(admin(`/admin/players/${id}/wallet`,{method:'POST',body:{delta:25}}));assert.equal(denied.status,400);
  const result=await (await store.fetch(admin(`/admin/players/${id}/wallet`,{method:'POST',body:{delta:25,reason:'Support correction'}}))).json();
  assert.equal(result.player.walletCoins,225);
  const detail=await (await store.fetch(admin(`/admin/players/${id}`))).json();
  assert.ok(detail.ledger.some(entry=>entry.type==='admin-adjustment'&&entry.amount===25));
  const audit=await (await store.fetch(admin('/admin/audit?limit=10'))).json();
  assert.ok(audit.audit.some(entry=>entry.action==='wallet-adjust'&&entry.reason==='Support correction'&&entry.actor.ip==='203.0.113.9'));
});

test('admin game listing filters abandoned games and ranking can rank forced abandon players',async()=>{
  const store=storeAt(),q=await register(store,'quit@example.com','QuitPlayer'),w=await register(store,'winner@example.com','WinnerPlayer');
  const base={sessionId:'s1',mode:'online',accountId:q.account.id,opponentAccountId:w.account.id,fairPoints:5,settlementType:'current-settlement',reason:'disconnect-timeout',recordedAt:'2026-09-18T15:00:00.000Z'};
  await store.fetch(request('/internal/force-quit',{method:'POST',body:{...base,gameId:'abandon-1'}}));
  await store.fetch(request('/internal/force-quit',{method:'POST',body:{...base,gameId:'abandon-2',recordedAt:'2026-09-18T16:00:00.000Z'}}));
  const games=await (await store.fetch(admin('/admin/games?kind=abandoned&limit=20'))).json();
  assert.equal(games.total,2);assert.ok(games.games.every(game=>game.type==='abandoned'));
  const ranks=await (await store.fetch(admin('/admin/rankings?metric=abandons&limit=10'))).json();
  assert.equal(ranks.rankings[0].accountId,q.account.id);assert.equal(ranks.rankings[0].abandons,2);
});

test('leaderboard reset archives prior stats and rebuild restores derived stats from immutable games',async()=>{
  const store=storeAt(),a=await register(store,'a@example.com','AlphaAdmin'),b=await register(store,'b@example.com','BetaAdmin');
  await store.fetch(request('/internal/game/settle',{method:'POST',body:{gameId:'game-1',mode:'online',recordedAt:'2026-09-18T15:10:00.000Z',participants:[{accountId:a.account.id,nickname:'AlphaAdmin',won:true,walletDelta:9,coinsWon:9,points:9},{accountId:b.account.id,nickname:'BetaAdmin',won:false,walletDelta:-9,coinsWon:0,points:0}]}}));
  let boards=await (await store.fetch(admin('/admin/leaderboards?month=2026-09'))).json();assert.equal(boards.global.find(row=>row.accountId===a.account.id).gamesPlayed,1);
  const reset=await (await store.fetch(admin('/admin/leaderboards/reset',{method:'POST',body:{scope:'global',reason:'Test reset'}}))).json();assert.ok(reset.archiveId);
  boards=await (await store.fetch(admin('/admin/leaderboards?month=2026-09'))).json();assert.equal(boards.global.find(row=>row.accountId===a.account.id).gamesPlayed,0);
  await store.fetch(admin('/admin/leaderboards/rebuild',{method:'POST',body:{scope:'global',reason:'Test rebuild'}}));
  boards=await (await store.fetch(admin('/admin/leaderboards?month=2026-09'))).json();assert.equal(boards.global.find(row=>row.accountId===a.account.id).gamesPlayed,1);assert.equal(boards.global.find(row=>row.accountId===a.account.id).wins,1);
  const archives=await store.storage.list({prefix:'leaderboardArchive:'});assert.equal(archives.size,1);
});

test('admin suspension blocks login and authenticated game resolution',async()=>{
  const store=storeAt(),registered=await register(store),id=registered.account.id;
  await store.fetch(admin(`/admin/players/${id}/profile`,{method:'POST',body:{suspended:true,suspensionReason:'Abuse review',reason:'Abuse review'}}));
  const login=await store.fetch(request('/login',{method:'POST',headers:geo,body:{email:'admin-player@example.com',password:'UsefulPass9'}}));assert.equal(login.status,403);
  const resolve=await (await store.fetch(request('/internal/resolve',{headers:{...geo,Authorization:`Bearer ${registered.session.token}`}}))).json();assert.equal(resolve.account,null);
});

test('new ranked settlements persist authoritative history and admin files stay unlinked from public menu',()=>{
  const finalRoom=fs.readFileSync(new URL('../server/ranked-room-final.mjs',import.meta.url),'utf8'),index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),adminHtml=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
  assert.match(finalRoom,/adminGameHistory\(\)/);assert.match(finalRoom,/history:this\.adminGameHistory\(\)/);
  assert.doesNotMatch(index,/admin\.html/);assert.match(adminHtml,/noindex,nofollow,noarchive/);assert.match(adminHtml,/Authorized administrators only/);
});

test('admin dashboard uses authoritative GoStop server configuration with Worker fallback',()=>{
  const adminJs=fs.readFileSync(new URL('../admin.js',import.meta.url),'utf8');
  assert.match(adminJs,/globalThis\.GOSTOP_CONFIG\?\.serverUrl\|\|DEFAULT_SERVER_URL/);
  assert.match(adminJs,/https:\/\/gostop-authority\.jwshin1\.workers\.dev/);
  assert.doesNotMatch(adminJs,/globalThis\.GOSTOP_SERVER_URL/);
});

test('admin login uses explicit button handler, visible connection feedback, and cache-busted script',()=>{
  const adminHtml=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8'),adminJs=fs.readFileSync(new URL('../admin.js',import.meta.url),'utf8');
  assert.match(adminHtml,/id="openDashboardBtn"/);
  assert.match(adminHtml,/admin\.js\?v=20260918-4/);
  assert.match(adminJs,/openDashboardBtn'\)\.addEventListener\('click',submitAdminLogin\)/);
  assert.match(adminJs,/Connecting…/);
  assert.match(adminJs,/Connecting securely to the GoStop authority/);
  assert.match(adminJs,/adminLogin'\)\.hidden=false/);
});
test('admin authentication failures are explicit to the administrator',()=>{
  const adminJs=fs.readFileSync(new URL('../admin.js',import.meta.url),'utf8');
  assert.match(adminJs,/Admin token rejected\. Enter the exact value currently stored in Cloudflare as ADMIN_TOKEN\./);
  assert.match(adminJs,/ADMIN_TOKEN is not active on the Cloudflare Worker yet/);
  assert.match(adminJs,/alert\(message\)/);
});

test('admin authentication failure uses an in-page diagnostic dialog with OK button',()=>{
  const adminHtml=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8'),adminJs=fs.readFileSync(new URL('../admin.js',import.meta.url),'utf8');
  assert.match(adminHtml,/id="failureDialog"/);
  assert.match(adminHtml,/id="failureMessage"/);
  assert.match(adminHtml,/id="failureCode"/);
  assert.match(adminHtml,/id="failureStatus"/);
  assert.match(adminHtml,/id="failureServer"/);
  assert.match(adminHtml,/id="failureOk"/);
  assert.match(adminJs,/function showFailureDialog\(error,message\)/);
  assert.match(adminJs,/showFailureDialog\(error,message\)/);
  assert.match(adminJs,/failureOk'\)\.addEventListener\('click'/);
  assert.doesNotMatch(adminJs,/alert\(message\)/);
});
