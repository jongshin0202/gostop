import {test,expect} from '@playwright/test';
const ROOM='ABCDEFGHJK2345';
const invitation=()=>'/dev-site/dist/?room='+ROOM+'&mode=free&ref='+('a'.repeat(64));
const account={id:'friend-invite-test',nickname:'Jong',walletCoins:100,
 emailVerified:true,stats:{global:{gamesPlayed:2,wins:1}},activeRanked:null};
async function harness(page,{guest=false}={}){
 const calls={join:0,joinCredentials:[],websockets:0,errors:[]};
 page.on('pageerror',error=>calls.errors.push(error.message));
 await page.route('https://commons.wikimedia.org/**',route=>route.abort());
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS',
   'access-control-allow-headers':'content-type,authorization'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  let data={ok:true};
  if(path==='/api/me')data=guest?{ok:false,error:{code:'AUTH_REQUIRED'}}:{ok:true,account,notices:[]};
  else if(path==='/api/leaderboards')data={ok:true,global:[],monthly:[]};
  else if(path==='/api/social')data={ok:true,friends:[],incoming:[],outgoing:[],history:[],recommendations:[]};
  else if(path.includes('/rooms/')&&path.endsWith('/join')){
   calls.join++;calls.joinCredentials.push(route.request().postDataJSON?.()?.credential||null);
   data={ok:true,room:{roomCode:ROOM,credential:'friend-invite-test',
    playerId:'guest',seatId:'playerB',rankedMode:'free',ranked:false,
    matchId:'friend-fixture',status:'ready'}};
  }
  return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(data)});
 });
 await page.routeWebSocket('**/api/lobby/**',socket=>socket.onMessage(()=>{}));
 await page.routeWebSocket('**/api/rooms/**/ws',socket=>{
  calls.websockets++;
  socket.onMessage(()=>{});
  setTimeout(()=>socket.send(JSON.stringify({
   protocolVersion:1,type:'connected',roomCode:ROOM,status:'ready',
   matchId:'friend-fixture',playerId:'guest',seatId:'playerB'
  })),40);
 });
 return calls;
}

