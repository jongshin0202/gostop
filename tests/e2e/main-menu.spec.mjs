import {test,expect} from '@playwright/test';

const authority='https://gostop-authority.jwshin1.workers.dev';
const selfAccount={
  id:'acct-self',nickname:'Jong',countryCode:'US',walletCoins:2021,
  stats:{global:{gamesPlayed:39,wins:20}},activeRanked:null,
  incomingFriendRequestCount:0
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

async function installHarness(page){
  await page.addInitScript(account=>{
    localStorage.setItem('gostop-auth-token','e2e-token');
    localStorage.setItem('gostop-account-cache',JSON.stringify(account));
    class FakeWebSocket extends EventTarget{
      static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
      constructor(){super();this.readyState=FakeWebSocket.CONNECTING;setTimeout(()=>{this.readyState=FakeWebSocket.OPEN;this.dispatchEvent(new Event('open'));},0);}
      send(){}
      close(){if(this.readyState===FakeWebSocket.CLOSED)return;this.readyState=FakeWebSocket.CLOSED;this.dispatchEvent(new Event('close'));}
    }
    globalThis.WebSocket=FakeWebSocket;
  },selfAccount);

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
    else if(path==='/api/leaderboards')body={ok:true,month:'2026-09',global:globalRows,monthly:monthlyRows};
    else if(path==='/api/player-profile'){
      const posted=request.postDataJSON?.()||JSON.parse(request.postData()||'{}');
      body={ok:true,player:profileFor(posted.accountId)};
    }else if(path==='/api/social')body={ok:true,friends:[],incoming:[],outgoing:[],history:[],recommendations:[]};
    else if(path==='/api/social/search')body={ok:true,players:[]};
    else if(path==='/api/auth/logout')body={ok:true};
    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });
}

async function openMenu(page,{mobile=false}={}){
  if(mobile)await page.setViewportSize({width:390,height:844});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error));
  await installHarness(page);
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

  await page.locator('#freeFriendBtn').click();
  await expect(page.locator('#freeFriendPanel')).toBeVisible();
  await page.locator('#freeFriendClose').click();
  await expect(page.locator('#freeFriendPanel')).toBeHidden();

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
  await page.locator('.leaderboard-next').click();
  await expect(page.locator('#leaderboardHeading')).toHaveText('Monthly Leaderboard');
  await expect(page.locator('#leaderboardBody tr')).toHaveCount(10);
  expect(errors.map(error=>error.message)).toEqual([]);
});

test('mobile main menu remains usable and visibly keeps Hwatu decoration at narrow width',async({page})=>{
  const errors=await openMenu(page,{mobile:true});
  const title=await page.locator('.main-menu-title').boundingBox();
  expect(title).not.toBeNull();expect(title.y).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#rankedSoloBtn')).toBeVisible();
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

test('phone attract mode swipes Global to Monthly without exiting, while a normal tap returns to main menu',async({page})=>{
  const errors=await openMenu(page,{mobile:true});
  await expect(page.locator('.leaderboard-screen')).toBeVisible({timeout:13000});
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
