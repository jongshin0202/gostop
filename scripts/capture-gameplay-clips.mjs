import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL=process.env.CLIP_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.resolve(process.env.CLIP_OUT_DIR||'artifacts/gameplay-clips');
const rawDir=path.join(outDir,'raw');
fs.mkdirSync(rawDir,{recursive:true});

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function setScenario(page,spec){
  await page.evaluate(spec=>{
    const api=globalThis.GOSTOP_CAPTURE_API;
    const c=id=>api.card(id);
    const player=input=>api.makePlayer({
      ...(input||{}),
      hand:(input?.hand||[]).map(c),
      captured:(input?.captured||[]).map(c)
    });
    api.setScenario({
      deck:(spec.deck||[]).map(c),
      floor:(spec.floor||[]).map(c),
      human:player(spec.human||{}),
      ai:player(spec.ai||{}),
      floorStacks:spec.floorStacks||{},
      turn:'playerA',
      winner:null,
      specialWinner:null,
      matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}
    });
  },spec);
  await page.waitForTimeout(650);
  await page.waitForFunction(()=>[...document.images].every(img=>img.complete),null,{timeout:10000}).catch(()=>{});
}

async function addGestureOverlay(page,kind='mouse'){
  await page.evaluate(kind=>{
    document.getElementById('clipGestureOverlay')?.remove();
    const el=document.createElement('div');
    el.id='clipGestureOverlay';
    Object.assign(el.style,{
      position:'fixed',left:'0',top:'0',zIndex:'999999',pointerEvents:'none',
      width:kind==='touch'?'34px':'24px',height:kind==='touch'?'34px':'32px',
      borderRadius:kind==='touch'?'50%':'0',opacity:'0',
      transition:'transform .22s ease,opacity .15s ease,scale .1s ease',
      background:kind==='touch'?'rgba(255,255,255,.76)':'transparent',
      boxShadow:kind==='touch'?'0 0 0 3px rgba(255,214,91,.95),0 2px 8px rgba(0,0,0,.55)':'none'
    });
    if(kind==='mouse'){
      el.innerHTML='<div style="width:0;height:0;border-left:10px solid white;border-top:17px solid white;border-right:7px solid transparent;border-bottom:7px solid transparent;transform:rotate(-16deg);filter:drop-shadow(0 1px 2px #000)"></div>';
    }
    document.body.appendChild(el);
  },kind);
}

async function moveOverlayTo(page,selector){
  const box=await page.locator(selector).boundingBox();
  if(!box)return null;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.evaluate(({x,y})=>{
    const el=document.getElementById('clipGestureOverlay');if(!el)return;
    el.style.opacity='1';
    el.style.transform=`translate(${x-17}px,${y-17}px)`;
  },{x,y});
  await page.waitForTimeout(330);
  return {x,y,box};
}

async function pulseOverlay(page){
  await page.evaluate(()=>{
    const el=document.getElementById('clipGestureOverlay');if(el)el.style.scale='.82';
  });
  await page.waitForTimeout(120);
  await page.evaluate(()=>{
    const el=document.getElementById('clipGestureOverlay');if(el)el.style.scale='';
  });
  await page.waitForTimeout(130);
}

async function newRecordedPage(name,{mobile=false}={}){
  const viewport=mobile?{width:430,height:932}:{width:1536,height:864};
  const context=await browser.newContext({
    viewport,screen:viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,locale:'en-US',
    recordVideo:{dir:rawDir,size:viewport}
  });
  const page=await context.newPage();
  page.on('console',msg=>console.log('[browser console]',msg.type(),msg.text()));
  page.on('pageerror',error=>console.log('[browser error]',error.stack||error.message));
  await page.goto(baseURL+'/?captureClips=1',{waitUntil:'domcontentloaded'});
  try{await page.waitForFunction(()=>!!globalThis.GOSTOP_CAPTURE_API,null,{timeout:15000});}
  catch(error){
    console.log('capture mode diagnostic',await page.evaluate(()=>({captureMode:globalThis.GOSTOP_CAPTURE_MODE,api:!!globalThis.GOSTOP_CAPTURE_API,ready:document.readyState,href:location.href,scripts:[...document.scripts].map(s=>s.src)})));
    throw error;
  }
  await page.addStyleTag({content:`
    #soloStartOverlay,#howToDialog,#settingsDialog,#authDialog,.tutorial-video-view{display:none!important}
    html,body{overflow:hidden!important}
    .side-rail{opacity:.22}
  `});
  await page.evaluate(()=>{globalThis.GOSTOP_PERFORMANCE_LITE=false;});
  return {context,page,video:page.video(),name};
}

