'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

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

test('release route contract: production has a same-origin catch-all API proxy and Player Info uses it',()=>{
  const proxy=(vercel.rewrites||[]).find(rule=>rule.source==='/api/:path*');
  assert.ok(proxy,'Production must proxy all /api REST traffic');
  assert.equal(proxy.destination,'https://gostop-authority.jwshin1.workers.dev/api/:path*');
  assert.match(ranked,/productionSameOriginRest/);
  assert.match(ranked,/startsWith\('\/api\/'\)/);
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
