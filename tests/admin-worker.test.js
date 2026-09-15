const test=require('node:test');
const assert=require('node:assert/strict');

let worker;
test.before(async()=>({default:worker}=await import('../server/worker.mjs')));

test('server admin page is no-store, non-indexable and frame protected',async()=>{
  const response=await worker.fetch(new Request('https://worker.example/admin'),{});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('x-frame-options'),'DENY');
  const html=await response.text();assert.match(html,/GoStop Live! Server Admin/);assert.match(html,/Admin Access Key/);assert.match(html,/noindex,nofollow,noarchive/);
});

test('admin API rejects cross-origin calls before Durable Object access',async()=>{
  const response=await worker.fetch(new Request('https://worker.example/api/admin/state',{method:'GET',headers:{Origin:'https://evil.example',Authorization:'Bearer stolen'}}),{});
  assert.equal(response.status,403);assert.equal((await response.json()).error.code,'ADMIN_ORIGIN_NOT_ALLOWED');
});

test('same-origin admin API forwards authorization only to the AccountStore admin namespace',async()=>{
  let forwarded=null;
  const env={ACCOUNT_STORE:{idFromName:name=>name,get:()=>({fetch:async request=>{forwarded=request;return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});}})}};
  const response=await worker.fetch(new Request('https://worker.example/api/admin/state?month=2026-09',{headers:{Origin:'https://worker.example',Authorization:'Bearer admin-session'}}),env);
  assert.equal(response.status,200);assert.equal((await response.json()).ok,true);assert.ok(forwarded);assert.equal(new URL(forwarded.url).pathname,'/admin/state');assert.equal(new URL(forwarded.url).search,'?month=2026-09');assert.equal(forwarded.headers.get('Authorization'),'Bearer admin-session');
});
