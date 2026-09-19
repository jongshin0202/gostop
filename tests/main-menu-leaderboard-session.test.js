'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'ranked-client.js'),'utf8');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const accountStoreSource=fs.readFileSync(path.join(root,'server','account-store.mjs'),'utf8');
const worker=fs.readFileSync(path.join(root,'server','worker.mjs'),'utf8');
const docs=fs.readFileSync(path.join(root,'docs','accounts-coins-leaderboards.md'),'utf8');

test('saved authenticated sessions restore automatically and transient refresh failures do not force login',()=>{
  assert.match(source,/authToken=localStorage\.getItem\(TOKEN_KEY\)\|\|null/);
  assert.match(source,/const DEFAULT_SERVER_URL='https:\/\/gostop-authority\.jwshin1\.workers\.dev'/);
  const refresh=source.slice(source.indexOf('async function refreshAccount'),source.indexOf('function updateFromSnapshot'));
  assert.match(refresh,/if\(error\?\.status===401\|\|error\?\.code==='AUTH_REQUIRED'\)clearSession\(\)/);
  assert.doesNotMatch(refresh,/catch\(_\)\{clearSession\(\)/);
  const requireBlock=source.slice(source.indexOf('async function requireAccount'),source.indexOf('rankedSolo.addEventListener'));
  assert.match(requireBlock,/if\(account\)\{next\(\);return;\}/);
  assert.match(requireBlock,/else onCancel\(\)/);
  assert.match(source,/authRestorePromise=refreshAccount\(\)/);
});

test('worker accepts first-party origins and forwards Cloudflare timezone for local daily rewards',async()=>{
  const {isAllowedOrigin}=await import('../server/worker.mjs');
  const env={ALLOWED_ORIGINS:''};
  assert.equal(isAllowedOrigin('https://gostoplive.com',env),true);
  assert.equal(isAllowedOrigin('https://www.gostoplive.com',env),true);
  assert.equal(isAllowedOrigin('https://gostop-abc-jwshin1-5345s-projects.vercel.app',env),true);
  assert.equal(isAllowedOrigin('https://unrelated-project.vercel.app',env),false);
  assert.equal(isAllowedOrigin('https://evil.example',env),false);
  assert.match(worker,/request\.cf\?\.timezone/);
  assert.match(worker,/x-gostop-timezone/);
  assert.match(worker,/x-gostop-city/);assert.match(worker,/x-gostop-region-name/);assert.match(worker,/x-gostop-ip/);assert.match(worker,/x-gostop-timezone/);
});

test('leaderboards are public, render immediately, and page controls work even if data cannot load',()=>{
  assert.match(source,/api\('\/api\/leaderboards',\{auth:false\}\)/);
  assert.match(worker,/request\.method==='GET'&&url\.pathname==='\/api\/leaderboards'/);
  const block=source.slice(source.indexOf('function renderLeaderboard'),source.indexOf('function lobbyUrl'));
  assert.match(block,/const key=leaderboardPage===0\?'global':'monthly'/);
  assert.match(block,/if\(!leaderboardData\).*leaderboardLoadFailed/s);
  assert.match(block,/if\(leaderboardScreen\.hidden\|\|!attractMode\)return;leaderboardTimer=setTimeout\(\(\)=>\{[\s\S]*if\(leaderboardPage===1\)\{closeLeaderboard\(true\);return;\}[\s\S]*nextLeaderboard\(1\)[\s\S]*LEADERBOARD_ROTATE_MS/);
  assert.match(source,/class=\"leaderboard-controls\".*leaderboard-prev.*leaderboard-return.*leaderboard-next/s);
  assert.doesNotMatch(source,/\.leaderboard-nav\{position:absolute/);
});

test('manual leaderboard background click and Return restore the main menu without automatic rotation',()=>{
  const block=source.slice(source.indexOf('function restartLeaderboardTimer'),source.indexOf('function lobbyUrl'));
  assert.match(block,/if\(returnToMenu\)\{onlinePanel\.hidden=true;freePanel\.hidden=true;overlay\.hidden=false;\}/);
  assert.match(block,/leaderboard-return'\)\.addEventListener\('click',event=>\{event\.stopPropagation\(\);closeLeaderboard\(true\);\}/);
  assert.match(block,/leaderboardScreen\.addEventListener\('click',event=>\{if\(event\.target\.closest\('button'\)\)return;closeLeaderboard\(true\);\}\)/);
  assert.match(block,/if\(leaderboardScreen\.hidden\|\|!attractMode\)return/);
  assert.doesNotMatch(block,/if\(attractMode\)\{closeLeaderboard\(true\);return;\}nextLeaderboard\(1\)/);
  assert.match(source,/rotateNote:'Use the arrows to switch leaderboards\. Click anywhere else to return to the menu\.'/);
});

test('main-menu attract mode starts ten seconds after the visible menu becomes idle',()=>{
  assert.match(source,/const ATTRACT_IDLE_MS=10000;/);
  assert.match(source,/const LEADERBOARD_ROTATE_MS=5000;/);
  assert.match(source,/let lastMenuActivityAt=Date\.now\(\)/);
  assert.match(source,/function startAttractWatcher\(\)[\s\S]*setInterval/);
  assert.match(source,/Date\.now\(\)-lastMenuActivityAt<ATTRACT_IDLE_MS/);
  assert.match(source,/void openLeaderboard\(true\)/);
  assert.doesNotMatch(source,/clearInterval\(attractTimer\)/);
  assert.match(source,/lastMenuActivityAt=Date\.now\(\);startAttractWatcher\(\)/);
  assert.match(source,/if\(event\.isTrusted&&!attractMode&&mainMenuIdleEligible\(\)\)resetAttractTimer\(\)/);
  assert.match(source,/applyRankedLocale\(\);globalThis\.__gostopRankedBootComplete=true;authRestorePromise=refreshAccount\(\)/);assert.match(source,/function revealCurrentMainMenu\(\)[\s\S]*overlay\.dataset\.currentMenuReady='true';overlay\.hidden=false/);assert.match(source,/resumeActiveRankedRoom/);
  assert.match(docs,/After 10 seconds of main-menu inactivity, attract mode shows Global for 5 seconds, Monthly for 5 seconds, then returns to the main menu for 10 seconds and repeats/);
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

test('room wallet mismatch refreshes the authoritative account without directly overwriting cached wallet coins',()=>{
  const update=source.slice(source.indexOf('function updateFromSnapshot'),source.indexOf('const style='));
  assert.match(update,/const roomWallet=Number\(snapshot\.youProfile\.walletCoins\),accountWallet=Number\(account\.walletCoins\)/);
  assert.match(update,/roomWallet!==accountWallet/);
  assert.match(update,/void refreshAccount\(\)/);
  assert.doesNotMatch(update,/account=\{\.\.\.account,walletCoins:/);
  assert.doesNotMatch(update,/account\.walletCoins=roomWallet/);
  const refresh=source.slice(source.indexOf('async function refreshAccount'),source.indexOf('function updateFromSnapshot'));
  assert.match(refresh,/captureAccountPayload\(data\)/);
  const ack=source.slice(source.indexOf('async function acknowledgeAccountNotice'),source.indexOf('function showRankedEntryNotice'));
  assert.match(ack,/captureAccountPayload\(data\)/);
});
test('attract idle resets only on trusted user input and diagnostics contract is ten seconds',()=>{assert.match(source,/pointerdown',event=>\{if\(event\.isTrusted/);assert.match(source,/if\(event\.isTrusted&&mainMenuIdleEligible\(\)\)resetAttractTimer\(\)/);});

test('pending daily bonus never masks the authoritative Wallet or replays after acknowledgement',()=>{
  const display=source.slice(source.indexOf('function pendingDailyNotice'),source.indexOf('function saveSession'));
  assert.match(display,/function displayedWalletCoins\(\)[\s\S]*return account\?account\.walletCoins:null/);
  assert.doesNotMatch(display,/walletBefore|holdForVisibleMenu|current-coins/);
  assert.match(source,/const acknowledgedNoticeIds=new Set\(\)/);
  const capture=source.slice(source.indexOf('function captureAccountPayload'),source.indexOf('function pendingDailyNotice'));
  assert.match(capture,/data\.notices\.filter\(item=>!acknowledgedNoticeIds\.has\(item\?\.id\)\)/);
  const ack=source.slice(source.indexOf('async function acknowledgeAccountNotice'),source.indexOf('function showRankedEntryNotice'));
  assert.match(ack,/acknowledgedNoticeIds\.add\(noticeId\)/);
  assert.match(ack,/pendingAccountNotices=pendingAccountNotices\.filter\(item=>item\?\.id!==noticeId\)/);
  const daily=source.slice(source.indexOf("if(accountNoticeDialog.dataset.dailyLaunch==='1')"),source.indexOf("$('loginForm').addEventListener"));
  assert.match(daily,/await acknowledgeAccountNotice\(id\)/);
  assert.ok(daily.indexOf("delete accountNoticeDialog.dataset.dailyLaunch")<daily.indexOf('accountNoticeDialog.close()'),'successful Daily Bonus acknowledgement clears launch metadata before closing the dialog');
  assert.doesNotMatch(daily,/await refreshAccount\(\)/);
  assert.match(daily,/renderAccountBox\(\);patchGameIdentity\(\);if\(next\)next\(\)/);
  assert.match(accountStoreSource,/noticeList\(account\)\{const acknowledged=new Set\(Array\.isArray\(account\.acknowledgedNoticeIds\)/);
  assert.match(accountStoreSource,/async prepareNotices\(account\)[\s\S]*!acknowledged\.has\(item\?\.id\)[\s\S]*this\.storage\.put/);
  const launch=source.slice(source.indexOf("rankedSolo.addEventListener"),source.indexOf("onlinePlay.addEventListener"));
  assert.match(launch,/captureAccountPayload\(data\);renderAccountBox\(\);patchGameIdentity\(\)/);
  assert.match(worker,/json\(\{ok:true,account,room:\{roomCode:data\.room\.roomCode,rankedMode:'solo'\}\}\)/);
  const identity=source.slice(source.indexOf('function patchGameIdentity'),source.indexOf('playPractice.addEventListener'));
  assert.match(identity,/coinText\(displayedWalletCoins\(\)\)/);
});


test('legacy two-button shell is hidden until the current menu client has finished booting',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(html,/id="soloStartOverlay" class="solo-start-overlay" hidden data-current-menu-ready="false"/);
  assert.match(css,/\.solo-start-overlay\[hidden\]\{display:none!important\}/);
  assert.match(source,/function revealCurrentMainMenu\(\)[\s\S]*overlay\.hidden=false/);
  const boot=source.slice(source.indexOf('function revealCurrentMainMenu'),source.lastIndexOf('})();'));
  assert.match(boot,/authRestorePromise=refreshAccount\(\)/);
  assert.match(boot,/if\(!resumeActiveRankedRoom\(\)\)revealCurrentMainMenu\(\)/);
  assert.match(source,/gostop-online-launch-settled'[\s\S]*event\.detail\?\.ok===false[\s\S]*revealCurrentMainMenu\(\)/);
});

test('Coin mode buttons reflect the account-wide active ranked game and resume the same room',()=>{
  const buttons=source.slice(source.indexOf('function activeRankedMode'),source.indexOf('async function refreshAccount'));
  assert.match(buttons,/account\?\.activeRanked/);
  assert.match(buttons,/rankedSolo\.disabled=busy\|\|!!active&&active!=='solo'/);
  assert.match(buttons,/onlinePlay\.disabled=busy\|\|!!active&&active!=='online'/);
  assert.match(buttons,/active==='solo'\?'↻ '\+rt\('solo'\)/);
  assert.match(buttons,/active==='online'\?'↻ '\+rt\('online'\)/);
  const launches=source.slice(source.indexOf('function launchRankedRoom'),source.indexOf('function renderLeaderboard'));
  assert.match(launches,/account\?\.activeRanked\?\.mode==='solo'/);
  assert.match(launches,/launchRankedRoom\(account\.activeRanked\.roomCode\)/);
  assert.match(launches,/account\?\.activeRanked\?\.mode==='online'/);
  assert.match(source,/\.menu-ranked:disabled\{/);
  assert.match(worker,/code:'ACTIVE_RANKED_GAME'/);
  assert.match(worker,/Only one Coin game can be active at a time/);
});


test('main menu separates Training, Free Gaming, Competitive Gaming, and Leaderboards',()=>{
  assert.match(source,/trainingBtn\.textContent='Training Mode'/);
  assert.match(source,/freeGroup\.dataset\.label='FREE GAMING'/);
  assert.match(source,/freeFriendBtn\.textContent='Play With Friend'/);
  assert.match(source,/rankedGroup\.className='menu-mode-group ranked-menu-group'/);
  assert.match(source,/leaderboardBtn\.textContent='Leaderboards'/);
  assert.match(source,/trainingBtn\.textContent=rt\('training'\)/);
  assert.match(source,/freeGroup\.dataset\.label=rt\('freeGaming'\)/);
  assert.match(source,/rankedGroup\.dataset\.label=rt\('competitiveGaming'\)/);
  assert.match(source,/leaderboardBtn\.textContent=rt\('leaderboards'\)/);
});

test('Free Play With Friend launches through a separate non-ranked room flow',()=>{
  assert.match(source,/freePanel\.id='freeFriendPanel'/);
  assert.match(source,/gostop-free-online-create/);
  assert.match(source,/gostop-free-online-join/);
  assert.match(source,/freePanel\.hidden/);
  const snapshot=source.slice(source.indexOf("globalThis.addEventListener('gostop-online-snapshot'"),source.indexOf("globalThis.addEventListener('gostop-online-message'"));
  assert.match(snapshot,/if\(!snapshot\.ranked\)\{currentSnapshot=null/);
});


test('switching modes clears stale Free and Competitive lobby panels before game launch',()=>{
  const rankedEntry=source.slice(source.indexOf('function beginRankedEntry'),source.indexOf('function launchRankedRoom'));
  assert.match(rankedEntry,/freePanel\.hidden=true;onlinePanel\.hidden=true;\$\('freeOnlineStatus'\)\.textContent=''/);
  const rankedRoom=source.slice(source.indexOf('function launchRankedRoom'),source.indexOf("globalThis.addEventListener?.('gostop-online-launch-settled'"));
  assert.match(rankedRoom,/freePanel\.hidden=true;onlinePanel\.hidden=true/);
  assert.match(source,/freeFriendBtn\.addEventListener\('click',\(\)=>\{stopAttractForGameLaunch\(\);onlinePanel\.hidden=true;freePanel\.hidden=false;\}\)/);
  const localLaunch=appSource.slice(appSource.indexOf('async function launchLocalGame'),appSource.indexOf("document.addEventListener('pointerdown',unlockAudio"));
  assert.match(localLaunch,/getElementById\('freeFriendPanel'\)/);
  assert.match(localLaunch,/getElementById\('onlineLobbyPanel'\)/);
  assert.match(localLaunch,/if\(freePanel\)freePanel\.hidden=true;if\(competitivePanel\)competitivePanel\.hidden=true/);
  const beginOnline=appSource.slice(appSource.indexOf('const beginOnline=async'),appSource.indexOf("addEventListener('gostop-online-snapshot'"));
  assert.match(beginOnline,/if\(!anonymous&&freeFriendPanel\)freeFriendPanel\.hidden=true/);
});
