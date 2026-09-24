import {test,expect} from '@playwright/test';

const authority='https://gostop-authority.jwshin1.workers.dev';
const selfAccount={
  id:'acct-self',nickname:'Jong',countryCode:'US',walletCoins:2021,
  stats:{global:{gamesPlayed:39,wins:20}},activeRanked:null,
  incomingFriendRequestCount:0
};
const otherPlayer={
  accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',walletCoins:252,
  rank:2,globalRank:2,monthlyRank:1,score:3.4,coinsPerGame:3.4,
  gamesPlayed:10,wins:4,losses:6,online:true,status:'available',challengeable:true,similarity:82,
  friendState:'none',playedTogether:3,
  headToHead:{wins:2,losses:1,coinsWon:8,coinsLost:3,lastPlayedAt:'2026-09-21T20:00:00.000Z'}
};
const globalRows=[
  {accountId:'acct-self',nickname:'Jong',countryCode:'US',rank:1,score:11.41,totalCoins:445,gamesPlayed:39,wins:20,losses:19,walletCoins:2021},
  {accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',rank:2,score:3.4,totalCoins:34,gamesPlayed:10,wins:4,losses:6,walletCoins:252}
];
const monthlyRows=[
  {accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',rank:1,score:4.2,totalCoins:21,gamesPlayed:5,wins:3,losses:2,walletCoins:252},
  {accountId:'acct-self',nickname:'Jong',countryCode:'US',rank:2,score:3.8,totalCoins:18,gamesPlayed:4,wins:2,losses:2,walletCoins:2021}
];
const profileFor=id=>id==='acct-other'?{
  accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',globalRank:2,monthlyRank:1,
  sessionsPlayed:5,gamesPlayed:10,wins:4,losses:6,lastLoginAt:'2026-09-22T20:00:00.000Z',walletCoins:252,
  headToHead:{sessionsPlayedTogether:2,gamesPlayedTogether:3,wins:2,losses:1,coinsWon:8,coinsLost:3,netCoins:5}
}:{
  accountId:'acct-self',nickname:'Jong',countryCode:'US',globalRank:1,monthlyRank:2,
  sessionsPlayed:15,gamesPlayed:39,wins:20,losses:19,lastLoginAt:'2026-09-22T22:00:00.000Z',walletCoins:2021,
  headToHead:{sessionsPlayedTogether:0,gamesPlayedTogether:0,wins:0,losses:0,coinsWon:0,coinsLost:0,netCoins:0}
};

async function installHarness(page,{boards={global:globalRows,monthly:monthlyRows},socialSnapshot=null,profileFailure=false,notificationPermission=null}={}){
  await page.addInitScript(({account,other,notificationPermission})=>{
    localStorage.setItem('gostop-auth-token','e2e-token');
    localStorage.setItem('gostop-account-cache',JSON.stringify(account));
    class FakeWebSocket extends EventTarget{
      static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
      constructor(){super();this.readyState=FakeWebSocket.CONNECTING;setTimeout(()=>{this.readyState=FakeWebSocket.OPEN;const event=new Event('open');this.dispatchEvent(event);this.onopen?.(event);},0);}
      emit(message){setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)})),0);}
      send(raw){
        let message={};try{message=JSON.parse(raw);}catch(_){return;}
        if(message.type==='recommendations')this.emit({type:'recommendations',players:[other],onlineCount:1});
        else if(message.type==='search')this.emit({type:'searchResults',players:[other],onlineCount:1,autoMatching:false});
        else if(message.type==='autoMatchStart')this.emit({type:'autoMatchCandidate',candidate:other});
        else if(message.type==='autoMatchCancel')this.emit({type:'autoMatchCancelled'});
        else if(message.type==='socialProfiles')this.emit({type:'socialProfiles',players:[other]});
      }
      close(){if(this.readyState===FakeWebSocket.CLOSED)return;this.readyState=FakeWebSocket.CLOSED;const event=new CloseEvent('close',{code:1000});this.dispatchEvent(event);this.onclose?.(event);}
    }
    globalThis.WebSocket=FakeWebSocket;
    if(notificationPermission){
      const fakeNotification={permission:notificationPermission,requestPermission:async()=>notificationPermission};
      Object.defineProperty(globalThis,'Notification',{configurable:true,value:fakeNotification});
      Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>({showNotification:async()=>{}})}});
      Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:notificationPermission==='granted'?'granted':notificationPermission==='denied'?'denied':'prompt',addEventListener:()=>{}})}});
    }
  },{account:selfAccount,other:otherPlayer,notificationPermission});

  await page.route('https://commons.wikimedia.org/**',route=>route.abort());
  await page.route(authority+'/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    const headers={
      'content-type':'application/json',
      'access-control-allow-origin':'http://127.0.0.1:4173',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type,authorization'
    };
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
    let body={ok:true};
    if(path==='/api/me')body={ok:true,account:selfAccount,notices:[]};
    else if(path==='/api/leaderboards')body={ok:true,month:'2026-09',global:boards.global,monthly:boards.monthly};
    else if(path==='/api/player-profile'){
      if(profileFailure)return route.abort();
      const posted=request.postDataJSON?.()||JSON.parse(request.postData()||'{}');
      body={ok:true,player:profileFor(posted.accountId)};
    }else if(path==='/api/social')body=socialSnapshot||{ok:true,friends:[],incoming:[],outgoing:[],history:[],recommendations:[otherPlayer]};
    else if(path==='/api/social/search')body={ok:true,players:[{...otherPlayer,friendState:'none'}]};
    else if(path==='/api/social/request')body={ok:true,state:'outgoing',accountId:'acct-other'};
    else if(path==='/api/social/respond')body={ok:true,state:'friend'};
    else if(path==='/api/social/unfriend')body={ok:true,state:'none'};
    else if(path==='/api/auth/login')body={ok:true,account:selfAccount,session:{token:'e2e-login-token'},notices:[]};
    else if(path==='/api/auth/register')body={ok:true,account:selfAccount,session:{token:'e2e-register-token'},notices:[],awards:{signupCoins:100,dailyCoins:100}};
    else if(path==='/api/rooms')body={ok:true,room:{roomCode:'ABCDEFGHJK2345',credential:'host-credential',seatId:'playerA',status:'waiting',ranked:false,rankedMode:'free'}};
    else if(path==='/api/referrals/create')body={ok:true,referralToken:'a'.repeat(64)};
    else if(path==='/api/auth/logout')body={ok:true};
    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });
}