async function finish(rec,tailMs=1000){
  await rec.page.waitForTimeout(tailMs);
  await rec.context.close();
  const dest=path.join(rawDir,rec.name+'.webm');
  await rec.video.saveAs(dest);
  console.log('saved',dest);
}

const failedClips=[];
async function capture(name,options,runner){
  console.log('capturing',name);
  const rec=await newRecordedPage(name,options);
  try{
    await runner(rec.page);
  }catch(error){
    failedClips.push({name,error:String(error?.stack||error)});
    console.error('CLIP_FAILED',name,error?.stack||error);
  }finally{
    await finish(rec,options?.tailMs??1000);
  }
}

const baseDeck=['m12-3','m11-4','m10-4','m9-4','m8-4','m7-4','m6-4','m5-4','m4-4'];

await capture('01_pc_one_match_capture',{tailMs:1200},async page=>{
  await setScenario(page,{
    floor:['m2-2','m8-1','m10-3'],deck:baseDeck,
    human:{hand:['m2-1','m5-3','m9-3']},ai:{captured:['m7-3']}
  });
  await addGestureOverlay(page,'mouse');
  await moveOverlayTo(page,'#playerHand [data-card-id="m2-1"]');
  await pulseOverlay(page);
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.handHit({cardId:'m2-1',targetId:'m2-2',matchCount:1}));
});

await capture('02_mobile_tap_select_then_play',{mobile:true,tailMs:1600},async page=>{
  await setScenario(page,{
    floor:['m5-4','m8-1','m10-3'],deck:baseDeck,
    human:{hand:['m5-3','m6-3','m9-3']},ai:{captured:['m7-3']}
  });
  await addGestureOverlay(page,'touch');
  const pos=await moveOverlayTo(page,'#playerHand [data-card-id="m5-3"]');
  if(pos){
    await page.touchscreen.tap(pos.x,pos.y);
    await pulseOverlay(page);
    await page.waitForTimeout(850);
    const live=await page.locator('#playerHand [data-card-id="m5-3"]').boundingBox();
    if(live){
      const x=live.x+live.width/2,y=live.y+live.height/2;
      await page.evaluate(({x,y})=>{
        const el=document.getElementById('clipGestureOverlay');if(el)el.style.transform=`translate(${x-17}px,${y-17}px)`;
      },{x,y});
      await page.touchscreen.tap(x,y);
      await pulseOverlay(page);
    }
  }
  await page.waitForTimeout(1800);
});

await capture('03_mobile_flick_up_to_play',{mobile:true,tailMs:1800},async page=>{
  await setScenario(page,{
    floor:['m6-4','m8-1','m10-3'],deck:baseDeck,
    human:{hand:['m6-3','m5-3','m9-3']},ai:{captured:['m7-3']}
  });
  await addGestureOverlay(page,'touch');
  const pos=await moveOverlayTo(page,'#playerHand [data-card-id="m6-3"]');
  if(pos){
    const cdp=await page.context().newCDPSession(page);
    const startY=pos.y,endY=Math.max(80,startY-185);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pos.x,y:startY,radiusX:8,radiusY:8,force:1}]});
    await page.evaluate(()=>{const el=document.getElementById('clipGestureOverlay');if(el)el.style.scale='.82';});
    for(let i=1;i<=10;i++){
      const y=startY+(endY-startY)*(i/10);
      await page.evaluate(({x,y})=>{
        const el=document.getElementById('clipGestureOverlay');if(el)el.style.transform=`translate(${x-17}px,${y-17}px)`;
      },{x:pos.x,y});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pos.x,y,radiusX:8,radiusY:8,force:1}]});
      await page.waitForTimeout(34);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.evaluate(()=>{const el=document.getElementById('clipGestureOverlay');if(el)el.style.scale='';});
  }
  await page.waitForTimeout(2200);
});

