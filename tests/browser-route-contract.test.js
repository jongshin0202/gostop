'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');

const root=path.join(__dirname,'..');
const ranked=fs.readFileSync(path.join(root,'ranked-client.js'),'utf8');
const online=fs.readFileSync(path.join(root,'online-client.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'server','worker.mjs'),'utf8');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

function literalApiPaths(source){
  const result=new Set();
  for(const match of source.matchAll(/api\('([^']+)'/g))if(match[1].startsWith('/api/')&&match[1]!=='/api/')result.add(match[1]);
  for(const match of source.matchAll(/['"`](\/api\/[^'"`\s\$\{\}]*)['"`]/g))if(match[1]&&match[1]!=='/api/')result.add(match[1]);
  return [...result].sort();
}

test('release route contract: every literal player REST endpoint used by the browser is admitted by the Worker API namespace',()=>{
  const endpoints=[...new Set([...literalApiPaths(ranked),...literalApiPaths(online)])];
  assert.ok(endpoints.includes('/api/player-profile'),'Player Info endpoint must be included in the browser route inventory');
  const namespaceMatch=worker.match(/apiRoute=\/\^\\\/api\\\/(?:\(\?:)?([^)]*)\)/);
  assert.ok(namespaceMatch,'Worker API namespace matcher must remain discoverable');
  const namespace=namespaceMatch[1].replace(/\\/g,'').split('|');
  for(const endpoint of endpoints){
    const top=endpoint.split('/')[2];
    assert.ok(namespace.includes(top),`${endpoint} is used by the browser but its top-level Worker namespace is missing`);
  }
});

test('release route contract: static production sends Player Info directly to Worker CORS API',()=>{
  assert.match(ranked,/const apiUrl=path=>\`\$\{baseUrl\}\$\{path\}\`/);
  assert.doesNotMatch(ranked,/productionSameOriginRest/);
  assert.match(ranked,/fetch\(apiUrl\(path\)/);
  assert.match(ranked,/api\('\/api\/player-profile',\{method:'POST'/);
});

test('release click contract: main-menu and reusable nickname links carry account IDs into Player Info',()=>{
  assert.match(ranked,/playerNicknameHtml\(player\)/);
  assert.match(ranked,/data-player-info-account-id=/);
  assert.match(ranked,/document\.addEventListener\('click',event=>\{const target=event\.target\.closest\?\.\('\[data-player-info-account-id\]'\)/);
  assert.match(ranked,/openPlayerInfo\(target\.dataset\.playerInfoAccountId,target\.dataset\.playerInfoNickname/);
  assert.match(ranked,/renderAccountBox/);
  assert.match(ranked,/playerNicknameHtml\(\{accountId:account\.id,nickname:account\.nickname,countryCode:account\.countryCode\}\)/);
});


class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return structuredClone(this.map.get(key));}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}

test('release route integration: main-menu Player Info succeeds through the actual Worker and AccountStore path',async()=>{
  const module=await import('../server/worker.mjs');
  const store=new module.AccountStore({storage:new MemoryStorage()},{EMAIL_VERIFICATION_REQUIRED:'false'},{cryptoApi:webcrypto,now:()=> '2026-09-23T05:00:00.000Z'});
  const binding={idFromName:name=>name,get:()=>({fetch:request=>store.fetch(request)})};
  const env={ACCOUNT_STORE:binding,EMAIL_VERIFICATION_REQUIRED:'false'};
  const origin='https://gostoplive.com';
  const registration=await module.default.fetch(new Request('https://worker/api/auth/register',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify({email:'route-profile@example.com',nickname:'RouteProfile',password:'StrongPass9',confirmPassword:'StrongPass9'})}),env);
  assert.equal(registration.status,201);const registered=await registration.json();assert.ok(registered.session?.token);
  const profileResponse=await module.default.fetch(new Request('https://worker/api/player-profile',{method:'POST',headers:{Origin:origin,'content-type':'application/json',authorization:`Bearer ${registered.session.token}`},body:JSON.stringify({accountId:registered.account.id})}),env);
  assert.equal(profileResponse.status,200);assert.equal(profileResponse.headers.get('access-control-allow-origin'),origin);
  const profile=await profileResponse.json();assert.equal(profile.player.accountId,registered.account.id);assert.equal(profile.player.nickname,'RouteProfile');
});

test('release transport contract: Online room HTTP and WebSocket both target the Worker directly',()=>{
  assert.match(online,/requestUrl\(path\)\{return \`\$\{this\.baseUrl\}\$\{path\}\`;\}/);
  assert.match(online,/fetch\(this\.requestUrl\(path\)/);
  assert.match(online,/new URL\(\`\$\{this\.baseUrl\}\/api\/rooms\/\$\{room\.roomCode\}\/ws\`\)/);
});


test('release transport contract: all player REST reads and writes remain on direct Worker CORS path',()=>{
  assert.match(ranked,/const apiUrl=path=>\`\$\{baseUrl\}\$\{path\}\`/);
  assert.match(ranked,/refreshLeaderboardData[^]*api\('\/api\/leaderboards',\{auth:false\}\)/);
  assert.match(ranked,/refreshAccount[^]*api\('\/api\/me'\)/);
  assert.match(ranked,/api\('\/api\/solo\/leave-for-challenge',\{method:'POST'/);
});
