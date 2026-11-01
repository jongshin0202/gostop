import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const engine=require('../../game-engine.js');
const {createSessionAuthority}=require('../../session-authority.js');

const account={id:'same-account-test',nickname:'Jong',emailVerified:true,
 walletCoins:500,stats:{global:{gamesPlayed:3,wins:1}},activeRanked:null};
const room={roomCode:'ABCDEFGHJK2345',credential:'dev-peer-test-credential',
 playerId:'alice',seatId:'playerA',rankedMode:'solo',ranked:true,
 matchId:'dev-peer-gukjin',status:'ready'};
function setupAuthority(){
 const authority=createSessionAuthority({crypto:webcrypto,trustedRuntime:true});
 authority.createMatch({matchId:room.matchId,playerIds:['alice','computer'],startingPlayerId:'alice'});
 const record=authority.exportMatch(room.matchId),state=record.state;
 const card=id=>structuredClone(engine.masterDeck.find(c=>c.id===id));
 const floor=['m1-2','m9-2','m9-3'].map(card);
 const played=card('m1-1'),drawn=card('m9-1');
 const human=['m3-1','m5-1','m7-1'].map(card);
 const used=new Set([...floor,played,drawn,...human].map(c=>c.id));
 const remaining=engine.masterDeck.filter(c=>!used.has(c.id)).map(c=>structuredClone(c));
 const computer=remaining.splice(0,5);
 state.human.hand=human;state.ai.hand=computer;
 state.human.captured=[];state.ai.captured=[];
 for(const p of [state.human,state.ai]){
  p.hiddenTripleMonths=[];p.armedBombMonths=[];p.gukjinMode='animal';
 }
 state.floor=floor;state.floorStacks={};
 state.floorSlotByCard=Object.fromEntries(floor.map((c,i)=>[c.id,i]));
 state.deck=remaining;state.turn='playerA';state.startingPlayerId='playerA';
 state.openingResolved=true;state.openingSpecialsComplete=true;
 state.pendingDecision=null;
 state.pendingTurn={
  phase:'awaitingFloorTarget',actorId:'playerA',nextResolution:null,
  played:{card:played,matchIds:['m1-2'],targetId:'m1-2',landingSlot:null,resolved:false},
  drawn:{card:drawn,matchIds:['m9-2','m9-3'],targetId:null,landingSlot:null,resolved:false}
 };
 authority.restoreMatch(record);
 return authority;
}
async function prepare(page,{phone=false,connect,errors}={}){
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(a=>{
  localStorage.setItem('gostop-auth-token','peer-test-token');
  localStorage.setItem('gostop-account-cache',JSON.stringify(a));
 },account);
 await page.route('https://commons.wikimedia.org/**',route=>route.abort());
 await page.route('**/api/**',route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type,authorization'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let payload={ok:true};
  if(path==='/api/me')payload={ok:true,account,notices:[]};
  else if(path==='/api/leaderboards')payload={ok:true,global:[],monthly:[]};
  else if(path==='/api/solo'||path.includes('/rooms/'))payload={ok:true,room};
  else if(path==='/api/social')payload={ok:true,friends:[],incoming:[],outgoing:[],history:[],recommendations:[]};
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.routeWebSocket('**/api/lobby/**',socket=>socket.onMessage(()=>{}));
 await page.routeWebSocket('**/api/rooms/**/ws',connect);
 await page.goto('/dev-site/dist/',{waitUntil:'domcontentloaded'});
 if(phone&&await page.locator('#gostopBootSplash.gostop-boot-ready').isVisible().catch(()=>false)){
  await page.locator('#gostopBootSplash').tap();
 }
 await page.locator('#competitiveGamingBtn').click();
 await page.locator('#rankedSoloBtn').click();
 await expect(page.locator('#soloStartOverlay')).toBeHidden({timeout:20000});
}
test('two same-account screens accept phone floor choice and Sake Cup Single exactly once',async({browser})=>{
 test.setTimeout(90000);
 const authority=setupAuthority(),sockets=new Set(),actions=[],rejections=[],errors=[];
 const snap=()=>({...authority.getSnapshot({matchId:room.matchId,viewerId:'alice'}),
  ranked:true,rankedMode:'solo',roomCode:room.roomCode,
  sessionFlow:{replayReady:{you:false,opponent:false},ended:false}});
 const send=(socket,type,data)=>socket.send(JSON.stringify({protocolVersion:1,type,...data}));
 const connect=socket=>{
  sockets.add(socket);
  send(socket,'connected',{...room,protocolVersion:1});
  send(socket,'snapshot',{snapshot:snap(),events:[]});
  socket.onClose(()=>sockets.delete(socket));
  socket.onMessage(async raw=>{
   const message=JSON.parse(raw);
   if(message.type==='syncRequest'){send(socket,'snapshot',{snapshot:snap(),events:[]});return;}
   if(message.type!=='action')return;
   actions.push(message.action);
   try{
    const result=authority.submitAction({...message,matchId:room.matchId,playerId:'alice'});
    for(const peer of sockets)send(peer,'snapshot',{snapshot:snap(),events:result.events});
    send(socket,'actionAccepted',{actionId:message.actionId,revision:result.revision});
   }catch(error){
    rejections.push(error.code||error.message);
    send(socket,'actionRejected',{actionId:message.actionId,
      error:{code:error.code||'ILLEGAL_ACTION',message:error.message}});
   }
  });
 };
 const pc=await browser.newContext({viewport:{width:1440,height:960}});
 const phone=await browser.newContext({viewport:{width:412,height:915},
  isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const pcPage=await pc.newPage(),phonePage=await phone.newPage();
 try{
  await prepare(pcPage,{connect,errors});
  await prepare(phonePage,{phone:true,connect,errors});
  await expect(pcPage.locator('#floor .target-option')).toHaveCount(2,{timeout:18000});
  await expect(phonePage.locator('#floor .target-option')).toHaveCount(2,{timeout:18000});
  // Phone selects the FIRST table card while the PC is still waiting.
  await phonePage.locator('#floor .target-option[data-card-id="m9-2"]').tap();
  await expect.poll(()=>actions.filter(x=>x.type==='chooseFloorTarget').length).toBe(1);
  expect(actions.filter(x=>x.type==='chooseFloorTarget')[0]).toMatchObject({
   source:'drawn',targetId:'m9-2'});
  // PC's old target-choice promise must resolve without submitting m9-3.
  await expect(pcPage.locator('#floor .target-option')).toHaveCount(0,{timeout:16000});
  // Both devices receive the actual capture and the Sake Cup mode choice.
  await expect(phonePage.locator('#gukjinDialog')).toBeVisible({timeout:20000});
  await expect(pcPage.locator('#gukjinDialog')).toBeVisible({timeout:20000});
  await phonePage.locator('#gukjinSingleBtn').tap();
  await expect.poll(()=>snap().state.human.gukjinMode).toBe('pi');
  await expect(pcPage.locator('#gukjinDialog')).toBeHidden({timeout:12000});
  // The PC cannot submit its stale Picture selection after phone chose Single.
  expect(actions.filter(x=>x.type==='chooseFloorTarget')).toHaveLength(1);
  expect(actions.filter(x=>x.type==='setGukjinMode')).toEqual([{type:'setGukjinMode',mode:'pi'}]);
  await pcPage.waitForTimeout(350);
  expect(snap().state.human.gukjinMode).toBe('pi');
  expect(errors).toEqual([]);
 }finally{await pc.close();await phone.close();}
});
