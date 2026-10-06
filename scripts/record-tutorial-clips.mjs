import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.CLIP_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.resolve(process.env.CLIP_OUT_DIR||'tutorial-clips');
const rawDir=path.join(outDir,'raw');
await fs.mkdir(rawDir,{recursive:true});

const browser=await chromium.launch({headless:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function setupPage(page){
  await page.addInitScript(()=>{
    globalThis.GOSTOP_TEST_MODE=true;
    globalThis.GOSTOP_CAPTURE_MODE=true;
    globalThis.GOSTOP_PERFORMANCE_LITE=false;
    try{
      localStorage.setItem('gostop-language','en');
      localStorage.setItem('gostop-sound','off');
    }catch(_){}
  });
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(baseURL+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!globalThis.GOSTOP_TEST_API,{timeout:15000});
  await page.evaluate(()=>{
    const api=globalThis.GOSTOP_TEST_API;
    document.documentElement.classList.remove('gostop-boot-pending');
    document.getElementById('soloStartOverlay')?.setAttribute('hidden','');
    document.querySelectorAll('dialog[open]').forEach(d=>{try{d.close();}catch(_){ }});
    const tutorial=document.getElementById('howToDialog');if(tutorial?.open)tutorial.close();
    api.setOnlineMode(false);
    api.setTrainingMode(false);
    api.setSoundEnabled(false);
    api.setLocked(false);
    api.beginGameplayPresentation();
    const stage=document.querySelector('.game-stage');
    if(stage){stage.style.setProperty('--stage-scale','1');stage.style.removeProperty('--scaled-height');}
  });
}

async function installState(page,config){
  await page.evaluate(config=>{
    const api=globalThis.GOSTOP_TEST_API;
    const c=id=>api.card(id);
    const cs=ids=>(ids||[]).map(c);
    const human=api.makePlayer({
      hand:cs(config.humanHand),
      captured:cs(config.humanCaptured),
      hiddenTripleMonths:config.hiddenTripleMonths||[],
      shakenMonths:config.shakenMonths||[],
      armedBombMonths:config.armedBombMonths||[],
      go:config.humanGo||0,
      lastGoScore:config.lastGoScore||0,
      ppeoks:config.humanPpeoks||0
    });
    const ai=api.makePlayer({
      hand:cs(config.aiHand),
      captured:cs(config.aiCaptured),
      go:config.aiGo||0,
      lastGoScore:config.aiLastGoScore||0,
      ppeoks:config.aiPpeoks||0
    });
    const state=api.makeState({
      deck:cs(config.deck),
      floor:cs(config.floor),
      human,ai,
      turn:config.turn||'playerA',
      startingPlayerId:config.startingPlayerId||'playerA',
      winner:null,specialWinner:null
    });
    api.initFloorSlots(state);
    api.setState(state);
    api.setLocked(false);
    api.render();
    document.getElementById('soloStartOverlay')?.setAttribute('hidden','');
  },config);
  await sleep(700);
}

async function recordClip({name,viewport={width:1365,height:768},scenario,tail=1400}){
  const context=await browser.newContext({
    viewport,
    deviceScaleFactor:1,
    hasTouch:viewport.width<700,
    isMobile:false,
    recordVideo:{dir:rawDir,size:viewport}
  });
  const page=await context.newPage();
  await setupPage(page);
  const video=page.video();
  try{
    await Promise.race([
      scenario(page),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Scenario timeout: '+name)),25000))
    ]);
    await sleep(tail);
  }finally{
    await page.close();
    await context.close();
  }
  const raw=await video.path();
  const dest=path.join(rawDir,name+'.webm');
  await fs.rename(raw,dest);
  console.log('RECORDED',name);
  return dest;
}

async function humanPlay(page,cardId){
  await page.evaluate(cardId=>{
    const api=globalThis.GOSTOP_TEST_API;
    const el=document.querySelector('#playerHand .hand-card[data-card-id="'+cardId+'"]');
    globalThis.__clipPromise=api.humanPlay(cardId,el);
  },cardId);
  await page.evaluate(()=>globalThis.__clipPromise);
}

async function chooseTarget(page,cardId){
  await page.waitForSelector('#floor .target-option[data-card-id="'+cardId+'"]',{state:'visible',timeout:5000});
  await sleep(900);
  await page.evaluate(cardId=>{
    const el=document.querySelector('#floor .target-option[data-card-id="'+cardId+'"]');
    if(!el)throw new Error('Target option not found: '+cardId);
    el.click();
  },cardId);
  await page.evaluate(()=>globalThis.__clipPromise);
}

const clips=[
  {
    name:'01_pc_select_then_hit',
    scenario:async page=>{
      await installState(page,{
        floor:['m2-2','m3-1','m8-1'],deck:['m3-2'],
        humanHand:['m2-1','m6-3','m10-4'],aiCaptured:['m7-3']
      });
      const card=page.locator('#playerHand .hand-card[data-card-id="m2-1"]');
      await card.hover();await sleep(450);
      await page.evaluate(()=>document.querySelector('#playerHand .hand-card[data-card-id="m2-1"]')?.classList.add('film-demo-selected'));
      await sleep(900);
      await page.evaluate(()=>document.querySelector('#playerHand .hand-card[data-card-id="m2-1"]')?.classList.remove('film-demo-selected'));
      await humanPlay(page,'m2-1');
    }
  },
  {
    name:'02_mobile_flick_up',
    viewport:{width:390,height:844},
    scenario:async page=>{
      await installState(page,{
        floor:['m5-4','m8-1','m10-3'],deck:['m10-4'],
        humanHand:['m5-3','m6-3','m7-3'],aiCaptured:['m4-3']
      });
      const box=await page.locator('#playerHand .hand-card[data-card-id="m5-3"]').boundingBox();
      if(box){
        await page.evaluate(({x,y})=>{
          const el=document.createElement('div');
          el.id='clipTouch';el.textContent='●';
          Object.assign(el.style,{position:'fixed',left:x+'px',top:y+'px',zIndex:'99999',fontSize:'28px',color:'rgba(255,255,255,.78)',textShadow:'0 1px 5px #000',pointerEvents:'none',transition:'transform .75s cubic-bezier(.2,.8,.2,1), opacity .2s'});
          document.body.appendChild(el);
          const card=document.querySelector('#playerHand .hand-card[data-card-id="m5-3"]');
          card?.animate([{transform:'translateY(0)'},{transform:'translateY(-115px)'}],{duration:750,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
          requestAnimationFrame(()=>{el.style.transform='translateY(-125px)';});
        },{x:box.x+box.width*.55,y:box.y+box.height*.55});
        await sleep(900);
        await page.evaluate(()=>document.getElementById('clipTouch')?.remove());
      }
      await humanPlay(page,'m5-3');
    }
  },
  {
    name:'03_no_match_play_and_draw_land',
    scenario:async page=>{
      await installState(page,{
        floor:['m1-1','m8-1'],deck:['m3-1'],
        humanHand:['m2-1'],aiCaptured:['m7-3']
      });
      await humanPlay(page,'m2-1');
    }
  },
  {
    name:'04_play_capture_then_draw_capture',
    scenario:async page=>{
      await installState(page,{
        floor:['m2-2','m3-1','m8-1'],deck:['m3-2'],
        humanHand:['m2-1'],aiCaptured:['m7-3']
      });
      await humanPlay(page,'m2-1');
    }
  },
  {
    name:'05_two_matches_choose_target',
    scenario:async page=>{
      await installState(page,{
        floor:['m8-1','m8-2','m5-3'],deck:['m4-1'],
        humanHand:['m8-3'],aiCaptured:['m7-3']
      });
      await page.evaluate(()=>{
        const api=globalThis.GOSTOP_TEST_API;
        const el=document.querySelector('#playerHand .hand-card[data-card-id="m8-3"]');
        globalThis.__clipPromise=api.humanPlay('m8-3',el);
      });
      await page.waitForSelector('#floor .target-option',{state:'visible',timeout:5000});
      await sleep(900);
      await chooseTarget(page,'m8-1');
    }
  },
  {
    name:'06_pooped_ppeok_formation',
    scenario:async page=>{
      await installState(page,{
        floor:['m4-1','m8-1'],deck:['m4-3'],
        humanHand:['m4-2'],aiCaptured:['m7-3','m9-3']
      });
      const closer=setInterval(async()=>{
        const open=await page.locator('#firstPpeokDialog[open]').count().catch(()=>0);
        if(open){
          await page.evaluate(()=>document.getElementById('firstPpeokDialog')?.close());
          clearInterval(closer);
        }
      },150);
      await humanPlay(page,'m4-2');
      clearInterval(closer);
    }
  },
  {
    name:'07_capture_pooped_stack_and_steal_single',
    scenario:async page=>{
      await installState(page,{
        floor:['m2-1','m2-2','m2-3','m8-1'],deck:[],
        humanHand:['m2-4'],aiCaptured:['m7-3','m8-3']
      });
      await page.evaluate(()=>{
        const api=globalThis.GOSTOP_TEST_API,state=api.getState();
        const stack=state.floor.filter(c=>c.month===2);
        api.makePpeokStack('ai',stack);
        api.render();
      });
      await sleep(600);
      await page.evaluate(async()=>{
        const api=globalThis.GOSTOP_TEST_API,state=api.getState();
        const target=state.floor.find(c=>c.id==='m2-3');
        await api.resolveSingleCard('human',{card:api.card('m2-4'),target,matchCount:1},false);
      });
    }
  },
  {
    name:'08_kiss_jjok_and_steal_single',
    scenario:async page=>{
      await installState(page,{
        floor:['m8-1'],deck:['m5-2'],
        humanHand:['m5-1'],aiCaptured:['m7-3','m9-3']
      });
      await humanPlay(page,'m5-1');
    }
  },
  {
    name:'09_flush_ttadak_capture_four_and_steal',
    scenario:async page=>{
      await installState(page,{
        floor:['m3-1','m3-2','m8-1'],deck:['m3-4'],
        humanHand:['m3-3'],aiCaptured:['m7-3','m9-3']
      });
      await page.evaluate(()=>{
        const api=globalThis.GOSTOP_TEST_API;
        const el=document.querySelector('#playerHand .hand-card[data-card-id="m3-3"]');
        globalThis.__clipPromise=api.humanPlay('m3-3',el);
      });
      await page.waitForSelector('#floor .target-option',{state:'visible',timeout:5000});
      await sleep(800);
      await chooseTarget(page,'m3-1');
    }
  },
  {
    name:'10_clean_sweep_and_steal_single',
    scenario:async page=>{
      await installState(page,{
        floor:['m10-1'],deck:[],
        humanHand:['m10-2'],aiCaptured:['m7-3','m9-3']
      });
      await humanPlay(page,'m10-2');
    }
  },
  {
    name:'11_shake_reveal_then_play',
    scenario:async page=>{
      await installState(page,{
        floor:['m8-1','m5-3'],deck:['m7-3'],
        humanHand:['m1-1','m1-2','m1-3','m6-3'],
        hiddenTripleMonths:[1],aiCaptured:['m9-3']
      });
      await page.evaluate(()=>{
        const api=globalThis.GOSTOP_TEST_API;
        const el=document.querySelector('#playerHand .hand-card[data-card-id="m1-1"]');
        globalThis.__clipPromise=api.humanPlay('m1-1',el);
      });
      await page.waitForSelector('#shakeDialog[open]',{timeout:5000});
      await sleep(1300);
      await page.locator('#shakeBtn').click();
      await page.evaluate(()=>globalThis.__clipPromise);
    }
  },
  {
    name:'12_bomb_capture_four_and_steal_single',
    scenario:async page=>{
      await installState(page,{
        floor:['m6-4','m8-1'],deck:['m7-3'],
        humanHand:['m6-1','m6-2','m6-3','m9-3'],
        hiddenTripleMonths:[6],aiCaptured:['m10-3','m11-4']
      });
      await page.evaluate(async()=>{
        const api=globalThis.GOSTOP_TEST_API;
        const engine=globalThis.GoStopEngine;
        let state=api.getState();
        const offered=engine.applyNormalTurnAction(state,{type:'requestBombDecision',actorId:'playerA',cardId:'m6-1'});
        api.setState(offered.state);
        api.render();
        await api.executeBombTurn('human',6);
      });
    }
  },
  {
    name:'13_go_stop_decision',
    scenario:async page=>{
      await installState(page,{
        floor:['m10-1'],deck:['m11-4'],
        humanHand:['m10-2'],
        humanCaptured:['m1-1','m3-1','m8-1','m2-1','m4-1','m5-1','m6-1','m7-1'],
        aiCaptured:['m9-3']
      });
      await page.evaluate(()=>{
        const api=globalThis.GOSTOP_TEST_API;
        const score=api.score(api.getState().human.captured);
        api.humanGoStop(score);
      });
      await page.waitForSelector('#decisionDialog[open]',{timeout:5000});
      await sleep(2500);
    }
  },
  {
    name:'14_go_callout',
    scenario:async page=>{
      await installState(page,{
        floor:['m10-1'],deck:[],
        humanHand:['m10-2'],humanCaptured:['m1-1','m3-1','m8-1'],humanGo:2
      });
      await page.evaluate(()=>globalThis.GOSTOP_TEST_API.showGoCallout('human'));
      await sleep(2200);
    }
  },
  {
    name:'15_single_transfer_animation',
    scenario:async page=>{
      await installState(page,{
        floor:['m8-1'],deck:[],
        humanHand:['m5-3'],aiCaptured:['m7-3','m9-3']
      });
      await page.evaluate(async()=>globalThis.GOSTOP_TEST_API.stealPiAnimated('human',1));
    }
  }
];

const outputs=[];
for(const clip of clips){
  try{outputs.push(await recordClip(clip));}
  catch(error){
    console.error('FAILED',clip.name,error);
    throw error;
  }
}
await browser.close();

const manifest=[
  '# GoStop Live! Gameplay Clip Pack',
  '',
  'All clips are captured from the real GoStop Live! game UI and engine in a deterministic capture-only test mode.',
  '',
  ...clips.map((clip,i)=>String(i+1).padStart(2,'0')+'. '+clip.name+'.mp4')
].join('\n');
await fs.writeFile(path.join(outDir,'README.txt'),manifest+'\n','utf8');
console.log('DONE',outputs.length,'clips');
