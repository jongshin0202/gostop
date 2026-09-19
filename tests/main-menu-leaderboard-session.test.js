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
  assert.match(requireBlock,/accountContinuation=\{next,onCancel\};openAuth\('login'\)/);
  assert.match(source,/function continueAfterAccount\(\)/);
  assert.match(source,/registrationOk'\)\.addEventListener[^]*continueAfterAccount\(\)/);
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
  assert.match(source,/applyRankedLocale\(\);globalThis\.__gostopRankedBootComplete=true;authRestorePromise=refreshAccount\(\)/);assert.match(source,/function revealCurrentMainMenu\(\)[\s\S]*overlay\.dataset\.currentMenuReady='true';overlay\.hidden=false/);assert.doesNotMatch(source,/resumeActiveRankedRoom/);
  assert.match(docs,/After 10 seconds of main-menu inactivity, attract mode shows Global for 5 seconds, Monthly for 5 seconds, then returns to the main menu for 10 seconds and repeats/);
});
test('inactivity warning dismissal is sticky for the current warning while server countdown continues',()=>{
  assert.match(source,/let flowInterval=null,dismissedInactivityKey=''/);
  assert.match(source,/function inactivityDialogKey\(snapshot,inactivity=/);
  assert.match(source,/setDialog\(inactivityDialog,dismissedInactivityKey!==key\)/);
  assert.match(source,/rankedInactivityOk'\)\.addEventListener\('click',\(\)=>\{const key=inactivityDialogKey\(currentSnapshot\);if\(key\)dismissedInactivityKey=key;inactivityDialog\.close\(\);\}\)/);
  assert.doesNotMatch(source,/30-SECOND ABANDONMENT WARNING/);
});

test('nudge dialog never shows the abandonment countdown before warning phase',()=>{
  assert.match(source,/\.ranked-countdown\[hidden\]\{display:none!important\}/);
  const flow=source.slice(source.indexOf('function renderRankedFlow'),source.indexOf("$('rankedInactivityOk').addEventListener"));
  assert.match(flow,/inactivity\.phase==='nudge'[\s\S]*rankedInactivityCountdown'\)\.hidden=true/);
  assert.match(flow,/inactivity\.phase==='warning'[\s\S]*rankedInactivityCountdown'\)\.hidden=false/);
});

test('pause dialog gives requester Cancel, opponent Quit Game, and confirmation before penalty-free quit',()=>{
  assert.match(source,/rankedPauseCountdown\" class=\"ranked-countdown\">3:00/);
  assert.match(source,/id=\"rankedPauseAction\"/);
  assert.match(source,/id=\"rankedPauseQuitConfirmTitle\"/);
  assert.match(source,/id=\"rankedPauseQuitYes\"/);
  assert.match(source,/id=\"rankedPauseQuitNo\"/);
  assert.match(source,/rt\(own\?'cancelPause':'quitPausedGame'\)/);
  assert.match(source,/submitRanked\(\{type:'cancelPause'\}\)/);
  assert.match(source,/submitRanked\(\{type:'quitPausedGame'\}\)/);
  assert.match(source,/pauseQuitConfirmDialog\.close\(\);if\(currentSnapshot\?\.sessionFlow\?\.pause\)renderRankedFlow\(currentSnapshot\)/);
});

test('share-link room creator leaves Online Play overlay when the friend makes the room ready',()=>{
  assert.match(appSource,/function enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/document\.getElementById\('onlineLobbyPanel'\)/);
  assert.match(appSource,/adapter\.addEventListener\('roomReady'[\s\S]*enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/adapter\.addEventListener\('opponentConnected'[\s\S]*enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/event\.detail\?\.status==='ready'[\s\S]*enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/adapter\.addEventListener\('snapshot'[\s\S]*event\.detail\.snapshot\?\.matchId[\s\S]*enterOnlineMatchView\(anonymous\)/);
});

test('stale ranked locks are server-reconciled and main menu rechecks them automatically',()=>{
  assert.match(worker,/async function reconcileActiveRanked\(env,account\)/);
  assert.match(worker,/\/reconcile-active/);
  assert.match(worker,/\/internal\/active-ranked\/clear/);
  assert.match(source,/activeRankedRefreshTimer/);
  assert.match(source,/function scheduleActiveRankedRecheck\(\)/);
  assert.match(source,/setTimeout\(\(\)=>\{activeRankedRefreshTimer=null;void refreshAccount\(\);\},20000\)/);
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
  assert.match(source,/const cached=JSON\.parse\(localStorage\.getItem\(ACCOUNT_CACHE_KEY\)\|\|'null'\);if\(authToken&&cached&&typeof cached==='object'&&cached\.nickname\)\{account=cached;readAcknowledgedNoticeCache\(account\.id\);\}/);
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
  assert.match(source,/const ACK_NOTICE_CACHE_KEY='gostop-acknowledged-notice-cache'/);
  assert.match(source,/const acknowledgedNoticeIds=new Set\(\)/);
  assert.match(source,/function readAcknowledgedNoticeCache\(accountId\)[\s\S]*localStorage\.getItem\(ACK_NOTICE_CACHE_KEY\)/);
  assert.match(source,/function rememberAcknowledgedNotice\(accountId,noticeId\)[\s\S]*localStorage\.setItem\(ACK_NOTICE_CACHE_KEY/);
  const capture=source.slice(source.indexOf('function normalizeAccountNotices'),source.indexOf('function pendingDailyNotice'));
  assert.match(capture,/function normalizeAccountNotices\(notices\)/);
  assert.match(capture,/daily=list\.filter\(item=>item\?\.type==='daily-login'\)/);
  assert.match(capture,/item\?\.type==='daily-login'&&item!==latestDaily/);
  assert.match(capture,/readAcknowledgedNoticeCache\(nextAccountId\)/);
  assert.match(capture,/pendingAccountNotices=normalizeAccountNotices\(data\.notices\)/);
  const ack=source.slice(source.indexOf('async function acknowledgeAccountNotice'),source.indexOf('function showRankedEntryNotice'));
  assert.match(ack,/rememberAcknowledgedNotice\(account\?\.id,noticeId\)/);
  assert.match(ack,/pendingAccountNotices=pendingAccountNotices\.filter\(item=>item\?\.id!==noticeId\)/);
  const daily=source.slice(source.indexOf("if(accountNoticeDialog.dataset.dailyLaunch==='1')"),source.indexOf("$('loginForm').addEventListener"));
  assert.match(daily,/await acknowledgeAccountNotice\(id\)/);
  assert.ok(daily.indexOf("delete accountNoticeDialog.dataset.dailyLaunch")<daily.indexOf('accountNoticeDialog.close()'),'successful Daily Bonus acknowledgement clears launch metadata before closing the dialog');
  assert.doesNotMatch(daily,/await refreshAccount\(\)/);
  assert.match(daily,/renderAccountBox\(\);patchGameIdentity\(\);if\(next\)next\(\)/);
  assert.match(accountStoreSource,/normalizedNotices\(account\)[\s\S]*daily=unacknowledged\.filter\(item=>item\?\.type==='daily-login'\)/);
  assert.match(accountStoreSource,/noticeList\(account\)\{return this\.normalizedNotices\(account\);\}/);
  assert.match(accountStoreSource,/async prepareNotices\(account\)[\s\S]*filtered=this\.normalizedNotices\(account\)[\s\S]*this\.storage\.put/);
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
  assert.match(boot,/if\(validRoomParam\)\{void launchInviteRoom\(\);return;\}revealCurrentMainMenu\(\)/);
  assert.doesNotMatch(boot,/resumeActiveRankedRoom\(/);
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


test('Free Play With Friend makes manual Join a new seat and closes the waiting panel on the authoritative match snapshot',()=>{
  const beginOnline=appSource.slice(appSource.indexOf('const beginOnline=async'),appSource.indexOf("addEventListener('gostop-online-snapshot'"));
  assert.match(beginOnline,/if\(event\.detail\.snapshot\?\.matchId\)\{activeOnlineStatus\.textContent=t\('matchReady'\);enterOnlineMatchView\(anonymous\);\}/);
  const handoff=appSource.slice(appSource.indexOf('function enterOnlineMatchView'),appSource.indexOf('const beginOnline=async'));
  assert.match(handoff,/if\(anonymous\)\{if\(freeFriendPanel\)freeFriendPanel\.hidden=true;\}/);
  const freeJoin=appSource.slice(appSource.indexOf("addEventListener('gostop-free-online-join'"),appSource.lastIndexOf('  }\n})();'));
  assert.match(freeJoin,/sessionStorage\.removeItem\(`gostop-room-\$\{code\}`\)/);
  assert.match(freeJoin,/const room=await adapter\.join\(code\)/);
  assert.doesNotMatch(freeJoin,/adapter\.join\(code,existing\?\.credential\)/);
});

test('Free Play With Friend uses Cancel while leaderboard and competitive lobby keep Return',()=>{
  const locale=source.slice(source.indexOf('function applyRankedLocale'),source.indexOf('function renderAccountBox'));
  assert.match(locale,/\$\('freeFriendClose'\)\.textContent=rt\('cancel'\)/);
  assert.match(locale,/\$\('onlineLobbyClose'\)\.textContent=rt\('return'\)/);
  assert.match(locale,/leaderboardScreen\.querySelector\('\.leaderboard-return'\)\.textContent=rt\('return'\)/);
});


test('root URL never auto-resumes an active Competitive game before user chooses the mode, while explicit invite links do',()=>{
  const boot=source.slice(source.indexOf("const inviteUrl=new URL(location.href)"),source.lastIndexOf('})();'));
  assert.match(boot,/validRoomParam=!!roomParam/);
  assert.match(boot,/if\(validRoomParam\)\{void launchInviteRoom\(\);return;\}revealCurrentMainMenu\(\)/);
  assert.match(boot,/inviteMode=inviteUrl\.searchParams\.get\('mode'\)==='free'\?'free':'competitive'/);
  assert.doesNotMatch(source,/function resumeActiveRankedRoom\(/);
  assert.doesNotMatch(source,/activeRoomResumeAttempted/);
  const launches=source.slice(source.indexOf("rankedSolo.addEventListener"),source.indexOf("function renderLeaderboard"));
  assert.match(launches,/account\?\.activeRanked\?\.mode==='solo'&&account\.activeRanked\.roomCode/);
  assert.match(launches,/account\?\.activeRanked\?\.mode==='online'&&account\.activeRanked\.roomCode/);
  assert.match(launches,/launchRankedRoom\(account\.activeRanked\.roomCode\)/);
});