async function openMenu(page,{mobile=false,boards,socialSnapshot,profileFailure=false,notificationPermission=null}={}){
  if(mobile)await page.setViewportSize({width:390,height:844});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error));
  await installHarness(page,{boards,socialSnapshot,profileFailure,notificationPermission});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.main-menu-title')).toContainText('GoStop');
  await expect(page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]')).toBeVisible();
  return pageErrors;
}

test('desktop main menu primary controls open their intended surfaces without runtime errors',async({page})=>{
  const errors=await openMenu(page);
  const title=await page.locator('.main-menu-title').boundingBox();
  expect(title).not.toBeNull();expect(title.y).toBeGreaterThanOrEqual(0);

  await page.locator('#accountSettingsBtn').click();
  await expect(page.locator('#settingsDialog')).toHaveJSProperty('open',true);
  await page.locator('#settingsOk').click();
  await expect(page.locator('#settingsDialog')).toHaveJSProperty('open',false);

  await page.locator('#howToBtn').click();
  await expect(page.locator('#howToDialog')).toHaveJSProperty('open',true);
  await page.locator('#howToDialog .tutorial-close').click();
  await expect(page.locator('#howToDialog')).toHaveJSProperty('open',false);

  await page.locator('#friendlyGamingBtn').click();
  await page.locator('#freeFriendBtn').click();
  await expect(page.locator('#freeFriendPanel')).toBeVisible();
  await page.locator('#freeFriendClose').click();
  await expect(page.locator('#freeFriendPanel')).toBeHidden();

  await page.locator('#competitiveGamingBtn').click();
  await page.locator('#onlinePlayMenuBtn').click();
  await expect(page.locator('#onlineLobbyPanel')).toBeVisible();
  await page.locator('#onlineLobbyClose').click();
  await expect(page.locator('#onlineLobbyPanel')).toBeHidden();

  await page.locator('#friendsMenuBtn').click();
  await expect(page.locator('#socialScreen')).toBeVisible();
  await page.locator('#socialClose').click();
  await expect(page.locator('#socialScreen')).toBeHidden();

  expect(errors.map(error=>error.message)).toEqual([]);
});