test('PC Share Invite opens a visible link and email dialog, with reliable copy',async({page})=>{
 const calls=await harness(page);
 await page.addInitScript(()=>{
  window.__copiedInvite=null;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
   writeText:async value=>{window.__copiedInvite=value;}
  }});
 });
 await page.goto('/dev-site/dist/',{waitUntil:'domcontentloaded'});
 await page.locator('#friendlyGamingBtn').click();
 await page.locator('#freeFriendBtn').click();
 await expect(page.locator('#freeFriendPanel')).toBeVisible();
 await page.evaluate(()=>{
  const url=new URL(location.href);
  url.search='?room=ABCDEFGHJK2345&mode=free';url.hash='';
  const link=document.getElementById('freeShareLink');
  link.href=url.href;link.textContent=url.href;
  document.getElementById('freeShareLinkBox').hidden=false;
 });
 await page.locator('#freeShareBtn').click();
 const dialog=page.locator('#devFriendShareDialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('input')).toHaveValue(/room=ABCDEFGHJK2345&mode=free/);
 await expect(dialog.locator('a[href^="mailto:"]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'Copy Link'}).click();
 await expect(dialog.locator('[role="status"]')).toContainText('Link copied');
 expect(await page.evaluate(()=>window.__copiedInvite)).toContain('room=ABCDEFGHJK2345');
 await dialog.getByRole('button',{name:'Close'}).click();
 await expect(dialog).toBeHidden();
 expect(calls.errors).toEqual([]);
});
test('Samsung invitation waits for a real tap, requests fullscreen, then joins room',async({browser})=>{
 const context=await browser.newContext({viewport:{width:412,height:915},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 const page=await context.newPage();
 try{
  await page.addInitScript(()=>{
   let active=null;
   window.__inviteFullscreenCalls=0;
   Object.defineProperty(Document.prototype,'fullscreenElement',{configurable:true,get(){return active;}});
   Object.defineProperty(Document.prototype,'fullscreenEnabled',{configurable:true,get(){return true;}});
   Element.prototype.requestFullscreen=function(){
    window.__inviteFullscreenCalls++;
    active=this;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();
   };
  });
  const calls=await harness(page,{guest:true});
  await page.goto(invitation(),{waitUntil:'domcontentloaded'});
  const gate=page.locator('#devInviteFullscreenGate');
  await expect(gate).toBeVisible({timeout:10000});
  expect(calls.join).toBe(0,'invite must not join behind the fullscreen gate');
  await gate.getByRole('button',{name:'Enter Fullscreen & Join Game'}).tap();
  await expect(gate).toBeHidden({timeout:10000});
  await expect.poll(()=>calls.join).toBe(1);
  await expect.poll(()=>calls.websockets).toBe(1);
  await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:10000});
  expect(await page.evaluate(()=>window.__inviteFullscreenCalls)).toBe(1);
  expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  expect(calls.errors).toEqual([]);
 }finally{await context.close();}
});
test('returning Samsung invitation reuses the prior guest seat after background or tab reload',async({browser})=>{
 const context=await browser.newContext({viewport:{width:412,height:915},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 try{
  await page.addInitScript(room=>{
   const credential='room_'+('f'.repeat(64));
   sessionStorage.setItem('gostop-room-'+room,JSON.stringify({roomCode:room,credential,seatId:'playerB'}));
   let active=null;
   Object.defineProperty(Document.prototype,'fullscreenElement',{configurable:true,get(){return active;}});
   Object.defineProperty(Document.prototype,'fullscreenEnabled',{configurable:true,get(){return true;}});
   Element.prototype.requestFullscreen=function(){active=this;return Promise.resolve();};
  },ROOM);
  const calls=await harness(page,{guest:true});
  await page.goto(invitation(),{waitUntil:'domcontentloaded'});
  await expect(page.locator('#devInviteFullscreenGate')).toBeVisible({timeout:10000});
  await page.getByRole('button',{name:'Enter Fullscreen & Join Game'}).tap();
  await expect.poll(()=>calls.join).toBe(1);
  expect(calls.joinCredentials).toEqual(['room_'+('f'.repeat(64))]);
  await expect.poll(()=>calls.websockets).toBe(1);
  await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:10000});
  expect(calls.errors).toEqual([]);
 }finally{await context.close();}
});
test('blocked in-app browser explains fullscreen limitation, then allows manual continuation',async({browser})=>{
 const context=await browser.newContext({viewport:{width:412,height:915},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 try{
  await page.addInitScript(()=>{
   window.__inviteFullscreenCalls=0;
   Object.defineProperty(Document.prototype,'fullscreenEnabled',{configurable:true,get(){return true;}});
   Element.prototype.requestFullscreen=function(){
    window.__inviteFullscreenCalls++;
    return Promise.reject(new Error('Fullscreen prohibited in embedded browser'));
   };
  });
  const calls=await harness(page,{guest:true});
  await page.goto(invitation(),{waitUntil:'domcontentloaded'});
  const gate=page.locator('#devInviteFullscreenGate');
  await expect(gate).toBeVisible({timeout:10000});
  await gate.getByRole('button',{name:'Enter Fullscreen & Join Game'}).tap();
  await expect(gate).toContainText('open the link in Chrome');
  expect(calls.join).toBe(0);
  await gate.getByRole('button',{name:'Continue without fullscreen'}).tap();
  await expect(gate).toBeHidden();
  await expect.poll(()=>calls.join).toBe(1);
  await expect.poll(()=>calls.websockets).toBe(1);
  await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:10000});
  expect(await page.evaluate(()=>window.__inviteFullscreenCalls)).toBe(1);
  expect(calls.errors).toEqual([]);
 }finally{await context.close();}
});
test('desktop invitation bypasses mobile fullscreen gate and proceeds to friend room',async({page})=>{
 const calls=await harness(page,{guest:true});
 await page.goto(invitation(),{waitUntil:'domcontentloaded'});
 await expect.poll(()=>calls.join,{timeout:10000}).toBe(1);
 await expect.poll(()=>calls.websockets).toBe(1);
 await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:10000});
 await expect(page.locator('#devInviteFullscreenGate')).toHaveCount(0);
 expect(calls.errors).toEqual([]);
});
