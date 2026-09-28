import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const engine=require('../../game-engine.js');
const {createSessionAuthority}=require('../../session-authority.js');

async function enterSplash(page){
  if(await page.evaluate(()=>navigator.maxTouchPoints>0&&innerWidth<=1000)){
    await expect(page.locator('#gostopBootSplash.gostop-boot-ready')).toBeVisible();
    const p=await center(page.locator('#gostopBootSplash'));
    await page.touchscreen.tap(p.x,p.y);
  }
}

// The browser runs the unmodified production scripts. Only HTTP/WebSocket transport
// is replaced; every card action is validated/resolved by the real authority.
async function openGame(page,{seat='playerA',matches=1,mode='solo',delay=0}={}){
  const playerId=seat==='playerA'?'alice':'bob';
  const service=createSessionAuthority({crypto:webcrypto,trustedRuntime:true});
  service.createMatch({matchId:'input-regression',playerIds:['alice','bob'],startingPlayerId:playerId});
  const record=service.exportMatch('input-regression'),state=record.state;
  const card=id=>structuredClone(engine.masterDeck.find(card=>card.id===id));
  const hand=['m1-1','m3-1','m5-1','m7-1','m9-1'].map(card);
  const floor=(matches===2?['m1-2','m1-3','m4-1']:matches===1?['m1-2','m4-1']:['m4-1']).map(card);
  const used=new Set([...hand,...floor].map(card=>card.id));
  const rest=engine.masterDeck.filter(card=>!used.has(card.id)).map(card=>structuredClone(card));
  const side=seat==='playerA'?'human':'ai',other=seat==='playerA'?'ai':'human';
  state[side].hand=hand;state[other].hand=rest.splice(0,5);
  for(const player of [state.human,state.ai])Object.assign(player,{hiddenTripleMonths:[],armedBombMonths:[],captured:[]});
  state.floor=floor;state.deck=rest;state.floorStacks={};
  state.floorSlotByCard=Object.fromEntries(floor.map((card,index)=>[card.id,index]));
  state.turn=seat;state.startingPlayerId=seat;state.openingResolved=true;state.openingSpecialsComplete=true;
  state.pendingTurn=null;state.pendingDecision=null;
  // Draw a non-matching card so this fixture exercises an ordinary complete turn.
  const drawIndex=state.deck.findIndex(card=>card.month===12);
  state.deck.unshift(...state.deck.splice(drawIndex,1));
  const authority=createSessionAuthority({crypto:webcrypto,trustedRuntime:true});
  authority.restoreMatch(record);
  const room={roomCode:'ABCDEFGHJK2345',credential:'browser-test-only',playerId,seatId:seat,rankedMode:mode,ranked:true,matchId:record.id,status:'ready'};
  const account={id:'input-tester',nickname:'Input Tester',walletCoins:200,emailVerified:true,stats:{global:{gamesPlayed:12,wins:6}},activeRanked:null};
  const actions=[],errors=[],rejections=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error('Game runtime:',error.message);});
  await page.addInitScript(account=>{
    localStorage.setItem('gostop-auth-token','input-test-token');
    localStorage.setItem('gostop-account-cache',JSON.stringify(account));
  },account);
  await page.route('https://commons.wikimedia.org/**',route=>route.abort());
  await page.route('**/api/**',route=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const path=new URL(route.request().url()).pathname;
    let body={ok:true};
    if(path==='/api/me')body={ok:true,account,notices:[]};
    else if(path==='/api/leaderboards')body={ok:true,global:[],monthly:[]};
    else if(path==='/api/solo'||path.includes('/rooms/'))body={ok:true,room};
    else if(path==='/api/social')body={ok:true,friends:[],incoming:[],outgoing:[],history:[],recommendations:[]};
    return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(body)});
  });
  const snapshot=()=>({...authority.getSnapshot({matchId:record.id,viewerId:playerId}),ranked:true,rankedMode:mode,roomCode:room.roomCode,sessionFlow:{replayReady:{you:false,opponent:false},ended:false}});
  await page.routeWebSocket('**/api/lobby/**',socket=>socket.onMessage(()=>{}));
  let roomSocket;
  await page.routeWebSocket('**/api/rooms/**/ws',socket=>{
    roomSocket=socket;
    const send=(type,data)=>socket.send(JSON.stringify({protocolVersion:1,type,...data}));
    send('snapshot',{snapshot:snapshot(),events:[]});
    socket.onMessage(async raw=>{
      const message=JSON.parse(raw);
      if(message.type==='syncRequest'){send('snapshot',{snapshot:snapshot(),events:[]});return;}
      if(message.type!=='action')return;
      actions.push(message.action);
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      try{
        const result=authority.submitAction({...message,matchId:record.id,playerId});
        send('snapshot',{snapshot:snapshot(),events:result.events});
        send('actionAccepted',{actionId:message.actionId,revision:result.revision});
      }catch(error){rejections.push(error.message);send('actionRejected',{actionId:message.actionId,error:{code:error.code,message:error.message}});}
    });
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await enterSplash(page);
  await page.locator('#competitiveGamingBtn').click();
  await page.locator('#rankedSoloBtn').click();
  await expect(page.locator('#soloStartOverlay')).toBeHidden();
  await expect(page.locator('#openingOverlay')).toBeHidden({timeout:12000});
  await expect(page.locator('#playerHand [data-card-id="m1-1"]')).toBeEnabled();
  return {actions,errors,rejections,snapshot,authority,side,roomSocket};
}

const played=page=>page.locator('#playerHand [data-card-id="m1-1"]');
async function assertPlayed(page,game){
  await expect.poll(()=>game.actions.filter(action=>action.type==='playCard')).toHaveLength(1);
  await expect(played(page)).toHaveCount(0);
  await expect.poll(()=>game.snapshot().state.turn).toBe(game.side==='human'?'playerB':'playerA');
  expect(game.errors).toEqual([]);
  expect(game.rejections).toEqual([]);
}

async function center(card){
  // Floor cards pulse and may be replaced by an image/resize render. Read the
  // live hit rectangle without requiring an animated target to become still.
  let box;
  await expect.poll(async()=>{box=await card.boundingBox();return !!box;}).toBe(true);
  return {x:box.x+box.width/2,y:box.y+box.height/2};
}

async function touchDrag(page,points,{duration=100,cancel=false}={}){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
  for(const point of points.slice(1)){
    await new Promise(resolve=>setTimeout(resolve,duration/(points.length-1)));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});
  }
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  await cdp.detach();
}