await capture('04_no_match_card_stays_on_table',{},async page=>{
  await setScenario(page,{
    floor:['m8-1','m10-3'],deck:baseDeck,
    human:{hand:['m5-1','m9-3']},ai:{captured:['m7-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.handHit({cardId:'m5-1',matchCount:0}));
});

await capture('05_two_matching_targets_choose_one',{tailMs:1600},async page=>{
  await setScenario(page,{
    floor:['m2-2','m2-3','m8-1'],deck:baseDeck,
    human:{hand:['m2-1','m9-3']},ai:{captured:['m7-3']}
  });
  await addGestureOverlay(page,'mouse');
  await page.evaluate(()=>{void globalThis.GOSTOP_CAPTURE_API.interactivePlay('m2-1');});
  await page.waitForSelector('#floor .target-option',{timeout:5000});
  await page.waitForTimeout(850);
  await moveOverlayTo(page,'#floor [data-card-id="m2-2"]');
  await pulseOverlay(page);
  await page.locator('#floor [data-card-id="m2-2"]').click();
  await page.waitForTimeout(1800);
});

await capture('06_hand_hit_then_draw_match',{tailMs:1400},async page=>{
  await setScenario(page,{
    floor:['m2-2','m5-2','m8-1'],deck:['m5-1',...baseDeck],
    human:{hand:['m2-1','m9-3']},ai:{captured:['m7-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.fullTurn({
    cardId:'m2-1',targetId:'m2-2',drawId:'m5-1',drawTargetId:'m5-2',
    playMatchCount:1,drawMatchCount:1
  }));
});

await capture('07_draw_card_has_no_match',{tailMs:1400},async page=>{
  await setScenario(page,{
    floor:['m2-2','m8-1'],deck:['m6-1',...baseDeck],
    human:{hand:['m2-1','m9-3']},ai:{captured:['m7-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.fullTurn({
    cardId:'m2-1',targetId:'m2-2',drawId:'m6-1',playMatchCount:1,drawMatchCount:0
  }));
});

await capture('08_pooped_ppeok',{tailMs:1600},async page=>{
  await setScenario(page,{
    floor:['m4-1','m8-1'],deck:['m4-3',...baseDeck],
    human:{hand:['m4-2','m9-3']},ai:{captured:['m7-3','m8-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.fullTurn({
    cardId:'m4-2',targetId:'m4-1',drawId:'m4-3',drawTargetId:'m4-2',
    playMatchCount:1,drawMatchCount:2,specialLabel:'POOPED!'
  }));
});

await capture('09_kiss_jjok',{tailMs:1800},async page=>{
  await setScenario(page,{
    floor:['m8-1','m10-3'],deck:['m5-2',...baseDeck],
    human:{hand:['m5-1','m9-3']},ai:{captured:['m7-3','m8-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.fullTurn({
    cardId:'m5-1',drawId:'m5-2',drawTargetId:'m5-1',
    playMatchCount:0,drawMatchCount:1,specialLabel:'KISS!'
  }));
});

await capture('10_flush_ttadak',{tailMs:1800},async page=>{
  await setScenario(page,{
    floor:['m3-1','m3-2','m8-1'],deck:['m3-4',...baseDeck],
    human:{hand:['m3-3','m9-3']},ai:{captured:['m7-3','m8-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.fullTurn({
    cardId:'m3-3',targetId:'m3-1',drawId:'m3-4',drawTargetId:'m3-3',
    playMatchCount:2,drawMatchCount:3,specialLabel:'FLUSH!'
  }));
});

await capture('11_clean_sweep',{tailMs:1900},async page=>{
  await setScenario(page,{
    floor:['m10-1'],deck:baseDeck,
    human:{hand:['m10-2','m9-3']},ai:{captured:['m7-3','m8-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.fullTurn({
    cardId:'m10-2',targetId:'m10-1',playMatchCount:1
  }));
});

await capture('12_self_ppeok_capture',{tailMs:1500},async page=>{
  await setScenario(page,{
    floor:['m2-1','m2-2','m2-3','m8-1'],deck:baseDeck,
    floorStacks:{2:{month:2,cardIds:['m2-1','m2-2','m2-3'],source:'ppeok',owner:'playerA'}},
    human:{hand:['m2-4','m9-3']},ai:{captured:['m7-3','m8-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.handHit({cardId:'m2-4',targetId:'m2-3',matchCount:1}));
});

await capture('13_shake',{tailMs:1800},async page=>{
  await setScenario(page,{
    floor:['m8-1','m10-3'],deck:baseDeck,
    human:{hand:['m5-1','m5-2','m5-3','m9-3'],hiddenTripleMonths:[5]},ai:{captured:['m7-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.shake(5));
});

await capture('14_bomb',{tailMs:2100},async page=>{
  await setScenario(page,{
    floor:['m6-4','m8-1'],deck:['m7-3','m10-4','m11-4','m12-3'],
    human:{hand:['m6-1','m6-2','m6-3','m9-3'],hiddenTripleMonths:[6]},
    ai:{hand:['m10-3'],captured:['m7-4','m8-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.bomb(6));
});

await capture('15_go_stop_dialog',{tailMs:1900},async page=>{
  const captured=[
    'm1-1','m3-1','m8-1',
    'm1-2','m2-2','m3-2',
    'm1-3','m1-4','m2-3','m2-4','m3-3','m3-4','m4-3','m4-4','m5-3','m5-4'
  ];
  await setScenario(page,{
    floor:['m6-3','m8-3'],deck:baseDeck,
    human:{hand:['m9-3'],captured},ai:{captured:['m7-3']}
  });
  await page.evaluate(()=>globalThis.GOSTOP_CAPTURE_API.goStopDialog());
  await page.waitForTimeout(2200);
});

await browser.close();

const manifest=[
  ['01_pc_one_match_capture','PC hand card hits one matching table card and captures both.'],
  ['02_mobile_tap_select_then_play','Mobile tap once to select, tap again to play.'],
  ['03_mobile_flick_up_to_play','Mobile upward flick gesture with the actual GoStop Live touch interaction.'],
  ['04_no_match_card_stays_on_table','Played card has no family match and stays on the table.'],
  ['05_two_matching_targets_choose_one','Two legal table matches highlight; player chooses one.'],
  ['06_hand_hit_then_draw_match','Normal turn: hand capture followed by a draw-pile capture.'],
  ['07_draw_card_has_no_match','Drawn card has no match and remains on the table.'],
  ['08_pooped_ppeok','POOPED! / 뻑: played, table, and drawn cards form a three-card stack.'],
  ['09_kiss_jjok','KISS! / 쪽: unmatched played card is matched by the draw and steals a Single.'],
  ['10_flush_ttadak','FLUSH! / 따닥: two on table, third played, fourth drawn; capture all four and steal a Single.'],
  ['11_clean_sweep','CLEAN SWEEP! / 싹쓸이: capture clears the live table and steals a Single.'],
  ['12_self_ppeok_capture','Capture your own existing Ppeok stack.'],
  ['13_shake','SHAKE: reveal three same-family cards.'],
  ['14_bomb','BOMB: play three same-family cards onto the fourth and capture the family.'],
  ['15_go_stop_dialog','GO or STOP decision from an actual scoring state.']
];
fs.writeFileSync(path.join(outDir,'README.txt'),
  'GoStop Live! gameplay clip pack\n\n'+
  'Raw snippets from the actual GoStop Live! UI and animation system. No narration, subtitles, or music are baked in.\n\n'+
  manifest.map(([n,d])=>n+'.mp4\n  '+d).join('\n\n')+'\n'
);
if(failedClips.length){
  fs.writeFileSync(path.join(outDir,'CAPTURE_ERRORS.txt'),failedClips.map(item=>item.name+'\n'+item.error+'\n').join('\n'));
  console.log('capture completed with scenario errors',failedClips.map(item=>item.name));
}else{
  console.log('capture complete: all scenarios successful');
}
