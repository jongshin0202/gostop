import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL=process.env.TUTORIAL_BASE_URL||'http://127.0.0.1:4173';
const OUT=path.resolve('build/tutorial');
await fs.mkdir(OUT,{recursive:true});

const selfAccount={
  id:'acct-self',nickname:'Jong',countryCode:'US',walletCoins:2021,
  stats:{global:{gamesPlayed:39,wins:20}},activeRanked:null,incomingFriendRequestCount:0
};
const otherPlayer={
  accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',walletCoins:1565,
  rank:12,globalRank:12,monthlyRank:7,score:82,gamesPlayed:52,wins:31,losses:21,
  online:true,status:'available',challengeable:true,similarity:82,friendState:'none',playedTogether:3,
  headToHead:{wins:2,losses:1,coinsWon:18,coinsLost:7,lastPlayedAt:'2026-10-03T20:00:00.000Z'}
};
const globalRows=[
  {accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',rank:1,score:41,totalCoins:1565,gamesPlayed:52,wins:31,losses:21,walletCoins:1565},
  {accountId:'acct-self',nickname:'Jong',countryCode:'US',rank:2,score:34,totalCoins:1425,gamesPlayed:39,wins:20,losses:19,walletCoins:2021},
  {accountId:'acct-three',nickname:'Sonogong',countryCode:'KR',rank:3,score:28,totalCoins:1325,gamesPlayed:44,wins:23,losses:21,walletCoins:1740}
];
const monthlyRows=[
  {accountId:'acct-self',nickname:'Jong',countryCode:'US',rank:1,score:19,totalCoins:318,gamesPlayed:13,wins:8,losses:5,walletCoins:2021},
  {accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',rank:2,score:17,totalCoins:287,gamesPlayed:12,wins:7,losses:5,walletCoins:1565},
  {accountId:'acct-three',nickname:'Sonogong',countryCode:'KR',rank:3,score:14,totalCoins:244,gamesPlayed:11,wins:6,losses:5,walletCoins:1740}
];

const segments=[
  {id:'welcome',duration:6,cues:[{at:0,text:'Welcome to GoStop Live!'}]},
  {id:'world',duration:12,cues:[
    {at:0,text:'GoStop Live! lets anyone around the world play GoStop together.'},
    {at:6,text:'Play with friends, the computer, or other players around the globe.'}
  ]},
  {id:'pc',duration:20,cues:[
    {at:0,text:'On PC or Mac, click a card once to select it.'},
    {at:7,text:'The card lifts out of your hand so you can see what is selected.'},
    {at:11,text:'Click the selected card again to play it onto the table.'},
    {at:16,text:'When a table choice is required, click the highlighted card you want.'}
  ]},
  {id:'mobile',duration:22,cues:[
    {at:0,text:'On mobile, tap a card once to select it.'},
    {at:6,text:'Tap the selected card again to play it.'},
    {at:12,text:'Or press the card and flick upward for a faster play.'},
    {at:18,text:'The card follows the upward gesture and plays onto the table.'}
  ]},
  {id:'info',duration:18,cues:[
    {at:0,text:'The game screen is interactive. Tap or click your player area for player information.'},
    {at:6,text:'Tap the score for a complete scoring breakdown.'},
    {at:11,text:'Tap your captured-card area to inspect captured cards and scoring groups.'},
    {at:15,text:'Game controls such as How to Play and Quit Game stay available on the screen.'}
  ]},
  {id:'modes',duration:24,cues:[
    {at:0,text:'Training Mode teaches you while you practice against the computer AI.'},
    {at:6,text:'Friendly Solo Play is casual play against AI with no Coins or ranking.'},
    {at:11,text:'Play With Friend creates a room link you can send to another person.'},
    {at:16,text:'Competitive Solo Play lets you play the computer for Coins and ranking.'},
    {at:20,text:'Competitive Online Play lets you compete with other GoStop Live! players.'}
  ]},
  {id:'social',duration:20,cues:[
    {at:0,text:'Auto Match recommends an available opponent and shows you who you are about to challenge.'},
    {at:7,text:'You can browse top players or search for a specific player.'},
    {at:12,text:'Send a Friend Request to connect with players you want to find again.'},
    {at:16,text:'Friends and recommendations make it easy to start another game together.'}
  ]},
  {id:'leaderboards',duration:25,cues:[
    {at:0,text:'The Leaderboards button opens the all-time Global Leaderboard.'},
    {at:7,text:'Swipe to see this month’s Global Leaderboard.'},
    {at:13,text:'Competitive wins and losses change your Coins and your global ranking.'},
    {at:18,text:'If you leave the Main Menu untouched, Attract Mode cycles through the leaderboards automatically.'}
  ]},
  {id:'goal',duration:10,cues:[
    {at:0,text:'The goal is simple: match card families, capture scoring cards, reach 7 points, then choose GO or STOP.'}
  ]},
  {id:'families',duration:18,cues:[
    {at:0,text:'Every family has exactly four cards.'},
    {at:5,text:'GoStop Live! uses twelve easy family names instead of month numbers.'},
    {at:10,text:'Pine, Plum, Cherry, Vine, Iris, Rose, Bush, Hill, Daisy, Star, Berry, and Willow.'}
  ]},
  {id:'types',duration:24,cues:[
    {at:0,text:'Cards score in four main types: Brights, Pictures, Stripes, and Singles.'},
    {at:6,text:'Stripes include Red, Blue, and Plain Stripe sets.'},
    {at:12,text:'Singles are the most common cards.'},
    {at:17,text:'Some special Single cards count as two Singles.'}
  ]},
  {id:'scoring',duration:38,cues:[
    {at:0,text:'Brights: three Brights with the Rain Bright score 2 points. Three non-Rain Brights score 3.'},
    {at:8,text:'Four Brights score 4 points, and all five Brights score 15 points.'},
    {at:14,text:'5-BIRDIES! scores 5 points. Any five Pictures score 1 point, then each extra Picture adds 1.'},
    {at:22,text:'Three Red, Blue, or Plain Stripes score 3 points. Any five Stripes score 1, then each extra Stripe adds 1.'},
    {at:30,text:'Ten Singles score 1 point, then each extra Single adds 1. 2x Single cards count as two.'}
  ]},
  {id:'matching',duration:28,cues:[
    {at:0,text:'A turn starts by playing one card from your hand.'},
    {at:6,text:'If the table has one card from the same family, your played card captures it.'},
    {at:12,text:'Then the draw pile flips one card.'},
    {at:17,text:'If the drawn card matches a table family, it captures that card too.'},
    {at:22,text:'If there is no match, the played or drawn card stays on the table.'}
  ]},
  {id:'gostop',duration:28,cues:[
    {at:0,text:'At 7 points in a two-player game, you choose GO or STOP.'},
    {at:6,text:'STOP ends the hand and you take the points you have now.'},
    {at:11,text:'GO keeps the game going. The first GO adds 1 point, and the second GO adds another point.'},
    {at:18,text:'From the third GO onward, the settlement doubles with each additional GO.'},
    {at:23,text:'If you lose after declaring GO, your opponent also receives the GO penalty multiplier.'}
  ]},
  {id:'specials',duration:38,cues:[
    {at:0,text:'SHAKE: reveal three cards from the same family. A normal Shake doubles your settlement if you win.'},
    {at:7,text:'BOMB: keep three same-family cards hidden. When the fourth is on the table, play all three, capture the family, and steal one Single.'},
    {at:15,text:'POOPED! is 뻑. Your play and the draw create a three-card family stack. Capturing it later steals one Single.'},
    {at:22,text:'KISS! is 쪽. Your played card has no match, then the draw gives the matching family. Capture the pair and steal one Single.'},
    {at:29,text:'FLUSH! is 따닥, and CLEAN SWEEP! is 싹쓸이. These special captures also steal one Single when available.'}
  ]},
  {id:'fullrules',duration:10,cues:[
    {at:0,text:'You do not need to memorize everything. Full Rules keeps the complete written reference one click away.'}
  ]},
  {id:'training',duration:18,cues:[
    {at:0,text:'Your best first game is Training Mode.'},
    {at:6,text:'Play against AI while GoStop Live! highlights a recommended card and table target.'},
    {at:12,text:'Training Mode explains why the move is recommended and teaches special rules as they happen.'}
  ]},
  {id:'fun',duration:7,cues:[{at:0,text:'Have fun playing GoStop Live!'}]}
];

let absolute=0;
const timeline=[];
for(const segment of segments){
  for(let i=0;i<segment.cues.length;i++){
    const cue=segment.cues[i];
    const next=segment.cues[i+1];
    timeline.push({
      start:absolute+cue.at,
      end:absolute+(next?next.at:segment.duration),
      text:cue.text,
      segment:segment.id
    });
  }
  absolute+=segment.duration;
}
await fs.writeFile(path.join(OUT,'captions.json'),JSON.stringify({duration:absolute,timeline,segments},null,2));

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runTimed(seconds,fn){
  const started=Date.now();
  await fn();
  const remain=seconds*1000-(Date.now()-started);
  if(remain>0)await sleep(remain);
}

async function installHarness(context){
  await context.addInitScript(({account,other})=>{
    localStorage.setItem('gostop-auth-token','tutorial-token');
    localStorage.setItem('gostop-account-cache',JSON.stringify(account));
    class FakeWebSocket extends EventTarget{
      static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
      constructor(){
        super();this.readyState=FakeWebSocket.CONNECTING;
        setTimeout(()=>{this.readyState=FakeWebSocket.OPEN;const event=new Event('open');this.dispatchEvent(event);this.onopen?.(event);},30);
      }
      emit(message){setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)})),120);}
      send(raw){
        let message={};try{message=JSON.parse(raw);}catch(_){return;}
        if(message.type==='recommendations')this.emit({type:'recommendations',players:[other],onlineCount:8});
        else if(message.type==='search')this.emit({type:'searchResults',players:[other],onlineCount:8,autoMatching:false});
        else if(message.type==='autoMatchStart')this.emit({type:'autoMatchCandidate',candidate:other});
        else if(message.type==='autoMatchCancel')this.emit({type:'autoMatchCancelled'});
        else if(message.type==='socialProfiles')this.emit({type:'socialProfiles',players:[other]});
      }
      close(){this.readyState=FakeWebSocket.CLOSED;}
    }
    globalThis.WebSocket=FakeWebSocket;
  },{account:selfAccount,other:otherPlayer});

  await context.route('https://gostop-authority.jwshin1.workers.dev/**',async route=>{
    const request=route.request(),url=new URL(request.url()),p=url.pathname;
    const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
    let body={ok:true};
    if(p==='/api/me')body={ok:true,account:selfAccount,notices:[]};
    else if(p==='/api/leaderboards')body={ok:true,month:'2026-10',global:globalRows,monthly:monthlyRows};
    else if(p==='/api/player-profile')body={ok:true,player:{accountId:'acct-other',nickname:'Jjineeland',countryCode:'US',globalRank:12,monthlyRank:7,sessionsPlayed:12,gamesPlayed:52,wins:31,losses:21,walletCoins:1565,headToHead:{sessionsPlayedTogether:2,gamesPlayedTogether:3,wins:2,losses:1,coinsWon:18,coinsLost:7,netCoins:11}}};
    else if(p==='/api/social')body={ok:true,friends:[],incoming:[],outgoing:[],history:[otherPlayer],recommendations:[otherPlayer]};
    else if(p==='/api/social/search')body={ok:true,players:[otherPlayer]};
    else if(p==='/api/social/request')body={ok:true,state:'outgoing',accountId:'acct-other'};
    else if(p==='/api/rooms')body={ok:true,room:{roomCode:'GOSTOPLIVE2026',credential:'host-credential',seatId:'playerA',status:'waiting',ranked:false,rankedMode:'free'}};
    else if(p==='/api/referrals/create')body={ok:true,referralToken:'a'.repeat(64)};
    else if(p==='/api/auth/logout')body={ok:true};
    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });
}