test('clicking your own main-menu nickname opens complete Player Info instead of a fetch failure',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]').click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',true);
  await expect(page.locator('#playerInfoTitle')).toContainText('Jong');
  await expect(page.locator('#playerInfoBody')).toContainText('Global Rank');
  await expect(page.locator('#playerInfoBody')).toContainText('Monthly Rank');
  await expect(page.locator('#playerInfoBody')).toContainText('Sessions Played');
  await expect(page.locator('#playerInfoBody')).toContainText('Games Played');
  await expect(page.locator('#playerInfoBody')).toContainText('Wallet Coins');
  await expect(page.locator('#playerInfoBody')).not.toContainText('Failed to fetch');
  await page.locator('#playerInfoOk').click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',false);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('leaderboard is interactive: ten slots render and another player nickname opens head-to-head Player Info',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#leaderboardMenuBtn').click();
  await expect(page.locator('.leaderboard-screen')).toBeVisible();
  await expect(page.locator('#leaderboardHeading')).toHaveText('Global Leaderboard');
  await expect(page.locator('#leaderboardBody tr')).toHaveCount(10);
  await page.locator('#leaderboardBody [data-player-info-account-id="acct-other"]').click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',true);
  await expect(page.locator('#playerInfoBody')).toContainText('Your History With Jjineeland');
  await expect(page.locator('#playerInfoBody')).toContainText('Coins vs This Player');
  await page.locator('#playerInfoOk').click();
  await page.locator('#monthlyLeaderboardTab').click();
  await expect(page.locator('#leaderboardHeading')).toHaveText('Monthly Leaderboard');
  await expect(page.locator('#leaderboardBody tr')).toHaveCount(10);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('main menu accordion starts simple, slides one category open at a time, and can collapse back to two choices',async({page})=>{
  const errors=await openMenu(page);
  await expect(page.locator('#competitiveGamingBtn')).toBeVisible();
  await expect(page.locator('#friendlyGamingBtn')).toBeVisible();
  await expect(page.locator('#rankedSoloBtn')).toBeHidden();
  await expect(page.locator('#freeFriendBtn')).toBeHidden();
  await page.locator('#competitiveGamingBtn').click();
  await expect(page.locator('#competitiveGamingBtn')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#rankedSoloBtn')).toBeVisible();
  await expect(page.locator('#onlinePlayMenuBtn')).toBeVisible();
  await expect(page.locator('#freeFriendBtn')).toBeHidden();
  await page.locator('#friendlyGamingBtn').click();
  await expect(page.locator('#competitiveGamingBtn')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#friendlyGamingBtn')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#rankedSoloBtn')).toBeHidden();
  await expect(page.locator('#freeFriendBtn')).toBeVisible();
  await expect(page.locator('#trainingModeBtn')).toBeVisible();
  await page.locator('#friendlyGamingBtn').click();
  await expect(page.locator('#friendlyGamingBtn')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#freeFriendBtn')).toBeHidden();
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('mobile main menu remains usable and visibly keeps Hwatu decoration at narrow width',async({page})=>{
  const errors=await openMenu(page,{mobile:true});
  const title=await page.locator('.main-menu-title').boundingBox();
  expect(title).not.toBeNull();expect(title.y).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#competitiveGamingBtn')).toBeVisible();
  await expect(page.locator('#friendlyGamingBtn')).toBeVisible();
  await expect(page.locator('#rankedSoloBtn')).toBeHidden();
  await expect(page.locator('#freeFriendBtn')).toBeHidden();
  await page.locator('#competitiveGamingBtn').click();
  await expect(page.locator('#rankedSoloBtn')).toBeVisible();
  await expect(page.locator('#onlinePlayMenuBtn')).toBeVisible();
  await page.locator('#friendlyGamingBtn').click();
  await expect(page.locator('#rankedSoloBtn')).toBeHidden();
  await expect(page.locator('#freeFriendBtn')).toBeVisible();
  await expect(page.locator('#trainingModeBtn')).toBeVisible();
  await expect(page.locator('#friendsMenuBtn')).toBeVisible();
  await expect(page.locator('#leaderboardMenuBtn')).toBeVisible();
  await expect(page.locator('#howToBtn')).toBeVisible();
  await expect(page.locator('.main-menu-floor-cards')).toBeVisible();
  await expect(page.locator('.main-menu-floor-card')).toHaveCount(7);
  await page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]').click();
  await expect(page.locator('#playerInfoBody')).toContainText('Games Played');
  await expect(page.locator('#playerInfoBody')).not.toContainText('Failed to fetch');
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('Training Mode launches a real local game and Your Captured Cards opens the complete score breakdown',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#friendlyGamingBtn').click();
  await page.locator('#trainingModeBtn').click();
  await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:12000});
  await expect(page.locator('#table')).toBeVisible();
  await expect(page.locator('[data-score-owner="player"]')).toBeVisible();
  await page.locator('[data-score-owner="player"]').click();
  await expect(page.locator('#scoreDialog')).toHaveJSProperty('open',true);
  await expect(page.locator('#scoreBreakdownContent')).toContainText('Bright');
  await expect(page.locator('#scoreBreakdownContent')).toContainText('Picture');
  await expect(page.locator('#scoreBreakdownContent')).toContainText('Stripe');
  await expect(page.locator('#scoreBreakdownContent')).toContainText('Single');
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('main menu keeps Hwatu decoration at wide, medium, and phone widths',async({page})=>{
  const errors=await openMenu(page);
  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('.main-menu-card-fan.left')).toBeVisible();
  await expect(page.locator('.main-menu-card-fan.right')).toBeVisible();

  await page.setViewportSize({width:1000,height:900});
  await expect(page.locator('.main-menu-card-fan.left')).toBeHidden();
  await expect(page.locator('.main-menu-floor-cards')).toBeVisible();
  await expect(page.locator('.main-menu-floor-card')).toHaveCount(7);

  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.main-menu-floor-cards')).toBeVisible();
  await expect(page.locator('.main-menu-floor-card')).toHaveCount(7);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('leaderboard is centered on the felt and switches directly between Global and Monthly without arrow controls',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#leaderboardMenuBtn').click();
  await expect(page.locator('.leaderboard-panel')).toBeVisible();
  await expect(page.locator('#globalLeaderboardTab')).toHaveClass(/active/);
  await expect(page.locator('.leaderboard-prev')).toHaveCount(0);
  await expect(page.locator('.leaderboard-next')).toHaveCount(0);
  await page.locator('#monthlyLeaderboardTab').click();
  await expect(page.locator('#leaderboardHeading')).toHaveText('Monthly Leaderboard');
  await expect(page.locator('#monthlyLeaderboardTab')).toHaveClass(/active/);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('phone attract mode swipes Global to Monthly without exiting, while a normal tap returns to main menu',async({page})=>{
  const errors=await openMenu(page,{mobile:true});
  await expect(page.locator('.leaderboard-screen')).toBeVisible({timeout:20000});
  await expect(page.locator('#leaderboardHeading')).toHaveText('Global Leaderboard');

  await page.locator('.leaderboard-screen').evaluate(node=>{
    const event=(type,points)=>{
      const e=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(e,type==='touchend'?'changedTouches':'touches',{value:points});
      node.dispatchEvent(e);
    };
    event('touchstart',[{clientX:320,clientY:350}]);
    event('touchend',[{clientX:120,clientY:350}]);
  });
  await expect(page.locator('#leaderboardHeading')).toHaveText('Monthly Leaderboard');
  await expect(page.locator('.leaderboard-screen')).toBeVisible();

  await page.waitForTimeout(700);
  await page.locator('.leaderboard-title').click();
  await expect(page.locator('.leaderboard-screen')).toBeHidden();
  await expect(page.locator('.gostop-main-menu')).toBeVisible();
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('mobile How to Play header remains inside the viewport and its close button does not overlap the navigation row',async({page})=>{
  const errors=await openMenu(page,{mobile:true});
  await page.locator('#howToBtn').click();
  await expect(page.locator('#howToDialog')).toHaveJSProperty('open',true);
  const dialog=await page.locator('#howToDialog .tutorial-card').boundingBox();
  const header=await page.locator('#howToDialog .tutorial-header').boundingBox();
  const close=await page.locator('#howToDialog .tutorial-close').boundingBox();
  const nav=await page.locator('#howToDialog .tutorial-nav').boundingBox();
  expect(dialog).not.toBeNull();expect(header).not.toBeNull();expect(close).not.toBeNull();expect(nav).not.toBeNull();
  expect(dialog.y).toBeGreaterThanOrEqual(0);
  expect(header.y).toBeGreaterThanOrEqual(dialog.y);
  expect(close.y+close.height).toBeLessThanOrEqual(nav.y+1);
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('Online Play browser flow covers Browse Top 10, Search Player, and Auto Match candidate preview',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#competitiveGamingBtn').click();
  await page.locator('#onlinePlayMenuBtn').click();
  await expect(page.locator('#onlineLobbyPanel')).toBeVisible();

  await page.locator('#browsePlayersBtn').click();
  await expect(page.locator('#browsePlayerResults')).toBeVisible();
  await expect(page.locator('#browsePlayerResults')).toContainText('Jjineeland');
  await expect(page.locator('#browsePlayerResults')).toContainText('82% match');

  await page.locator('#searchPlayersBtn').click();
  await expect(page.locator('[data-online-section="search"]')).toBeVisible();
  await page.locator('#onlineNicknameSearch').fill('Jjinee');
  await page.locator('#onlineNicknameSearchBtn').click();
  await expect(page.locator('#searchPlayerResults')).toBeVisible();
  await expect(page.locator('#searchPlayerResults')).toContainText('Jjineeland');

  await page.locator('#autoMatchBtn').click();
  await expect(page.locator('#autoMatchCandidateAccept')).toBeVisible();
  await expect(page.locator('body')).toContainText('Jjineeland');
  await page.locator('#autoMatchCandidateCancel').click();
  await expect(page.locator('#autoMatchCandidateAccept')).toBeHidden();
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('Friends Search sends a Friend Request and shows the confirmation dialog',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#friendsMenuBtn').click();
  await expect(page.locator('#socialScreen')).toBeVisible();
  await page.locator('[data-social-tab="search"]').click();
  await page.locator('#socialSearchInput').fill('Jjinee');
  await page.locator('#socialSearchBtn').click();
  await expect(page.locator('#socialList')).toContainText('Jjineeland');
  await page.locator('#socialList [data-social-action="add"]').click();
  await expect(page.getByRole('heading',{name:'Friend Request Sent'})).toBeVisible();
  await expect(page.locator('#friendRequestSentText')).toContainText('Jjineeland');
  await page.locator('#friendRequestSentOk').click();
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('Log Out clears the signed-in identity and restores Create ID and Log In controls',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#accountLogoutBtn').click();
  await expect(page.locator('#accountCreateBtn')).toBeVisible();
  await expect(page.locator('#accountLoginBtn')).toBeVisible();
  await expect(page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]')).toHaveCount(0);
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('logout then login restores the authenticated Player HUD through the real login form',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#accountLogoutBtn').click();
  await page.locator('#accountLoginBtn').click();
  await expect(page.locator('#accountDialog')).toHaveJSProperty('open',true);
  await page.locator('#loginForm input[name="email"]').fill('jong@example.com');
  await page.locator('#loginForm input[name="password"]').fill('UsefulPass9');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#accountDialog')).toHaveJSProperty('open',false);
  await expect(page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]')).toContainText('Jong');
  await expect(page.locator('#accountMenuIdentity')).toContainText('2021');
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('Settings language menu changes the main menu locale and remains usable',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#accountSettingsBtn').click();
  await page.locator('#languageBtn').click();
  await expect(page.locator('#languageMenu')).toBeVisible();
  const korean=page.locator('#languageMenu button').filter({hasText:/한국/}).first();
  await expect(korean).toBeVisible();
  await korean.click();
  await expect(page.locator('#languageMenu')).toBeHidden();
  await page.locator('#settingsOk').click();
  await page.locator('#friendlyGamingBtn').click();
  await expect(page.locator('#trainingModeBtn')).not.toHaveText('Training Mode');
  await expect(page.locator('#settingsDialog')).toHaveJSProperty('open',false);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('Friendly Create Room produces a shareable guest link with referral token before any signup requirement',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#friendlyGamingBtn').click();
  await page.locator('#freeFriendBtn').click();
  await page.locator('#freeCreateRoomBtn').click();
  await expect(page.locator('#freeShareLinkBox')).toBeVisible({timeout:8000});
  const href=await page.locator('#freeShareLink').getAttribute('href');
  expect(href).toContain('room=ABCDEFGHJK2345');
  expect(href).toContain('mode=free');
  expect(href).toContain('ref=');
  await expect(page.locator('#freeOnlineStatus')).toContainText(/Waiting|waiting/i);
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('signed-in player outside Top 10 is appended as highlighted row 11 with the real rank',async({page})=>{
  const top=Array.from({length:10},(_,index)=>({
    accountId:'top-'+(index+1),nickname:'Top'+(index+1),countryCode:'US',rank:index+1,
    score:20-index,totalCoins:1000-index*10,gamesPlayed:30-index,wins:20-index,losses:10,walletCoins:500
  }));
  const selfOutside={accountId:'acct-self',nickname:'Jong',countryCode:'US',rank:42,score:1.2,totalCoins:445,gamesPlayed:39,wins:20,losses:19,walletCoins:2021};
  const errors=await openMenu(page,{boards:{global:[...top,selfOutside],monthly:[...top,selfOutside]}});
  await page.locator('#leaderboardMenuBtn').click();
  await expect(page.locator('#leaderboardBody tr')).toHaveCount(11);
  const own=page.locator('#leaderboardBody tr').last();
  await expect(own).toHaveClass(/leaderboard-current-player/);
  await expect(own).toHaveClass(/leaderboard-current-outside-top/);
  await expect(own.locator('td').first()).toContainText('42');
  await expect(own).toContainText('Jong');
  await page.locator('#monthlyLeaderboardTab').click();
  await expect(page.locator('#leaderboardBody tr')).toHaveCount(11);
  await expect(page.locator('#leaderboardBody tr').last()).toContainText('42');
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('removing a Friend uses the in-app confirmation and No leaves the friend intact',async({page})=>{
  const snapshot={ok:true,friends:[{...otherPlayer,friendState:'friend'}],incoming:[],outgoing:[],history:[],recommendations:[]};
  const errors=await openMenu(page,{socialSnapshot:snapshot});
  await page.locator('#friendsMenuBtn').click();
  await expect(page.locator('#socialList')).toContainText('Jjineeland');
  await page.locator('#socialList [data-social-action="unfriend"]').click();
  await expect(page.getByRole('heading',{name:'Remove Friend?'})).toBeVisible();
  await expect(page.locator('#unfriendConfirmText')).toContainText('Jjineeland');
  await page.locator('#unfriendConfirmNo').click();
  await expect(page.getByRole('heading',{name:'Remove Friend?'})).toBeHidden();
  await expect(page.locator('#socialList')).toContainText('Jjineeland');
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('Player Info network failure shows friendly app copy instead of a raw browser error',async({page})=>{
  const errors=await openMenu(page,{profileFailure:true});
  await page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]').click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',true);
  await expect(page.locator('#playerInfoBody')).toContainText('The request could not be completed.');
  await expect(page.locator('#playerInfoBody')).not.toContainText(/Failed to fetch|NetworkError|Load failed/i);
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('Friendly Solo Play launches a real local game without account or matchmaking UI',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#friendlyGamingBtn').click();
  await page.locator('#playSoloBtn').click();
  await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:12000});
  await expect(page.locator('#table')).toBeVisible();
  await expect(page.locator('#onlineLobbyPanel')).toBeHidden();
  await expect(page.locator('#freeFriendPanel')).toBeHidden();
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('Create ID browser flow requires Connection Protection acknowledgement before registration and reaches success UI',async({page})=>{
  const errors=await openMenu(page);
  await page.locator('#accountLogoutBtn').click();
  await page.locator('#accountCreateBtn').click();
  await expect(page.locator('#accountDialog')).toHaveJSProperty('open',true);
  await expect(page.locator('#registerForm')).toBeVisible();
  await page.locator('#registerForm input[name="email"]').fill('new@example.com');
  await page.locator('#registerForm input[name="nickname"]').fill('NewPlayer');
  await page.locator('#registerForm input[name="password"]').fill('StrongPass9');
  await page.locator('#registerForm input[name="confirmPassword"]').fill('StrongPass9');
  const registerRequest=page.waitForRequest(request=>request.url().includes('/api/auth/register')&&request.method()==='POST');
  await page.locator('#registerForm button[type="submit"]').click();
  await expect(page.locator('#registrationPolicyTitle')).toHaveText('Connection Protection');
  await expect(page.locator('#registrationPolicyDialog')).toHaveJSProperty('open',true);
  let resolved=false;registerRequest.then(()=>{resolved=true;});
  await page.waitForTimeout(150);
  expect(resolved).toBe(false);
  await page.locator('#registrationPolicyOk').click();
  await registerRequest;
  await expect(page.getByRole('heading',{name:'Account Registered Successfully'})).toBeVisible();
  await page.locator('#registrationOk').click();
  await expect(page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]')).toContainText('Jong');
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('Player Info dismisses by OK and by clicking the dialog backdrop after a successful self-profile load',async({page})=>{
  const errors=await openMenu(page);
  const trigger=page.locator('#accountMenuIdentity [data-player-info-account-id="acct-self"]');
  await trigger.click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',true);
  await page.locator('#playerInfoOk').click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',false);
  await trigger.click();
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',true);
  await page.locator('.player-info-dialog').click({position:{x:3,y:3}});
  await expect(page.locator('.player-info-dialog')).toHaveJSProperty('open',false);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('every Friends tab is reachable and can return without stale overlays or browser errors',async({page})=>{
  const snapshot={ok:true,friends:[{...otherPlayer,friendState:'friend'}],incoming:[],outgoing:[],history:[otherPlayer],recommendations:[otherPlayer]};
  const errors=await openMenu(page,{socialSnapshot:snapshot});
  await page.locator('#friendsMenuBtn').click();
  for(const tab of ['friends','requests','history','recommendations','search']){
    await page.locator(`[data-social-tab="${tab}"]`).click();
    await expect(page.locator(`[data-social-tab="${tab}"]`)).toHaveClass(/active/);
    await expect(page.locator('#socialScreen')).toBeVisible();
  }
  await page.locator('#socialCloseTop').click();
  await expect(page.locator('#socialScreen')).toBeHidden();
  await expect(page.locator('.gostop-main-menu')).toBeVisible();
  expect(errors.map(error=>error.message)).toEqual([]);
});


test('blocked Notifications uses the in-app recovery flow and never silently fails',async({page})=>{
  const errors=await openMenu(page,{notificationPermission:'denied'});
  await page.locator('#accountSettingsBtn').click();
  await expect(page.locator('#settingsDialog')).toHaveJSProperty('open',true);
  const button=page.locator('#enablePlayNotificationsBtn');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('#notificationBlockedDialog')).toHaveJSProperty('open',true);
  await expect(page.locator('#notificationBlockedTitle')).toContainText(/Notifications/i);
  await expect(page.locator('#notificationBlockedRetry')).toBeDisabled();
  await page.locator('#notificationBlockedReady').check();
  await expect(page.locator('#notificationBlockedRetry')).toBeEnabled();
  await page.locator('#notificationBlockedRetry').click();
  await expect(page.locator('#notificationBlockedStatus')).not.toHaveText('');
  await expect(page.locator('#notificationBlockedReady')).not.toBeChecked();
  await page.locator('#notificationBlockedCancel').click();
  await expect(page.locator('#notificationBlockedDialog')).toHaveJSProperty('open',false);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('all static HTML and CSS asset references resolve to real repository files',async()=>{
  const fs=await import('node:fs');
  const path=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const candidates=['index.html','admin.html','styles.css','admin.css','mobile-fullscreen.css'];
  const missing=[];
  for(const relative of candidates){
    const source=fs.readFileSync(path.join(root,relative),'utf8');
    const refs=[
      ...[...source.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)].map(match=>match[1]),
      ...[...source.matchAll(/url\(["']?([^"')?#]+)(?:\?[^"')]*)?["']?\)/g)].map(match=>match[1])
    ];
    for(const raw of refs){
      if(!raw||/^(?:https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(raw))continue;
      const clean=raw.replace(/^\//,'');
      if(!fs.existsSync(path.join(root,clean)))missing.push(`${relative} -> ${raw}`);
    }
  }
  expect(missing).toEqual([]);
});
