'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'ranked-client.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'server','worker.mjs'),'utf8');
const docs=fs.readFileSync(path.join(root,'docs','accounts-coins-leaderboards.md'),'utf8');

test('saved authenticated sessions restore automatically and transient refresh failures do not force login',()=>{
  assert.match(source,/authToken=localStorage\.getItem\(TOKEN_KEY\)\|\|null/);
  assert.match(source,/const DEFAULT_SERVER_URL='https:\/\/gostop-authority\.jwshin1\.workers\.dev'/);
  const refresh=source.slice(source.indexOf('async function refreshAccount'),source.indexOf('function updateFromSnapshot'));
  assert.match(refresh,/if\(error\?\.status===401\|\|error\?\.code==='AUTH_REQUIRED'\)clearSession\(\)/);
  assert.doesNotMatch(refresh,/catch\(_\)\{clearSession\(\)/);
  const requireBlock=source.slice(source.indexOf('async function requireAccount'),source.indexOf('rankedSolo.addEventListener'));
  assert.match(requireBlock,/if\(account\|\|authToken\)\{next\(\);return;\}/);
  assert.match(source,/authRestorePromise=refreshAccount\(\)/);
});

test('worker accepts first-party production and GoStop Vercel preview origins',async()=>{
  const {isAllowedOrigin}=await import('../server/worker.mjs');
  const env={ALLOWED_ORIGINS:''};
  assert.equal(isAllowedOrigin('https://gostoplive.com',env),true);
  assert.equal(isAllowedOrigin('https://www.gostoplive.com',env),true);
  assert.equal(isAllowedOrigin('https://gostop-abc-jwshin1-5345s-projects.vercel.app',env),true);
  assert.equal(isAllowedOrigin('https://unrelated-project.vercel.app',env),false);
  assert.equal(isAllowedOrigin('https://evil.example',env),false);
});

test('leaderboards are public, render immediately, and page controls work even if data cannot load',()=>{
  assert.match(source,/api\('\/api\/leaderboards',\{auth:false\}\)/);
  assert.match(worker,/request\.method==='GET'&&url\.pathname==='\/api\/leaderboards'/);
  const block=source.slice(source.indexOf('function renderLeaderboard'),source.indexOf('function lobbyUrl'));
  assert.match(block,/const key=leaderboardPage===0\?'global':'monthly'/);
  assert.match(block,/if\(!leaderboardData\).*leaderboardLoadFailed/s);
  assert.match(block,/if\(!leaderboardScreen\.hidden\)leaderboardTimer=setInterval\(\(\)=>nextLeaderboard\(1\),LEADERBOARD_ROTATE_MS\)/);
  assert.match(source,/class=\"leaderboard-controls\".*leaderboard-prev.*leaderboard-return.*leaderboard-next/s);
  assert.doesNotMatch(source,/\.leaderboard-nav\{position:absolute/);
});

test('manual leaderboard Return always restores the main menu',()=>{
  const block=source.slice(source.indexOf('function closeLeaderboard'),source.indexOf('function lobbyUrl'));
  assert.match(block,/if\(returnToMenu\)\{onlinePanel\.hidden=true;overlay\.hidden=false;\}/);
  assert.match(block,/leaderboard-return'\)\.addEventListener\('click',event=>\{event\.stopPropagation\(\);closeLeaderboard\(true\);\}/);
});

test('main-menu attract mode starts seven seconds after the visible menu becomes idle',()=>{
  assert.match(source,/const ATTRACT_IDLE_MS=7000;/);
  assert.match(source,/const LEADERBOARD_ROTATE_MS=5000;/);
  assert.match(source,/let lastMenuActivityAt=Date\.now\(\)/);
  assert.match(source,/function startAttractWatcher\(\)[\s\S]*setInterval/);
  assert.match(source,/Date\.now\(\)-lastMenuActivityAt<ATTRACT_IDLE_MS/);
  assert.match(source,/void openLeaderboard\(true\)/);
  assert.doesNotMatch(source,/clearInterval\(attractTimer\)/);
  assert.match(source,/lastMenuActivityAt=Date\.now\(\);startAttractWatcher\(\)/);
  assert.match(source,/if\(event\.isTrusted&&!attractMode&&mainMenuIdleEligible\(\)\)resetAttractTimer\(\)/);
  assert.match(source,/applyRankedLocale\(\);resetAttractTimer\(\);globalThis\.__gostopRankedBootComplete=true;[\s\S]*authRestorePromise=refreshAccount\(\)/);assert.match(source,/resumeActiveRankedRoom/);
  assert.match(docs,/After 7 seconds of main-menu inactivity, attract mode begins/);
  assert.doesNotMatch(docs,/After 10 seconds of main-menu inactivity/);
});
test('leaderboard uses Total Coins Earned and ranked game identity shows nickname only',()=>{
  assert.match(source,/totalCoins:'Total Coins Earned'/);
  const identity=source.slice(source.indexOf('function patchGameIdentity'),source.indexOf('playPractice.addEventListener'));
  assert.match(identity,/if\(account\)\{humanName\.textContent=account\.nickname;/);
  assert.doesNotMatch(identity,/humanName\.textContent=`\$\{rt\('you'\)\} \(\$\{account\.nickname\}\)/);
});

test('menu avatar follows restored account state without showing an empty logged-out circle',()=>{
  const identity=source.slice(source.indexOf('function patchGameIdentity'),source.indexOf('playPractice.addEventListener'));
  assert.match(identity,/humanAvatar\.hidden=onMenu&&!account/);
  assert.match(identity,/humanAvatar\.textContent=account\?/);
  const refresh=source.slice(source.indexOf('async function refreshAccount'),source.indexOf('function updateFromSnapshot'));
  assert.match(refresh,/renderAccountBox\(\);patchGameIdentity\(\)/);
});

test('saved account identity hydrates synchronously before background session verification',()=>{
  assert.match(source,/const ACCOUNT_CACHE_KEY='gostop-account-cache'/);
  assert.match(source,/const cached=JSON\.parse\(localStorage\.getItem\(ACCOUNT_CACHE_KEY\)\|\|'null'\);if\(authToken&&cached&&typeof cached==='object'&&cached\.nickname\)account=cached/);
  assert.match(source,/function persistAccountCache\(\)\{try\{if\(authToken&&account\)localStorage\.setItem\(ACCOUNT_CACHE_KEY,JSON\.stringify\(account\)\)/);
  assert.match(source,/if\(authToken&&!account\)\{accountBox\.hidden=true;return;\}/);
  assert.match(source,/localStorage\.removeItem\(TOKEN_KEY\);localStorage\.removeItem\(ACCOUNT_CACHE_KEY\)/);
});

test('attract idle resets only on trusted user input and diagnostics contract is seven seconds',()=>{assert.match(source,/pointerdown',event=>\{if\(event\.isTrusted/);assert.match(source,/if\(event\.isTrusted&&mainMenuIdleEligible\(\)\)resetAttractTimer\(\)/);});