test('Competitive Solo desktop click reaches the authority and completes the turn',async({page})=>{
  const game=await openGame(page);
  await played(page).click();
  await assertPlayed(page,game);
});

test('desktop double-click submits once despite delayed authority response',async({page})=>{
  const game=await openGame(page,{delay:180});
  await played(page).dblclick();
  await assertPlayed(page,game);
});

test('server acknowledgement during the slap cannot reopen the previous playable hand',async({page})=>{
  const game=await openGame(page);
  await played(page).click();
  await expect.poll(()=>game.actions.length).toBe(1);
  const next=await center(page.locator('#playerHand [data-card-id="m3-1"]'));
  await page.mouse.click(next.x,next.y);
  await assertPlayed(page,game);
});

test('desktop upward mouse flick commits and a slow drag never commits',async({page})=>{
  const game=await openGame(page);
  let point=await center(played(page));
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.mouse.move(point.x,point.y-24,{steps:3});
  await page.waitForTimeout(650);
  await page.mouse.up();
  expect(game.actions).toEqual([]);
  point=await center(played(page));
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.mouse.move(point.x,point.y-75,{steps:5});await page.mouse.up();
  await assertPlayed(page,game);
});

test('keyboard Enter plays a card for the second online player with no floor match',async({page})=>{
  const game=await openGame(page,{seat:'playerB',mode:'online',matches:0});
  await played(page).press('Enter');
  await assertPlayed(page,game);
});

test('two matching floor cards remain uncommitted, cancelable, and selectable',async({page})=>{
  const game=await openGame(page,{matches:2});
  await played(page).click();
  await expect(page.locator('#floor .target-option')).toHaveCount(2);
  expect(game.actions).toEqual([]);
  await page.locator('#deckStack').click();
  await expect(page.locator('#floor .target-option')).toHaveCount(0);
  expect(game.actions).toEqual([]);
  await played(page).click();
  const target=await center(page.locator('#floor [data-card-id="m1-3"]'));
  await page.mouse.click(target.x,target.y);
  await assertPlayed(page,game);
  expect(game.actions[0]).toEqual({type:'playCard',cardId:'m1-1',targetId:'m1-3'});
});