async function newRecordedPage(browser,{mobile=false,name}){
  const viewport=mobile?{width:390,height:844}:{width:1280,height:720};
  const videoSize=mobile?{width:390,height:844}:{width:1280,height:720};
  const context=await browser.newContext({
    viewport,hasTouch:mobile,isMobile:mobile,
    recordVideo:{dir:OUT,size:videoSize},
    deviceScaleFactor:1
  });
  await installHarness(context);
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('[pageerror]',name,error.message));
  await page.goto(BASE_URL,{waitUntil:'domcontentloaded',timeout:60000});
  if(mobile){
    const splash=page.locator('#gostopBootSplash.gostop-boot-ready');
    if(await splash.isVisible().catch(()=>false)){
      const box=await splash.boundingBox();
      if(box)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    }
  }
  await page.locator('#competitiveGamingBtn').waitFor({state:'visible',timeout:30000});
  await page.evaluate(()=>window.scrollTo(0,0));
  return {context,page,video:page.video()};
}

async function saveRecorded({context,page,video},name){
  await page.close();
  await context.close();
  const src=await video.path();
  const dest=path.join(OUT,name+'.webm');
  await fs.copyFile(src,dest);
  return dest;
}

async function installCursor(page){
  await page.evaluate(()=>{
    if(document.getElementById('filmCursor'))return;
    const style=document.createElement('style');style.id='filmCursorStyle';style.textContent=`
      #filmCursor{position:fixed;z-index:2147483646;width:26px;height:34px;pointer-events:none;left:0;top:0;transform:translate(-3px,-3px);filter:drop-shadow(0 2px 4px #000);transition:left .45s ease,top .45s ease}
      #filmCursor svg{width:100%;height:100%}
      #filmClickRing{position:fixed;z-index:2147483645;width:20px;height:20px;border:3px solid #ffd56a;border-radius:50%;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.4)}
      #filmClickRing.hit{animation:filmClick .42s ease-out}
      @keyframes filmClick{0%{opacity:1;transform:translate(-50%,-50%) scale(.35)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}}
    `;document.head.appendChild(style);
    const cursor=document.createElement('div');cursor.id='filmCursor';cursor.innerHTML='<svg viewBox="0 0 28 38" aria-hidden="true"><path fill="white" stroke="#111" stroke-width="1.5" d="M3 2 24 22l-9 2 5 10-5 2-5-10-7 7z"/></svg>';document.body.appendChild(cursor);
    const ring=document.createElement('div');ring.id='filmClickRing';document.body.appendChild(ring);
  });
}
async function cursorTo(page,selector,{x=.5,y=.5,ms=600}={}){
  const box=await page.locator(selector).boundingBox();
  if(!box)return null;
  const px=box.x+box.width*x,py=box.y+box.height*y;
  await page.evaluate(({px,py})=>{const c=document.getElementById('filmCursor');if(c){c.style.left=px+'px';c.style.top=py+'px';}},{px,py});
  await sleep(ms);
  return {x:px,y:py};
}
async function clickWithCursor(page,selector,opts={}){
  const p=await cursorTo(page,selector,opts);
  if(!p)return;
  await page.evaluate(({x,y})=>{const r=document.getElementById('filmClickRing');if(!r)return;r.style.left=x+'px';r.style.top=y+'px';r.classList.remove('hit');void r.offsetWidth;r.classList.add('hit');},p);
  await page.locator(selector).click({force:true});
  await sleep(700);
}

