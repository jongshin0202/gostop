const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

let worker,isAllowedOrigin;
test.before(async()=>({default:worker,isAllowedOrigin}=await import('../server/worker.mjs')));
const env={ALLOWED_ORIGINS:'https://gostop.example.vercel.app,https://gostop-preview.example.com'};
const allowedOrigin={'Origin':'https://gostop.example.vercel.app','content-type':'application/json'};

test('CORS permits production, exact GitHub Pages test origin, configured origins, and localhost but rejects unrelated origins',()=>{
  assert.equal(isAllowedOrigin('https://gostoplive.com',env),true);
  assert.equal(isAllowedOrigin('https://jongshin0202.github.io',env),true);
  assert.equal(isAllowedOrigin('https://attacker.github.io',env),false);
  assert.equal(isAllowedOrigin('https://gostop.example.vercel.app',env),true);
  assert.equal(isAllowedOrigin('https://gostop-preview.example.com',env),true);
  assert.equal(isAllowedOrigin('http://localhost:3000',env),true);
  assert.equal(isAllowedOrigin('https://evil.example',env),false);
  assert.equal(isAllowedOrigin(null,env),false);
});

test('JSON POST preflight exposes content-type and authorization only for an allowed origin',async()=>{
  const allowed=await worker.fetch(new Request('https://worker.example/api/rooms',{method:'OPTIONS',headers:{Origin:'https://gostop.example.vercel.app','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}}),env);
  assert.equal(allowed.status,204);assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://gostop.example.vercel.app');assert.equal(allowed.headers.get('Access-Control-Allow-Methods'),'GET,POST,OPTIONS');assert.equal(allowed.headers.get('Access-Control-Allow-Headers'),'content-type,authorization');assert.equal(allowed.headers.get('Vary'),'Origin');
  const badHeader=await worker.fetch(new Request('https://worker.example/api/rooms',{method:'OPTIONS',headers:{Origin:'https://gostop.example.vercel.app','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-unsafe-header'}}),env);assert.equal(badHeader.status,403);
  const githubPages=await worker.fetch(new Request('https://worker.example/api/auth/login',{method:'OPTIONS',headers:{Origin:'https://jongshin0202.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}}),env);assert.equal(githubPages.status,204);assert.equal(githubPages.headers.get('Access-Control-Allow-Origin'),'https://jongshin0202.github.io');
  const rejected=await worker.fetch(new Request('https://worker.example/api/rooms',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}}),env);assert.equal(rejected.status,403);assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),null);
});

test('ranked Solo rejects anonymous clients before Durable Object lookup during compatibility rollout',async()=>{
  const response=await worker.fetch(new Request('https://worker.example/api/solo',{method:'POST',headers:allowedOrigin,body:'{}'}),env);
  assert.equal(response.status,401);assert.equal((await response.json()).error.code,'AUTH_REQUIRED');
});

test('WebSocket routes reject missing and malicious browser origins before Durable Object lookup',async()=>{
  for(const origin of [null,'https://evil.example']){const headers={Upgrade:'websocket'};if(origin)headers.Origin=origin;const response=await worker.fetch(new Request('https://worker.example/api/rooms/ABCDEFGHJK2345/ws',{headers}),env);assert.equal(response.status,403);assert.equal((await response.json()).error.code,'ORIGIN_NOT_ALLOWED');}
});

test('deployment configuration uses a public Vercel build-time URL and declarative SQLite Durable Object export',()=>{
  const root=join(__dirname,'..'),vercel=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8')),generator=readFileSync(join(root,'scripts/write-runtime-config.mjs'),'utf8'),wrangler=readFileSync(join(root,'wrangler.toml'),'utf8');
  assert.equal(vercel.buildCommand,'node scripts/write-runtime-config.mjs');assert.equal(vercel.outputDirectory,'.');assert.match(generator,/process\.env\.GOSTOP_SERVER_URL/);assert.match(generator,/must use HTTPS/);
  assert.match(wrangler,/\[exports\.GameRoom\]/);assert.match(wrangler,/\[exports\.BackupStore\]/);assert.match(wrangler,/name = "BACKUP_STORE"/);assert.match(wrangler,/class_name = "BackupStore"/);assert.match(wrangler,/type = "durable-object"/);assert.match(wrangler,/storage = "sqlite"/);assert.match(wrangler,/INACTIVITY_NUDGE_SECONDS = "180"/);assert.match(wrangler,/INACTIVITY_NUDGE_PHASE_SECONDS = "60"/);assert.match(wrangler,/ABANDONMENT_COUNTDOWN_SECONDS = "30"/);assert.match(wrangler,/PAUSE_DURATION_SECONDS = "180"/);assert.match(wrangler,/EMAIL_VERIFICATION_REQUIRED = "true"/);assert.match(wrangler,/EMAIL_VERIFY_BASE_URL = "https:\/\/gostoplive\.com"/);assert.match(wrangler,/EMAIL_FROM = "GoStop Live <noreply@gostoplive\.com>"/);assert.doesNotMatch(wrangler,/RESEND_API_KEY\s*=/);assert.doesNotMatch(wrangler,/ABANDONMENT_TIMEOUT_SECONDS/);assert.doesNotMatch(wrangler,/\[\[durable_objects\.exports\]\]/);assert.doesNotMatch(wrangler,/\[\[migrations\]\]/);
});