for(const profile of [
  {name:'A17-sized Android with CPU throttling',viewport:{width:384,height:832},rate:4},
  {name:'S22 Ultra-sized Android',viewport:{width:412,height:915},rate:1},
  {name:'phone landscape',viewport:{width:915,height:412},rate:1}
]){
  test.describe(profile.name,()=>{
    test.use({viewport:profile.viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
    test.beforeEach(async({page})=>{
      if(profile.rate>1){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.rate});}
    });
    test('first tap selects, second tap plays exactly once through the authority',async({page})=>{
      const game=await openGame(page,{delay:120});
      await played(page).tap();
      expect(game.actions).toEqual([]);
      await expect(played(page).locator('..')).toHaveClass(/is-hovered/);
      // A no-event server refresh between taps must not lose selected card identity.
      game.roomSocket.send(JSON.stringify({type:'snapshot',protocolVersion:1,snapshot:game.snapshot(),events:[]}));
      await played(page).tap();
      await assertPlayed(page,game);
    });
    test('native upward flick plays, horizontal browse and slow drag do not',async({page})=>{
      const game=await openGame(page);
      let p=await center(played(page));
      await touchDrag(page,[p,{x:p.x+70,y:p.y}]);
      expect(game.actions).toEqual([]);
      p=await center(played(page));
      await touchDrag(page,[p,{x:p.x,y:p.y-45}],{duration:700});
      expect(game.actions).toEqual([]);
      p=await center(played(page));
      await touchDrag(page,[p,{x:p.x+2,y:p.y-30},{x:p.x+3,y:p.y-75}]);
      await assertPlayed(page,game);
    });
    test('touch cancel is safe and two floor targets can then be chosen by tap',async({page})=>{
      const game=await openGame(page,{matches:2});
      const p=await center(played(page));
      await touchDrag(page,[p,{x:p.x,y:p.y-30}],{cancel:true});
      expect(game.actions).toEqual([]);
      await played(page).tap();await played(page).tap();
      await expect(page.locator('#floor .target-option')).toHaveCount(2);
      expect(game.actions).toEqual([]);
      const target=await center(page.locator('#floor [data-card-id="m1-2"]'));
      await page.touchscreen.tap(target.x,target.y);
      await assertPlayed(page,game);
    });
  });
}

test.describe('touchscreen PC with mouse and keyboard',()=>{
  test.use({hasTouch:true,isMobile:false});
  test('a mouse click still plays immediately on a touch-capable PC',async({page})=>{
    const game=await openGame(page);
    await played(page).click();
    await assertPlayed(page,game);
  });
});

for(const mobile of [false,true]){
  test.describe(mobile?'Friendly mobile':'Friendly desktop',()=>{
    test.use({viewport:mobile?{width:412,height:915}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
    test('local Solo retains actual card play and AI turn completion',async({page})=>{
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      // Fixed secure-RNG substitute only in the test browser, to avoid random
      // opening declarations/terminal hands obscuring the input regression.
      await page.addInitScript(()=>{
        let seed=0x6d2b79f5;
        crypto.getRandomValues=array=>{for(let i=0;i<array.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;array[i]=seed>>>0;}return array;};
      });
      await page.route('https://commons.wikimedia.org/**',route=>route.abort());
      await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,global:[],monthly:[]})}));
      await page.goto('/',{waitUntil:'domcontentloaded'});
      await enterSplash(page);
      await page.locator('#friendlyGamingBtn').click();
      await page.locator('#playSoloBtn').click();
      await expect(page.locator('#openingOverlay')).toBeHidden({timeout:12000});
      await expect(page.locator('#playerHand .hand-card:enabled').first()).toBeVisible({timeout:15000});
      const id=await page.locator('#playerHand .hand-card').evaluateAll(cards=>{
        const floors=[...document.querySelectorAll('#floor [data-month]')];
        return cards.find(card=>cards.filter(other=>other.dataset.month===card.dataset.month).length<3&&floors.filter(other=>other.dataset.month===card.dataset.month).length<2)?.dataset.cardId;
      });
      expect(id).toBeTruthy();
      const card=page.locator(`#playerHand [data-card-id="${id}"]`);
      if(mobile){await card.tap();await card.tap();}else await card.click();
      await expect(card).toHaveCount(0,{timeout:12000});
      await expect(page.locator('#playerHand .hand-card:enabled')).toHaveCount(9,{timeout:15000});
      expect(errors).toEqual([]);
    });
  });
}