async function installTouchIndicator(page){
  await page.evaluate(()=>{
    const style=document.createElement('style');style.textContent=`
      #filmTouch{position:fixed;z-index:2147483646;width:48px;height:48px;border:3px solid rgba(255,230,150,.96);border-radius:50%;background:rgba(255,255,255,.14);box-shadow:0 0 0 8px rgba(255,210,90,.12),0 5px 14px #0007;pointer-events:none;opacity:0;transform:translate(-50%,-50%);transition:left .08s linear,top .08s linear,opacity .18s ease}
      #filmTouch:after{content:"";position:absolute;left:50%;top:50%;width:9px;height:9px;border-radius:50%;background:#fff4bd;transform:translate(-50%,-50%)}
      #filmTouchTrail{position:fixed;z-index:2147483645;width:5px;border-radius:999px;background:linear-gradient(to top,#ffd76dcc,#ffd76d00);pointer-events:none;opacity:0;transform-origin:bottom center}
    `;document.head.appendChild(style);
    const t=document.createElement('div');t.id='filmTouch';document.body.appendChild(t);
    const trail=document.createElement('div');trail.id='filmTouchTrail';document.body.appendChild(trail);
  });
}
async function touchPoint(page,x,y,visible=true){
  await page.evaluate(({x,y,visible})=>{const t=document.getElementById('filmTouch');if(t){t.style.left=x+'px';t.style.top=y+'px';t.style.opacity=visible?'1':'0';}},{x,y,visible});
}
async function actualTouchTap(page,selector){
  const box=await page.locator(selector).boundingBox();
  if(!box)return;
  const x=box.x+box.width/2,y=box.y+box.height*.66;
  await touchPoint(page,x,y,true);await sleep(350);
  await page.evaluate(({selector,x,y})=>{
    const card=document.querySelector(selector);if(!card)return;
    const touch={identifier:41,clientX:x,clientY:y};
    const fire=(target,type,touches,changedTouches)=>{const event=new Event(type,{bubbles:true,cancelable:true,composed:true});Object.defineProperty(event,'touches',{value:touches});Object.defineProperty(event,'changedTouches',{value:changedTouches});target.dispatchEvent(event);};
    fire(card,'touchstart',[touch],[]);fire(document,'touchend',[],[touch]);
  },{selector,x,y});
  await sleep(550);
  await touchPoint(page,x,y,false);
}
async function actualFlick(page,selector){
  const box=await page.locator(selector).boundingBox();if(!box)return;
  const start={x:box.x+box.width/2,y:box.y+box.height*.68};
  const end={x:start.x+2,y:start.y-92};
  await page.evaluate(({start,end})=>{
    const trail=document.getElementById('filmTouchTrail');if(trail){trail.style.left=(start.x-2)+'px';trail.style.top=end.y+'px';trail.style.height=(start.y-end.y)+'px';trail.style.opacity='1';}
  },{start,end});
  await touchPoint(page,start.x,start.y,true);await sleep(450);
  const points=[start,{x:start.x+1,y:start.y-22},{x:start.x+2,y:start.y-48},{x:start.x+2,y:start.y-72},end];
  for(const point of points.slice(1)){await touchPoint(page,point.x,point.y,true);await sleep(150);}
  await page.evaluate(({selector,points})=>{
    const card=document.querySelector(selector);if(!card)return;
    const makeTouch=(p,id=41)=>({identifier:id,clientX:p.x,clientY:p.y});
    const fire=(target,type,touches,changedTouches)=>{const event=new Event(type,{bubbles:true,cancelable:true,composed:true});Object.defineProperty(event,'touches',{value:touches});Object.defineProperty(event,'changedTouches',{value:changedTouches});target.dispatchEvent(event);};
    fire(card,'touchstart',[makeTouch(points[0])],[]);
    for(const point of points.slice(1,-1))fire(document,'touchmove',[makeTouch(point)],[]);
    const last=points.at(-1);fire(document,'touchmove',[makeTouch(last)],[]);fire(document,'touchend',[],[makeTouch(last)]);
  },{selector,points});
  await sleep(800);await touchPoint(page,end.x,end.y,false);
  await page.evaluate(()=>{const trail=document.getElementById('filmTouchTrail');if(trail)trail.style.opacity='0';});
}

