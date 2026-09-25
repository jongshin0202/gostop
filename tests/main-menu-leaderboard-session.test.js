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

test('Create ID requires email verification before session and Coin rewards in production',()=>{
  assert.match(worker,/\/api\/auth\/verify-email/);assert.match(worker,/\/api\/auth\/resend-verification/);
  assert.match(accountStoreSource,/EMAIL_VERIFICATION_REQUIRED/);assert.match(accountStoreSource,/emailVerified:!verificationRequired/);
  assert.match(accountStoreSource,/walletCoins:verificationRequired\?0:100/);
  assert.match(accountStoreSource,/async verifyEmail\(request\)/);assert.match(accountStoreSource,/async resendVerification\(request\)/);
  assert.match(accountStoreSource,/emailVerificationTokenHash/);assert.match(accountStoreSource,/EMAIL_VERIFY_TTL_MS=1000\*60\*60\*24/);
  assert.match(accountStoreSource,/signupAwardedAt/);assert.match(accountStoreSource,/account\.emailVerified===false/);
  assert.match(source,/id="verificationTitle">Verify Your Email</);assert.match(source,/id="verificationResend"/);
  assert.match(source,/api\('\/api\/auth\/resend-verification'/);assert.match(source,/error\?\.code==='EMAIL_NOT_VERIFIED'/);
  assert.match(source,/verificationHash=inviteUrl\.hash\.match\(\/\^#verify=/);assert.match(source,/verificationToken=verificationHash\?\.\[1\]\|\|inviteUrl\.searchParams\.get\('verify'\)/);assert.match(source,/api\('\/api\/auth\/verify-email'/);
  assert.match(source,/if\(validVerificationToken\)\{await launchEmailVerification\(\);return;\}/);
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
  assert.match(source,/class="leaderboard-mode-tabs"/);
  assert.match(source,/id="globalLeaderboardTab"/);assert.match(source,/id="monthlyLeaderboardTab"/);
  assert.match(source,/class="leaderboard-return"/);
  assert.match(source,/function setLeaderboardHeading\(text\)[^]*?heading\.append\(first,document\.createTextNode\(' '\),second\)/);
  assert.match(source,/\.leaderboard-title h1\{[^]*?min-height:1\.9em[^]*?display:grid/);
  assert.doesNotMatch(source,/class="leaderboard-controls"/);
});

test('mobile leaderboards swipe horizontally in attract and manual views while ordinary taps return to the menu',()=>{
  const board=source.slice(source.indexOf('let leaderboardTouchStart'),source.indexOf('function mainMenuIdleEligible'));
  assert.match(board,/function leaderboardSwipeEnabled\(\)\{return !leaderboardScreen\.hidden&&globalThis\.matchMedia\?\.\('\(max-width:760px\)'\)\.matches;\}/);
  assert.match(board,/leaderboardScreen\.addEventListener\('touchstart'/);
  assert.match(board,/leaderboardScreen\.addEventListener\('touchend'/);
  assert.match(board,/Math\.abs\(dx\)<48/);
  assert.match(board,/Math\.abs\(dx\)<Math\.abs\(dy\)\*1\.15/);
  assert.match(board,/nextLeaderboard\(dx<0\?1:-1\)/);
  assert.match(source,/Date\.now\(\)<leaderboardSwipeSuppressClickUntil/);
  assert.match(source,/leaderboardScreen\.classList\.toggle\('attract-mode',attractMode\)/);
  assert.match(source,/leaderboardScreen\.classList\.remove\('attract-mode'\)/);
  assert.match(source,/\.leaderboard-screen\.attract-mode \.leaderboard-mode-tabs\{visibility:hidden;pointer-events:none\}/);
  assert.match(source,/modeTabs\.setAttribute\('aria-hidden',attractMode\?'true':'false'\)/);
  assert.doesNotMatch(source,/Swipe left or right to switch leaderboards/);
  assert.doesNotMatch(source,/calc\(abs\(/);
});

test('manual leaderboard background click and Return restore the main menu without automatic rotation',()=>{
  const block=source.slice(source.indexOf('function restartLeaderboardTimer'),source.indexOf('function lobbyUrl'));
  assert.match(block,/if\(returnToMenu\)\{onlinePanel\.hidden=true;freePanel\.hidden=true;overlay\.hidden=false;\}/);
  assert.match(block,/globalLeaderboardTab'\)\.addEventListener\('click'/);assert.match(block,/monthlyLeaderboardTab'\)\.addEventListener\('click'/);
  assert.match(block,/leaderboard-return'\)\.addEventListener\('click',event=>\{event\.stopPropagation\(\);closeLeaderboard\(true\);\}/);
  assert.match(block,/leaderboardScreen\.addEventListener\('click',event=>\{if\(Date\.now\(\)<leaderboardSwipeSuppressClickUntil\)[^]*?if\(event\.target\.closest\('button'\)\)return;closeLeaderboard\(true\);\}\)/);
  assert.match(block,/if\(leaderboardScreen\.hidden\|\|!attractMode\)return/);
  assert.doesNotMatch(block,/if\(attractMode\)\{closeLeaderboard\(true\);return;\}nextLeaderboard\(1\)/);
  assert.match(source,/rotateNote:'Use the arrows to switch leaderboards\. Click anywhere else to return to the menu\.'/);
});

test('coarse mobile menu uses one immediate pointer-up activation path without competing handlers',()=>{
  assert.match(source,/\.solo-start-overlay button\{touch-action:manipulation/);
  assert.match(source,/function installImmediateMobileTap\(button\)/);
  assert.match(source,/button\.addEventListener\('pointerdown'/);
  assert.match(source,/button\.addEventListener\('touchend'/);
  assert.match(source,/if\(distance>18\)return/);
  assert.match(source,/immediateMenuProgrammaticTarget=button;[\s\S]*button\.click\(\)/);
  assert.doesNotMatch(source,/fastMenuPointer|fastMenuSyntheticClick|fastMenuSuppressUntil/);
});

test('main-menu attract mode starts fifteen seconds after the visible menu becomes idle',()=>{
  assert.match(source,/const ATTRACT_IDLE_MS=15000;/);
  assert.match(source,/const LEADERBOARD_ROTATE_MS=5000;/);
  assert.match(source,/let lastMenuActivityAt=Date\.now\(\)/);
  assert.match(source,/function startAttractWatcher\(\)[\s\S]*setInterval/);
  assert.match(source,/Date\.now\(\)-lastMenuActivityAt<ATTRACT_IDLE_MS/);
  assert.match(source,/void openLeaderboard\(true\)/);
  assert.doesNotMatch(source,/clearInterval\(attractTimer\)/);
  assert.match(source,/lastMenuActivityAt=Date\.now\(\);startAttractWatcher\(\)/);
  assert.match(source,/if\(event\.isTrusted&&!attractMode&&mainMenuIdleEligible\(\)\)resetAttractTimer\(\)/);
  assert.match(source,/applyRankedLocale\(\);globalThis\.__gostopRankedBootComplete=true;void prepareNotificationRegistration\(\);void watchNotificationPermission\(\);authRestorePromise=refreshAccount\(\)/);assert.match(source,/function revealCurrentMainMenu\(\)[\s\S]*overlay\.dataset\.currentMenuReady='true';overlay\.hidden=false/);assert.doesNotMatch(source,/resumeActiveRankedRoom/);
  assert.match(docs,/After 15 seconds of main-menu inactivity, attract mode shows Global for 5 seconds, Monthly for 5 seconds, then returns to the main menu for 15 seconds and repeats/);
});
test('inactivity warning dismissal is sticky for the current warning while server countdown continues',()=>{
  assert.match(source,/let flowInterval=null,dismissedInactivityKey='',pauseActionPending=false/);
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

test('pause UI resumes requester, confirms opponent quit in both phases, and receives ended snapshots',()=>{
  assert.match(source,/rankedPauseCountdown\" class=\"ranked-countdown\">3:00/);
  assert.match(source,/id=\"rankedPauseAction\"/);
  assert.match(source,/id=\"rankedPauseQuitConfirmTitle\"/);
  assert.match(source,/id=\"rankedPauseQuitYes\"/);
  assert.match(source,/id=\"rankedPauseQuitNo\"/);
  assert.match(source,/id=\"rankedPauseOutcomeTitle\"/);
  assert.match(source,/resumeGame:'Resume Game'/);
  assert.match(source,/waitingOnYou:'Waiting On You'/);
  assert.match(source,/expiredPauseOpponent:'You can end the session with a win for the current game'/);
  assert.match(source,/expiredPauseYou:'Opponent can end the session with a win for the current game'/);
  assert.match(source,/expiredPauseQuitConfirmTitle:'End Session With Win\?'/);
  assert.match(source,/own\?\(expired\?'resumeGame':'cancelPause'\):'quitPausedGame'/);
  assert.match(source,/pauseQuitConfirmAction=pause\.expired\?'expired-win':'active-draw'/);
  assert.match(source,/renderPauseQuitConfirmationLocale\(\);setDialog\(pauseDialog,false\);setDialog\(pauseQuitConfirmDialog,true\)/);
  assert.match(source,/pauseQuitConfirmAction==='expired-win'\?\{type:'claimExpiredPauseWin'\}:\{type:'quitPausedGame'\}/);
  assert.match(source,/submitRanked\(\{type:'cancelPause'\}\)/);
  assert.match(source,/pauseResolutionChanged/);
  assert.match(source,/returnEndedOnlineSessionToMenu/);
  assert.match(appSource,/if\(flow\.pauseResolution\|\|flow\.abandonment\)\{setDialog\(els\.opponentEndedDialog,false\);return;\}/);
  const snapshotHandler=appSource.slice(appSource.indexOf("adapter.addEventListener('snapshot'"),appSource.indexOf("adapter.addEventListener('actionAccepted'"));
  assert.match(snapshotHandler,/sessionFlow\?\.ended[\s\S]*reconcileOnlineFlow\(event\.detail\.snapshot\)[\s\S]*gostop-online-snapshot/);
  assert.match(appSource,/dialog\[open\]:not\(\.ranked-flow-dialog\)/);
  assert.match(appSource,/returnEndedOnlineSessionToMenu\(\)\{returnOnlineToMenu\(\);\}/);
});

test('share-link room creator leaves Online Play overlay when the friend makes the room ready',()=>{
  assert.match(appSource,/function enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/document\.getElementById\('onlineLobbyPanel'\)/);
  assert.match(appSource,/adapter\.addEventListener\('roomReady'[\s\S]*enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/adapter\.addEventListener\('opponentConnected'[\s\S]*enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/event\.detail\?\.status==='ready'[\s\S]*enterOnlineMatchView\(anonymous\)/);
  assert.match(appSource,/adapter\.addEventListener\('snapshot'[\s\S]*event\.detail\.snapshot\?\.matchId[\s\S]*enterOnlineMatchView\(anonymous\)/);
});

test('stale ranked locks are server-reconciled and reconnect status reaches the browser',()=>{
  assert.match(worker,/async function reconcileActiveRanked\(env,account\)/);
  assert.match(worker,/\/reconcile-active/);
  assert.match(worker,/activeRanked:\{\.\.\.active,connected:status\.connected!==false,reconnectUntil:Number\(status\.reconnectUntil\)\|\|null/);
  assert.match(worker,/\/internal\/active-ranked\/clear/);
  assert.match(source,/activeRankedRefreshTimer/);
  assert.match(source,/function scheduleActiveRankedRecheck\(\)/);
  assert.match(source,/setTimeout\(\(\)=>\{activeRankedRefreshTimer=null;void refreshAccount\(\);\},20000\)/);
});

test('Competitive reconnect No is authenticated and routed to authoritative abandonment settlement',()=>{
  assert.match(worker,/decline-reconnect/);
  assert.match(worker,/account\.activeRanked\?\.roomCode!==match\[1\]\|\|!\['solo','online'\]\.includes\(account\.activeRanked\?\.mode\)/);
  assert.match(worker,/https:\/\/room\/decline-reconnect/);
});

test('Global and Monthly leaderboards always render ten rank slots and append the signed-in player only when outside Top 10',()=>{
  const board=source.slice(source.indexOf('function leaderboardRowIsCurrent'),source.indexOf('function nextLeaderboard'));
  assert.match(board,/rankedRows=rows\.filter\(row=>Number\(row\.rank\)>0\)/);
  assert.match(board,/topTen=rankedRows\.slice\(0,10\)/);
  assert.match(board,/for\(let index=0;index<10;index\+\+\)/);
  assert.match(board,/emptyLeaderboardRow\(index\+1\)/);
  assert.match(board,/ownRow=account\?rows\.find\(leaderboardRowIsCurrent\):null/);
  assert.match(board,/if\(ownRow&&!ownInTop\)rendered\.push\(leaderboardRowHtml\(ownRow,\{current:true,outsideTop:true\}\)\)/);
  assert.match(source,/leaderboard-current-outside-top/);
  assert.match(source,/leaderboard-empty-row/);
  assert.match(source,/leaderboard-decor/);assert.match(source,/leaderboard-card-fan/);
  assert.match(source,/\.leaderboard-table-wrap\{[^]*?align-self:start!important[^]*?margin:14px auto 0!important/);
});

test('leaderboard uses Net Coins ranking while ranked game identity shows nickname only',()=>{
  assert.match(source,/netCoins:'Net Coins'/);
  assert.match(source,/earnedLost:'Earned \/ Lost'/);
  assert.match(source,/row\.netCoins\?\?row\.score/);
  assert.match(source,/row\.totalCoinsLost/);
  const identity=source.slice(source.indexOf('function patchGameIdentity'),source.indexOf('playPractice.addEventListener'));
  assert.match(identity,/if\(account\)\{humanName\.innerHTML=playerNicknameHtml\(\{accountId:account\.id,nickname:account\.nickname/);
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
  assert.match(source,/accountIdentity\.hidden=!!authToken&&!account/);
  assert.match(source,/if\(authToken&&!account\)\{accountIdentity\.innerHTML='';return;\}/);
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
test('attract idle resets only on trusted user input',()=>{assert.match(source,/pointerdown',event=>\{if\(event\.isTrusted/);assert.match(source,/if\(event\.isTrusted&&mainMenuIdleEligible\(\)\)resetAttractTimer\(\)/);});

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


test('legacy two-button shell stays hidden through auth restore before any reconnect choice is shown',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(html,/id="soloStartOverlay" class="solo-start-overlay" hidden data-current-menu-ready="false"/);
  assert.match(css,/\.solo-start-overlay\[hidden\]\{display:none!important\}/);
  assert.match(source,/function revealCurrentMainMenu\(\)[\s\S]*overlay\.hidden=false/);
  assert.match(source,/function revealCurrentMainMenu\(\)\{[\s\S]*gateInitialMainMenuFullscreen\?\.\(\)[\s\S]*Promise\.resolve\(gate\)\.then\(\(\)=>revealCurrentMainMenu\(\)\)/);
  const boot=source.slice(source.indexOf('function revealCurrentMainMenu'),source.lastIndexOf('})();'));
  assert.match(boot,/authRestorePromise=refreshAccount\(\)/);
  assert.match(boot,/if\(validRoomParam\)\{void launchInviteRoom\(\);return;\}await settleInitialReconnectDecision\(\);if\(promptActiveRankedGameIfNeeded\(\)\)return;revealCurrentMainMenu\(\)/);
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


test('Settings dialog owns Language and Notifications while legacy Room code Join Game is visually removed',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(source,/languageBtn\.id='languageBtn'/);assert.match(source,/languageMenu\.id='languageMenu'/);assert.match(source,/notificationsBtn\.id='enablePlayNotificationsBtn'/);
  assert.match(source,/settingsDialog\.id='settingsDialog'/);assert.match(source,/settingsControlsHost/);assert.match(source,/accountSettingsBtn/);assert.match(source,/settingsOk/);
  assert.match(source,/accountMenuControls\.append\(accountLanguageControl,notificationsBtn\)/);assert.match(source,/settingsControlsHost'\)\.appendChild\(accountMenuControls\)/);
  assert.doesNotMatch(html,/id="languageBtn"/);assert.match(html,/id="joinOnlineForm"[^>]*hidden[^>]*display:none!important/);
  assert.match(source,/if\(joinForm\)\{joinForm\.hidden=true;joinForm\.style\.display='none';\}/);
});

test('main menu uses two exclusive accordion choices with Training inside Friendly and compact utility navigation',()=>{
  assert.match(source,/rankedToggle\.id='competitiveGamingBtn'/);assert.match(source,/freeToggle\.id='friendlyGamingBtn'/);
  assert.match(source,/rankedSubmenu\.append\(rankedSolo,onlinePlay\)/);
  assert.match(source,/freeSubmenu\.append\(playPractice,freeFriendBtn,trainingBtn\)/);
  assert.match(source,/trainingBtn\.className='menu-training'/);
  assert.match(source,/utilities\.className='main-menu-utilities'/);assert.match(source,/utilities\.append\(friendsBtn,leaderboardBtn\)/);
  assert.match(source,/menu\.append\(rankedGroup,freeGroup,utilities\)/);
  assert.match(source,/function setMenuSection\(section=null\)/);assert.match(source,/expandedMenuSection===section\?null:section/);assert.match(source,/submenu\.inert=!open/);assert.match(source,/visibility:hidden/);
  assert.match(source,/rankedToggle\.addEventListener\('click',\(\)=>toggleMenuSection\('competitive'\)\)/);
  assert.match(source,/freeToggle\.addEventListener\('click',\(\)=>toggleMenuSection\('friendly'\)\)/);
  assert.match(source,/freeTitle\.textContent=rt\('freeGaming'\)/);assert.match(source,/rankedTitle\.textContent=rt\('competitiveGaming'\)/);
  assert.match(source,/freeGroupNote\.textContent=rt\('freeGamingNote'\)/);assert.match(source,/rankedGroupNote\.textContent=rt\('competitiveGamingNote'\)/);
});

test('main menu is a polished balanced accordion lobby with compact choices, centered player HUD, and Hwatu energy',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(source,/menuTitle\.classList\.add\('main-menu-title'\)/);
  assert.doesNotMatch(source,/MATCH · CAPTURE · GO OR STOP/);
  assert.doesNotMatch(source,/main-menu-tagline/);
  assert.match(source,/main-menu-hwatu-decor/);
  assert.match(source,/addFan\('left',\['m1-1','m2-1','m3-1'\]\)/);
  assert.match(source,/addFan\('right',\['m8-1','m9-1','m12-1'\]\)/);
  assert.match(source,/main-menu-floor-cards/);
  assert.match(source,/\['m1-1','m2-1','m3-1','m6-1','m8-1','m9-1','m12-1'\]/);
  assert.match(source,/\.main-menu-floor-cards\{[^]*?display:block[^]*?animation:mainMenuCardGlow/);
  assert.match(source,/@keyframes mainMenuTitleGlow/);
  assert.match(source,/@keyframes mainMenuChoiceSweep/);
  assert.match(source,/@media\(max-width:1280px\)\{[^]*?\.main-menu-card-fan\{display:none!important\}/);
  assert.match(source,/if\(menuTitle\)menuTitle\.after\(floorCards\);else overlay\.prepend\(floorCards\);menu\.after\(accountBox\)/);
  assert.match(source,/@media\(max-height:760px\)/);
  assert.match(source,/\.solo-start-overlay\{[^]*?align-content:start!important[^]*?place-content:start center!important/);
  assert.match(source,/\.gostop-main-menu\.main-menu-accordion\{[^]*?width:min\(720px,90vw\)!important[^]*?grid-template-columns:1fr!important/);
  assert.match(source,/\.account-menu-box\{[^]*?width:min\(720px,90vw\)!important[^]*?box-sizing:border-box[^]*?margin:28px auto 4px!important/);
  assert.match(source,/@media\(max-width:760px\)[^]*?\.account-menu-box\{width:min\(94vw,560px\)!important;margin-top:44px!important/);
  assert.match(source,/@media\(max-height:760px\)[^]*?\.account-menu-box\{padding:7px 10px!important;margin-top:40px!important/);
  assert.match(source,/\.menu-category-toggle\{[^]*?min-height:72px[^]*?padding:9px 18px/);
  assert.match(source,/\.solo-start-overlay \.menu-category-title\{font:800 clamp\(36px,3\.05vw,42px\)\/\.98 Georgia,serif!important/);
  assert.match(source,/max-height:var\(--submenu-open-height,240px\)/);
  assert.match(source,/const height=lite\?\(submenu\.children\.length\*52\+24\):submenu\.scrollHeight\+24/);assert.match(source,/touch-action:manipulation/);
  assert.match(source,/function installImmediateMobileTap\(button\)/);
  assert.match(source,/const pointerCapable=typeof globalThis\.PointerEvent==='function'/);
  assert.match(source,/if\(!pointerCapable&&touchCapable\)[\s\S]*button\.addEventListener\('touchend',[\s\S]*activate\(\)/);
  assert.match(source,/button\.addEventListener\('pointerup',[\s\S]*activate\(\)/);
  assert.match(source,/immediateMenuSuppressUntil=Date\.now\(\)\+650/);
  assert.match(source,/@media\(max-width:760px\)\{\.solo-start-overlay\{[^]*?min-height:100dvh!important[^]*?align-content:center!important[^]*?place-content:center!important/);
  assert.match(source,/\.gostop-main-menu\.main-menu-accordion:before\{content:none!important/);
  assert.match(source,/#accountMenuIdentity\{display:grid;grid-template-columns:minmax\(180px,1fr\) auto auto auto/);
  assert.match(source,/padding:clamp\(42px,5vh,58px\) clamp\(16px,3vw,42px\) 30px!important/);assert.match(source,/\.solo-start-overlay \.menu-category-title\{font:800 clamp\(36px,3\.05vw,42px\)[^]*?white-space:nowrap/);assert.match(source,/@media\(max-width:760px\)[^]*?\.menu-category-toggle\{min-height:56px[^]*?\.solo-start-overlay \.menu-category-title\{font-size:clamp\(24px,6vw,30px\)!important/);assert.match(html,/ranked-client\.js\?v=20260924-21/);
});

test('Friendly Play With Friend launches through a separate link-only non-ranked room flow',()=>{
  assert.match(source,/freePanel\.id='freeFriendPanel'/);
  assert.match(source,/gostop-free-online-create/);
  assert.doesNotMatch(source,/gostop-free-online-join/);
  assert.doesNotMatch(source,/id="freeRoomCode"|id="freeJoinForm"|id="freeJoinBtn"/);
  assert.match(source,/id="freeShareLink"/);
  assert.match(source,/id="freeCopyLinkBtn"/);
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


test('Friendly Play With Friend direct link joins a new seat and closes the waiting panel on the authoritative match snapshot',()=>{
  const beginOnline=appSource.slice(appSource.indexOf('const beginOnline=async'),appSource.indexOf("addEventListener('gostop-online-snapshot'"));
  assert.match(beginOnline,/if\(event\.detail\.snapshot\?\.matchId\)\{activeOnlineStatus\.textContent=t\('matchReady'\);enterOnlineMatchView\(anonymous\);announceFriendlyJoin\(\);\}/);
  const handoff=appSource.slice(appSource.indexOf('function enterOnlineMatchView'),appSource.indexOf('const beginOnline=async'));
  assert.match(handoff,/if\(anonymous\)\{if\(freeFriendPanel\)freeFriendPanel\.hidden=true;\}/);
  const invite=source.slice(source.indexOf('async function launchInviteRoom'),source.indexOf('globalThis.GoStopRanked'));
  assert.match(invite,/if\(inviteMode==='free'\)[^]*bridge=>bridge\.joinFreeRoom\(code\)/);
  const freeJoin=appSource.slice(appSource.indexOf('async joinFreeRoom(roomCode)'),appSource.indexOf('    });',appSource.indexOf('async joinFreeRoom(roomCode)')));
  assert.match(freeJoin,/sessionStorage\.removeItem\(`gostop-room-\$\{code\}`\)/);
  assert.match(freeJoin,/const room=await adapter\.join\(code\)/);
  assert.doesNotMatch(freeJoin,/adapter\.join\(code,existing\?\.credential\)/);
});

test('Friendly Play With Friend uses Cancel while leaderboard and competitive lobby keep Return',()=>{
  const locale=source.slice(source.indexOf('function applyRankedLocale'),source.indexOf('function renderAccountBox'));
  assert.match(locale,/\$\('freeFriendClose'\)\.textContent=rt\('cancel'\)/);
  assert.match(locale,/\$\('onlineLobbyClose'\)\.textContent=rt\('return'\)/);
  assert.match(locale,/leaderboardScreen\.querySelector\('\.leaderboard-return'\)\.textContent=rt\('return'\)/);
});


test('first root visit waits briefly for the closed game socket to reconcile before revealing the menu',()=>{
  const boot=source.slice(source.indexOf("const inviteUrl=new URL(location.href)"),source.lastIndexOf('})();'));
  assert.match(boot,/async function settleInitialReconnectDecision\(\)/);
  assert.match(boot,/!\['solo','online'\]\.includes\(mode\)\|\|!roomCode\|\|initial\.connected===false\|\|!savedCompetitiveRoom\(roomCode\)/);
  assert.match(boot,/for\(const waitMs of \[120,220,350,500\]\)/);
  assert.match(boot,/await new Promise\(resolve=>setTimeout\(resolve,waitMs\)\)/);
  assert.match(boot,/const data=await api\('\/api\/me'\);captureAccountPayload\(data\);renderAccountBox\(\);patchGameIdentity\(\)/);
  assert.match(boot,/refreshed\?\.mode!==mode\|\|refreshed\.roomCode!==roomCode\|\|refreshed\.connected===false/);
  assert.match(boot,/await settleInitialReconnectDecision\(\);if\(promptActiveRankedGameIfNeeded\(\)\)return;revealCurrentMainMenu\(\)/);
});

test('root URL offers a Yes/No continuation dialog for another device and shows countdown only during reconnect grace',()=>{
  const boot=source.slice(source.indexOf("const inviteUrl=new URL(location.href)"),source.lastIndexOf('})();'));
  assert.match(boot,/validRoomParam=!!roomParam/);
  assert.match(boot,/function savedCompetitiveRoom\(roomCode\)/);
  assert.match(boot,/saved\?\.roomCode===roomCode&&saved\?\.credential/);
  assert.match(source,/id="returnGameTitle">Continue Active Game\?/);
  assert.match(source,/id="returnGameCountdown" class="ranked-countdown" hidden>1:00/);
  assert.match(source,/id="returnGameYes"[^>]*>Yes</);
  assert.match(source,/id="returnGameNo"[^>]*>No</);
  assert.match(source,/id="returnGameOk"[^>]*hidden>OK</);
  assert.match(boot,/function promptActiveRankedGameIfNeeded\(\)/);
  assert.match(boot,/reconnecting=active\?\.connected===false&&reconnectUntil>Date\.now\(\),activeElsewhere=active\?\.connected===true/);
  assert.match(boot,/!\['solo','online'\]\.includes\(mode\)\|\|!active\.roomCode\|\|\(!reconnecting&&!activeElsewhere\)/);
  assert.match(boot,/returnGameCountdown'\)\.hidden=!activeReconnectPending\(\)/);
  assert.match(boot,/returnReconnectTimer=setInterval\(updateReturnReconnectCountdown,250\)/);
  assert.match(boot,/\$\('returnGameYes'\)\.addEventListener\('click'[\s\S]*bridge=>bridge\.joinCompetitiveRoom\(active\.roomCode,\{resumeExisting:true\}\)/);
  assert.match(boot,/\$\('returnGameNo'\)\.addEventListener\('click',[\s\S]*if\(activeReconnectPending\(\)\)void finishReconnectAsAbandonment\(\);else/);
  assert.match(boot,/function showReconnectAbandonmentOutcome\(result\)[\s\S]*returnGameDialog\.dataset\.outcome='1'[\s\S]*returnGameCountdown'\)\.hidden=true[\s\S]*returnGameActions'\)\.hidden=true[\s\S]*returnGameOk'\)\.hidden=false/);
  assert.match(boot,/\/api\/rooms\/\$\{active\.roomCode\}\/decline-reconnect/);
  assert.match(boot,/if\(promptActiveRankedGameIfNeeded\(\)\)return;revealCurrentMainMenu\(\)/);
  assert.match(appSource,/async joinCompetitiveRoom\(roomCode,\{resumeExisting=false\}=\{\}\)/);
  assert.match(appSource,/onlineSkipInitialOpening=!!resumeExisting/);
});

