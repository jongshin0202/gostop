import {test,expect} from '@playwright/test';

const account={id:'competitive-lifecycle-tester',nickname:'SonGoku',walletCoins:700,
 emailVerified:true,stats:{global:{gamesPlayed:15,wins:9}},activeRanked:null};
async function setup(page){
 const errors=[],fromClient=[],sockets=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(a=>{
  localStorage.setItem('gostop-auth-token','competitive-test-auth-token');
  localStorage.setItem('gostop-account-cache',JSON.stringify(a));
 },account);
 await page.route('https://commons.wikimedia.org/**',r=>r.abort());
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS',
   'access-control-allow-headers':'content-type,authorization'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  const data=path==='/api/me'?{ok:true,account,notices:[]}:
   path==='/api/leaderboards'?{ok:true,global:[],monthly:[]}:
   path==='/api/social'?{ok:true,friends:[],incoming:[],outgoing:[],history:[],recommendations:[]}:{ok:true};
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.routeWebSocket('**/api/lobby/**',socket=>{
  sockets.push(socket);
  socket.onMessage(raw=>{
   try{fromClient.push(JSON.parse(raw));}catch(_){}
  });
 });
 await page.goto('/dev-site/dist/',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>fromClient.filter(m=>m.type==='setAvailability').length,{timeout:15000}).toBeGreaterThan(0);
 const send=message=>sockets.at(-1).send(JSON.stringify(message));
 return {send,fromClient,errors};
}
test('active Competitive Online match cannot receive an incoming or missed game-request dialog',async({page})=>{
 const h=await setup(page);
 await page.evaluate(()=>{
  globalThis.goStopOnlineSession={
   room:{roomCode:'ABCDEFGHJK2345',rankedMode:'online',seatId:'playerA'},
   explicitlyClosed:false
  };
 });
 h.send({type:'playRequest',requestId:'req-during-live-game',from:{accountId:'friend-phone-1',nickname:'GoStopper'}});
 await expect.poll(()=>h.fromClient.some(m=>m.type==='challengeResponse'&&
  m.requestId==='req-during-live-game'&&m.accept===false)).toBe(true);
 const incoming=page.locator('#requestAccept').locator('xpath=ancestor::dialog[1]');
 await expect(incoming).not.toHaveAttribute('open');
 h.send({type:'challengeMissed',requestId:'req-during-live-game',
  createdAt:Date.now(),from:{accountId:'friend-phone-1',nickname:'GoStopper'}});
 const missed=page.locator('#missedRequestOk').locator('xpath=ancestor::dialog[1]');
 await expect(missed).not.toHaveAttribute('open');
 expect(h.errors).toEqual([]);
});
test('pending outgoing Auto Match Play request dismisses locally after deadline even if lobby never sends timeout',async({page})=>{
 const h=await setup(page);
 h.send({type:'challengeSent',requestId:'req-timeout-no-event',automatic:true,
  expiresInSeconds:0.1,to:{accountId:'offline-friend-1',nickname:'GoStopper'}});
 const outgoing=page.locator('#cancelOutgoingRequest').locator('xpath=ancestor::dialog[1]');
 await expect(outgoing).toHaveAttribute('open',{timeout:5000});
 await expect(outgoing).not.toHaveAttribute('open',{timeout:6000});
 await expect.poll(()=>h.fromClient.some(m=>m.type==='challengeCancel'&&
   m.requestId==='req-timeout-no-event'),{timeout:6000}).toBe(true);
 expect(h.errors).toEqual([]);
});