function monthOf(id){const m=/^m(\d+)-/.exec(id||'');return m?Number(m[1]):0;}
async function singleMatchHandSelector(page){
  const data=await page.evaluate(()=>({
    hand:[...document.querySelectorAll('#playerHand [data-card-id]')].map(el=>el.dataset.cardId),
    floor:[...document.querySelectorAll('#floor [data-card-id]')].map(el=>el.dataset.cardId)
  }));
  for(const id of data.hand){
    const month=monthOf(id),count=data.floor.filter(fid=>monthOf(fid)===month).length;
    if(count===1)return `#playerHand [data-card-id="${id}"]`;
  }
  return data.hand[0]?`#playerHand [data-card-id="${data.hand[0]}"]`:null;
}
async function ensureCompetitiveOpen(page){
  const button=page.locator('#competitiveGamingBtn');
  if(await button.getAttribute('aria-expanded')!=='true'){
    await button.click({force:true});
    await page.locator('#onlinePlayMenuBtn').waitFor({state:'visible',timeout:5000});
  }
}
async function ensureFriendlyOpen(page){
  const button=page.locator('#friendlyGamingBtn');
  if(await button.getAttribute('aria-expanded')!=='true'){
    await button.click({force:true});
    await page.locator('#trainingModeBtn').waitFor({state:'visible',timeout:5000});
  }
}

async function startTraining(page){
  if(await page.locator('#soloStartOverlay').isHidden().catch(()=>false)){
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#competitiveGamingBtn').waitFor({state:'visible'});
  }
  await ensureFriendlyOpen(page);
  await page.locator('#trainingModeBtn').waitFor({state:'visible'});
  await page.locator('#trainingModeBtn').click({force:true});
  await page.locator('#soloStartOverlay').waitFor({state:'hidden',timeout:20000});
  await page.locator('#table').waitFor({state:'visible',timeout:20000});
  const dismiss=page.locator('.training-opening-dismiss-layer');
  if(await dismiss.isVisible().catch(()=>false))await dismiss.click({position:{x:8,y:8},force:true});
  await sleep(1200);
}
async function transition(page,title=''){
  await page.evaluate(title=>{
    let n=document.getElementById('filmTransition');
    if(!n){n=document.createElement('div');n.id='filmTransition';Object.assign(n.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'#100c09',display:'grid',placeItems:'center',color:'#f7d98d',font:'800 42px Georgia,serif',opacity:'0',transition:'opacity .35s ease',pointerEvents:'none'});document.body.appendChild(n);}
    n.textContent=title;n.style.opacity='1';
  },title);
  await sleep(450);
}
async function untransition(page){
  await page.evaluate(()=>{const n=document.getElementById('filmTransition');if(n)n.style.opacity='0';});await sleep(450);
}

async function filmOverlay(page,scene,phase=0){
  await page.evaluate(({scene,phase})=>{
    const deck=globalThis.GoStopEngine?.masterDeck||[];
    const names={1:'Pine',2:'Plum',3:'Cherry',4:'Vine',5:'Iris',6:'Rose',7:'Bush',8:'Hill',9:'Daisy',10:'Star',11:'Berry',12:'Willow'};
    const commons='https://commons.wikimedia.org/wiki/Special:Redirect/file/';
    const img=c=>'<img src="'+commons+encodeURIComponent(c.file).replace(/%2F/g,'/')+'" alt="">';
    let root=document.getElementById('filmRuleOverlay');
    if(!root){
      const style=document.createElement('style');style.textContent=`
        #filmRuleOverlay{position:fixed;inset:0;z-index:2147483644;background:radial-gradient(circle at 50% 46%,#385a45,#1b3024 68%,#110d09);color:#fff;display:grid;grid-template-rows:auto 1fr auto;padding:34px 48px 34px;font-family:Georgia,"Times New Roman",serif;opacity:0;transition:opacity .35s ease}
        #filmRuleOverlay.show{opacity:1}
        #filmRuleOverlay h1{margin:0;text-align:center;color:#ffdc82;font-size:40px;letter-spacing:.01em;text-shadow:0 3px 10px #000}
        #filmRuleOverlay .body{min-height:0;display:grid;place-items:center}
        #filmRuleOverlay .note{text-align:center;color:#eedab8;font:700 18px/1.35 system-ui,sans-serif;min-height:28px}
        .filmGoal{display:flex;align-items:center;justify-content:center;gap:18px}.filmGoal .step{display:grid;place-items:center;gap:8px;min-width:160px}.filmGoal .step b{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#8a2e22;border:2px solid #e7b35d;font:900 22px system-ui}.filmGoal .step span{font:800 20px system-ui}.filmGoal i{font:900 34px system-ui;color:#ffd36d}
        .familyGrid{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.familyGroup{padding:8px;border-radius:12px;background:#160f0c99;border:1px solid #ffffff1c;opacity:.55;transition:.25s}.familyGroup.active{opacity:1;box-shadow:0 0 0 2px #e4b257,0 0 24px #e4b25744}.familyGroup strong{display:block;text-align:center;color:#ffe09a;font:800 16px system-ui;margin-bottom:4px}.familyCards{display:flex;justify-content:center;gap:3px}.familyCards img{width:46px;height:74px;object-fit:contain;border:1px solid #a92a20;border-radius:4px;background:#eee}
        .typeWrap{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.typeGroup{min-width:0;padding:12px;border-radius:14px;background:#160f0caf;border:1px solid #ffffff1e;opacity:.42;transition:.3s}.typeGroup.active{opacity:1;box-shadow:0 0 0 2px #e4b257,0 0 28px #e4b25744}.typeGroup h2{margin:0 0 8px;text-align:center;color:#ffd97d;font-size:23px}.typeCards{display:flex;flex-wrap:wrap;justify-content:center;gap:3px}.typeCards img{width:38px;height:61px;object-fit:contain;border:1px solid #a92a20;border-radius:3px;background:#eee}.stripeLabel{font:800 13px system-ui;color:#f2d7a3;margin:5px 0 2px}
        .scoreStage{display:grid;place-items:center;width:100%;height:100%}.scoreCard{width:min(960px,96%);padding:20px 26px;border-radius:16px;background:#160f0cba;border:1px solid #d6aa5b55;display:grid;gap:12px}.scoreCard h2{margin:0;color:#ffd878;font-size:30px}.scoreRows{display:grid;gap:10px}.scoreRow{display:flex;align-items:center;justify-content:center;gap:9px;min-height:94px}.scoreRow img{width:54px;height:87px;object-fit:contain;border:2px solid #a92a20;border-radius:4px;background:#eee}.scoreRow strong{margin-left:14px;color:#fff1bd;font:900 22px system-ui}.scoreSmall{color:#dbc6a1;font:700 18px/1.4 system-ui;text-align:center}
        .specialCard{width:min(920px,94%);padding:22px;border-radius:16px;background:#160f0cba;border:1px solid #d6aa5b55;display:grid;grid-template-columns:1fr 1.4fr;gap:20px;align-items:center}.specialCards{display:flex;justify-content:center;align-items:center;gap:7px}.specialCards img{width:78px;height:126px;object-fit:contain;border:2px solid #a92a20;border-radius:5px;background:#eee}.specialText{text-align:left}.specialText h2{margin:0 0 8px;color:#ffd878;font-size:34px}.specialText p{margin:0;color:#f0dfc1;font:700 21px/1.42 system-ui}
        .fullRulesBook{width:170px;height:220px;border-radius:10px;border:8px solid #7a3022;background:linear-gradient(135deg,#b03627,#651d17);box-shadow:18px 16px 0 #28150f,0 18px 32px #0008;display:grid;place-items:center;color:#ffe2a1;font:900 30px/1.15 Georgia;text-align:center}
        .funTitle{font-size:70px;color:#ffdd78;text-shadow:0 5px 18px #000}.funSub{font:800 30px system-ui;color:#fff0cb}
      `;document.head.appendChild(style);
      root=document.createElement('div');root.id='filmRuleOverlay';root.innerHTML='<h1></h1><div class="body"></div><div class="note"></div>';document.body.appendChild(root);
    }
    const h=root.querySelector('h1'),body=root.querySelector('.body'),note=root.querySelector('.note');
    const cardsForMonth=m=>deck.filter(c=>c.month===m);
    const ids=list=>list.map(id=>deck.find(c=>c.id===id)).filter(Boolean);
    const images=cards=>cards.map(img).join('');
    root.classList.add('show');
    if(scene==='goal'){
      h.textContent='THE GOAL';note.textContent='Match by family, capture scoring cards, reach 7 points, then choose GO or STOP.';
      body.innerHTML='<div class="filmGoal"><div class="step"><b>1</b><span>Match Families</span></div><i>→</i><div class="step"><b>2</b><span>Capture Cards</span></div><i>→</i><div class="step"><b>3</b><span>Reach 7 Points</span></div><i>→</i><div class="step"><b>4</b><span>GO or STOP</span></div></div>';
    }else if(scene==='families'){
      h.textContent='12 CARD FAMILIES';note.textContent='Every family has exactly four cards.';
      body.innerHTML='<div class="familyGrid">'+Array.from({length:12},(_,i)=>'<div class="familyGroup '+(Math.floor(i/4)===phase?'active':'')+'"><strong>'+names[i+1]+'</strong><div class="familyCards">'+images(cardsForMonth(i+1))+'</div></div>').join('')+'</div>';
    }else if(scene==='types'){
      h.textContent='FOUR SCORING CARD TYPES';
      const bright=deck.filter(c=>c.type==='bright'),picture=deck.filter(c=>c.type==='animal'),stripe=deck.filter(c=>c.type==='ribbon'),single=deck.filter(c=>c.type==='pi');
      const groups=[
        ['Brights',bright],['Pictures',picture],['Stripes',stripe],['Singles',single]
      ];
      note.textContent=phase===0?'Brights are the rarest scoring cards.':phase===1?'Pictures include birds, animals, and the Daisy Sake Cup.':phase===2?'Stripes include Red, Blue, and Plain scoring sets.':'Singles are most common. Some special Singles count as two.';
      body.innerHTML='<div class="typeWrap">'+groups.map((g,i)=>'<div class="typeGroup '+(i===phase?'active':'')+'"><h2>'+g[0]+'</h2><div class="typeCards">'+images(g[1])+'</div></div>').join('')+'</div>';
    }else if(scene==='scoring'){
      h.textContent='SCORING COMBINATIONS';
      const sets=[
        {title:'BRIGHTS',rows:[
          [ids(['m1-1','m3-1','m12-1']),'3 with Rain Bright = 2 points'],
          [ids(['m1-1','m3-1','m8-1']),'3 non-Rain Brights = 3 points']
        ],small:'4 Brights = 4 points · All 5 Brights = 15 points'},
        {title:'PICTURES',rows:[
          [ids(['m2-1','m4-1','m8-2']),'5-BIRDIES! = 5 points'],
          [deck.filter(c=>c.type==='animal').slice(0,5),'Any 5 Pictures = 1 point']
        ],small:'Each additional Picture after 5 adds 1 point.'},
        {title:'STRIPES',rows:[
          [ids(['m1-2','m2-2','m3-2']),'3 Red Stripes = 3 points'],
          [deck.filter(c=>c.type==='ribbon').slice(0,5),'Any 5 Stripes = 1 point']
        ],small:'Red, Blue, or Plain 3-card sets score 3. Each Stripe after 5 adds 1.'},
        {title:'SINGLES',rows:[
          [ids(['m11-3','m12-4','m9-1']),'2x Singles count as two'],
          [deck.filter(c=>c.type==='pi').slice(0,10),'10 Singles = 1 point']
        ],small:'Each additional Single after 10 adds 1 point.'}
      ];
      const set=sets[Math.min(phase,sets.length-1)];
      note.textContent='';
      body.innerHTML='<div class="scoreStage"><div class="scoreCard"><h2>'+set.title+'</h2><div class="scoreRows">'+set.rows.map(([cards,label])=>'<div class="scoreRow">'+images(cards)+'<strong>'+label+'</strong></div>').join('')+'</div><div class="scoreSmall">'+set.small+'</div></div></div>';
    }else if(scene==='specials'){
      h.textContent='SPECIAL PLAYS';
      const list=[
        {title:'SHAKE',cards:ids(['m1-1','m1-2','m1-3']),text:'Hold 3 cards from one family and reveal them. A normal Shake doubles your settlement if you later win.'},
        {title:'BOMB',cards:ids(['m2-1','m2-2','m2-3','m2-4']),text:'Keep 3 same-family cards hidden. When the 4th is on the table, play all 3, capture the family, and steal 1 Single.'},
        {title:'POOPED!  ·  뻑',cards:ids(['m3-2','m3-3','m3-4']),text:'Your played card matches one table card and the draw is the same family. The 3-card stack stays. Capturing it later steals 1 Single.'},
        {title:'KISS!  ·  쪽',cards:ids(['m6-3','m6-4']),text:'Your played card has no match, then the draw gives its matching family. Capture the pair and steal 1 Single.'},
        {title:'FLUSH!  ·  따닥',cards:ids(['m8-1','m8-2','m8-3','m8-4']),text:'Two family cards are on the table, you play the third, and the draw gives the fourth. Capture all 4 and steal 1 Single.'},
        {title:'CLEAN SWEEP!  ·  싹쓸이',cards:ids(['m10-3','m10-4']),text:'A capture clears every live card from the table. You also steal 1 Single when available.'}
      ];
      const item=list[Math.min(phase,list.length-1)];
      note.textContent='Special captures steal a physical Single. They are not automatic ×2 score events.';
      body.innerHTML='<div class="specialCard"><div class="specialCards">'+images(item.cards)+'</div><div class="specialText"><h2>'+item.title+'</h2><p>'+item.text+'</p></div></div>';
    }else if(scene==='fullrules'){
      h.textContent='FULL RULES';note.textContent='The complete written reference stays available below the video.';
      body.innerHTML='<div class="fullRulesBook">FULL<br>RULES</div>';
    }else if(scene==='fun'){
      h.textContent='';note.textContent='';
      body.innerHTML='<div><div class="funTitle">GoStop <em>Live!</em></div><div class="funSub">Have Fun!</div></div>';
    }
  },{scene,phase});
}
async function hideFilmOverlay(page){
  await page.evaluate(()=>document.getElementById('filmRuleOverlay')?.classList.remove('show'));await sleep(400);
}

async function recordPart1(browser){
  const rec=await newRecordedPage(browser,{name:'part1'});
  const {page}=rec;
  await installCursor(page);
  await runTimed(6,async()=>{
    await page.evaluate(()=>{document.querySelector('.main-menu-title')?.animate([{transform:'scale(.96)',opacity:.7},{transform:'scale(1)',opacity:1}],{duration:1400,easing:'ease-out'});});
  });
  await runTimed(12,async()=>{
    await page.evaluate(()=>{
      const n=document.createElement('div');n.id='worldFilm';n.innerHTML='<strong>PLAY TOGETHER, ANYWHERE</strong><span>🌎</span><small>Friends · AI · Players around the globe</small>';
      Object.assign(n.style,{position:'fixed',left:'50%',top:'50%',transform:'translate(-50%,-50%)',zIndex:'2147483600',padding:'24px 34px',borderRadius:'18px',background:'rgba(20,14,10,.88)',border:'1px solid rgba(225,181,93,.55)',display:'grid',placeItems:'center',gap:'10px',color:'#ffe09a',font:'800 26px Georgia,serif',boxShadow:'0 20px 50px rgba(0,0,0,.5)'});
      n.querySelector('span').style.fontSize='72px';n.querySelector('small').style.font='700 16px system-ui';n.querySelector('small').style.color='#ead6b5';document.body.appendChild(n);
      n.animate([{opacity:0,transform:'translate(-50%,-46%) scale(.96)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:700,easing:'ease-out',fill:'both'});
    });
    await sleep(8000);
    await page.evaluate(()=>document.getElementById('worldFilm')?.animate([{opacity:1},{opacity:0}],{duration:700,fill:'forwards'}));await sleep(800);
    await page.evaluate(()=>document.getElementById('worldFilm')?.remove());
  });
  await runTimed(20,async()=>{
    await clickWithCursor(page,'#friendlyGamingBtn');
    await clickWithCursor(page,'#trainingModeBtn');
    await page.locator('#soloStartOverlay').waitFor({state:'hidden',timeout:20000});
    const dismiss=page.locator('.training-opening-dismiss-layer');
    if(await dismiss.isVisible().catch(()=>false))await dismiss.click({position:{x:8,y:8},force:true});
    await sleep(1200);
    const card=await singleMatchHandSelector(page);
    if(card){
      await cursorTo(page,card,{ms:700});
      await page.locator(card).click({force:true});
      await sleep(2500);
      await page.evaluate(({selector})=>{const el=document.querySelector(selector);if(el)el.animate([{transform:'translateY(-12px)'},{transform:'translateY(-12px)'}],{duration:700});},{selector:card});
      await cursorTo(page,card,{ms:450});
      await page.locator(card).click({force:true});
      await sleep(4300);
      const target=page.locator('#floor .target-choice,#floor .is-target,#floor .choice-target').first();
      if(await target.isVisible().catch(()=>false))await target.click({force:true});
    }
  });
  return saveRecorded(rec,'part1-raw');
}

async function recordMobile(browser){
  const rec=await newRecordedPage(browser,{mobile:true,name:'mobile'});
  const {page}=rec;
  await installTouchIndicator(page);
  await runTimed(22,async()=>{
    await startTraining(page);
    let card=await singleMatchHandSelector(page);
    if(card){
      await actualTouchTap(page,card);await sleep(1600);
      await actualTouchTap(page,card);await sleep(3900);
    }
    await sleep(3500);
    card=await singleMatchHandSelector(page);
    if(card){
      await actualTouchTap(page,card);await sleep(1200);
      await actualFlick(page,card);await sleep(3600);
    }
  });
  return saveRecorded(rec,'mobile-raw');
}

async function resetToMenu(page){
  await transition(page,'');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#competitiveGamingBtn').waitFor({state:'visible',timeout:30000});
  await untransition(page);
}

async function recordPart2(browser){
  const rec=await newRecordedPage(browser,{name:'part2'});
  const {page}=rec;
  await installCursor(page);

  await runTimed(18,async()=>{
    await startTraining(page);
    const card=await singleMatchHandSelector(page);
    if(card){await page.locator(card).click({force:true});await sleep(400);await page.locator(card).click({force:true});await sleep(2800);}
    await clickWithCursor(page,'.human-chip',{ms:450});await sleep(1400);
    await page.locator('#playerInfoOverlay').click({position:{x:5,y:5},force:true}).catch(()=>{});
    await clickWithCursor(page,'.human-chip .score-pill',{ms:450});await sleep(1400);
    await page.locator('#scoreDialog .dialog-close').click({force:true}).catch(()=>{});
    const capture='.player-capture-panel';
    const first=page.locator(capture).first();
    if(await first.isVisible().catch(()=>false)){const box=await first.boundingBox();if(box){await cursorTo(page,capture,{ms:450});await first.click({force:true});await sleep(1600);await page.keyboard.press('Escape').catch(()=>{});}}
  });

  await runTimed(24,async()=>{
    await resetToMenu(page);
    await clickWithCursor(page,'#friendlyGamingBtn',{ms:450});await sleep(900);
    await cursorTo(page,'#trainingModeBtn',{ms:450});await sleep(1400);
    await cursorTo(page,'#playSoloBtn',{ms:450}).catch(()=>{});await sleep(1200);
    await clickWithCursor(page,'#freeFriendBtn',{ms:450});await sleep(2400);
    await page.locator('#freeFriendClose').click({force:true}).catch(()=>{});
    await ensureCompetitiveOpen(page);await cursorTo(page,'#competitiveGamingBtn',{ms:450});await sleep(1000);
    await cursorTo(page,'#rankedSoloBtn',{ms:450});await sleep(1800);
    await clickWithCursor(page,'#onlinePlayMenuBtn',{ms:450});await sleep(2500);
    await page.locator('#onlineLobbyClose').click({force:true}).catch(()=>{});
  });

  await runTimed(20,async()=>{
    if(await page.locator('#onlineLobbyPanel').isHidden().catch(()=>true)){
      await ensureCompetitiveOpen(page);await page.locator('#onlinePlayMenuBtn').click({force:true});await sleep(900);
    }
    await clickWithCursor(page,'#autoMatchBtn',{ms:450});await sleep(3400);
    await page.locator('#autoMatchCandidateCancel').click({force:true}).catch(()=>{});
    await clickWithCursor(page,'#browsePlayersBtn',{ms:450}).catch(()=>{});await sleep(2200);
    await page.locator('#onlineLobbyClose').click({force:true}).catch(()=>{});
    await clickWithCursor(page,'#friendsMenuBtn',{ms:450});await sleep(1900);
    const searchTab=page.locator('[data-social-tab="search"]');
    if(await searchTab.isVisible().catch(()=>false)){await searchTab.click({force:true});await sleep(700);const input=page.locator('#socialSearchInput');await input.fill('Jjinee');await page.locator('#socialSearchBtn').click({force:true});await sleep(1600);}
  });

  await runTimed(25,async()=>{
    await resetToMenu(page);
    await clickWithCursor(page,'#leaderboardMenuBtn',{ms:450});await sleep(4500);
    const board=page.locator('.leaderboard-screen');
    if(await board.isVisible().catch(()=>false)){
      await board.evaluate(node=>{
        const fire=(type,points)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,type==='touchend'?'changedTouches':'touches',{value:points});node.dispatchEvent(e);};
        fire('touchstart',[{clientX:920,clientY:340}]);fire('touchend',[{clientX:300,clientY:340}]);
      });await sleep(4200);
      await page.locator('.leaderboard-title').click({force:true}).catch(()=>{});
    }
    await sleep(10500);
  });

  await runTimed(10,async()=>{await filmOverlay(page,'goal',0);});
  await runTimed(18,async()=>{
    await filmOverlay(page,'families',0);await sleep(5800);
    await filmOverlay(page,'families',1);await sleep(5800);
    await filmOverlay(page,'families',2);
  });
  await runTimed(24,async()=>{
    for(let i=0;i<4;i++){await filmOverlay(page,'types',i);await sleep(i===3?0:5600);}
  });
  await runTimed(38,async()=>{
    for(let i=0;i<4;i++){await filmOverlay(page,'scoring',i);await sleep(i===3?0:9200);}
  });

  await runTimed(28,async()=>{
    await hideFilmOverlay(page);await resetToMenu(page);await startTraining(page);
    const card=await singleMatchHandSelector(page);
    if(card){
      await cursorTo(page,card,{ms:500});await page.locator(card).click({force:true});await sleep(3000);
      await cursorTo(page,card,{ms:350});await page.locator(card).click({force:true});await sleep(8000);
      const target=page.locator('#floor .target-choice,#floor .is-target,#floor .choice-target').first();
      if(await target.isVisible().catch(()=>false))await target.click({force:true});
      await sleep(7000);
    }
  });

  await runTimed(28,async()=>{
    await page.evaluate(()=>{
      const d=document.getElementById('decisionDialog');if(!d)return;
      document.getElementById('stopPreviewValue').textContent='Stop : 7 Points';
      document.getElementById('decisionText').textContent='You reached the GO / STOP threshold.';
      if(!d.open)d.showModal();
      let n=document.getElementById('goFilmRules');if(!n){n=document.createElement('div');n.id='goFilmRules';Object.assign(n.style,{position:'fixed',left:'50%',bottom:'8%',transform:'translateX(-50%)',zIndex:'2147483646',display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',width:'min(920px,88vw)',padding:'10px',background:'rgba(17,12,9,.90)',border:'1px solid rgba(222,177,91,.5)',borderRadius:'12px',color:'#f5e3c2',font:'800 15px system-ui',textAlign:'center'});n.innerHTML='<span>STOP<br><b>Take points</b></span><span>1 GO<br><b>+1</b></span><span>2 GO<br><b>+2 total</b></span><span>3 GO<br><b>×2</b></span><span>4 GO<br><b>×4</b></span>';document.body.appendChild(n);}
    });
    await sleep(7000);
    await page.evaluate(()=>document.querySelector('#goFilmRules span:nth-child(1)')?.animate([{background:'transparent'},{background:'#7c531d'}],{duration:700,fill:'forwards'}));await sleep(5000);
    await page.evaluate(()=>document.querySelectorAll('#goFilmRules span:nth-child(2),#goFilmRules span:nth-child(3)').forEach(n=>n.animate([{background:'transparent'},{background:'#7c531d'}],{duration:700,fill:'forwards'})));await sleep(6500);
    await page.evaluate(()=>document.querySelectorAll('#goFilmRules span:nth-child(4),#goFilmRules span:nth-child(5)').forEach(n=>n.animate([{background:'transparent'},{background:'#7c531d'}],{duration:700,fill:'forwards'})));
  });

  await runTimed(38,async()=>{
    await page.evaluate(()=>{document.getElementById('decisionDialog')?.close();document.getElementById('goFilmRules')?.remove();});
    const waits=[6200,6500,6800,6200,6200,0];
    for(let i=0;i<6;i++){await filmOverlay(page,'specials',i);if(waits[i])await sleep(waits[i]);}
  });

  await runTimed(10,async()=>{await filmOverlay(page,'fullrules',0);});
  await runTimed(18,async()=>{
    await hideFilmOverlay(page);await resetToMenu(page);await clickWithCursor(page,'#friendlyGamingBtn',{ms:400});await clickWithCursor(page,'#trainingModeBtn',{ms:400});
    await page.locator('#soloStartOverlay').waitFor({state:'hidden',timeout:20000});
    await page.locator('#trainingCoachPanel').waitFor({state:'visible',timeout:20000}).catch(()=>{});
    await sleep(9000);
    const dismiss=page.locator('.training-opening-dismiss-layer');if(await dismiss.isVisible().catch(()=>false))await dismiss.click({position:{x:8,y:8},force:true});
    await sleep(3000);
  });
  await runTimed(7,async()=>{await filmOverlay(page,'fun',0);});

  return saveRecorded(rec,'part2-raw');
}

const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
try{
  await recordPart1(browser);
  await recordMobile(browser);
  await recordPart2(browser);
}finally{
  await browser.close();
}
console.log(JSON.stringify({duration:absolute,out:OUT}));
