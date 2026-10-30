import {test,expect} from '@playwright/test';

function fakeCloud(){
  const items=[];const finished=new Set();
  let learned=0,announceLiveActivation=false;
  return {items,completedCount:()=>finished.size,confirmNextLiveActivation:()=>{announceLiveActivation=true;},
    handle:async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      const reply=(status,obj)=>route.fulfill({status,contentType:'application/json',
        headers:{'access-control-allow-origin':'http://127.0.0.1:4173','access-control-allow-headers':'authorization,content-type'},
        body:JSON.stringify(obj)});
      if(request.headers()['authorization']!=='Bearer e2e-demo-token')return reply(401,{ok:false,error:'AUTH_REQUIRED'});
      if(path.endsWith('/state'))return reply(200,{ok:true,feedbackCount:items.length,
        confirmedCount:items.filter(x=>x.choice!=='unsure').length,model:{examples:learned}});
      if(path.endsWith('/history'))return reply(200,{ok:true,feedback:items.map(x=>({gameId:x.gameId,choice:x.choice,recommendedId:x.recommended.hand+'|'+x.recommended.target,playedId:x.played.hand+'|'+x.played.target}))});
      if(path.endsWith('/feedback')){
        const x=request.postDataJSON();items.push(x);return reply(200,{ok:true,confirmed:x.choice!=='unsure',feedbackCount:items.length});
      }
      if(path.endsWith('/complete')){
        const gameId=request.postDataJSON().gameId;
        if(!finished.has(gameId)){
          learned+=items.filter(x=>x.gameId===gameId&&x.choice!=='unsure').length;finished.add(gameId);
        }
        const publishedToLive=announceLiveActivation;
        announceLiveActivation=false;
        return reply(200,{ok:true,trained:learned,modelExamples:learned,publishedToLive});
      }
      return reply(404,{ok:false});
    }
  };
}
async function setup(page,email='expert@example.test',server=fakeCloud()){
  await page.route('**/mock-learning/**',server.handle);
  await page.goto('/training-learning/test-fixture.html');
  await page.setContent(`<!doctype html><html lang="en"><head></head><body>
    <button id="trainingModeBtn">Training</button>
    <button id="playSoloBtn">Friendly Solo</button><button id="quitYesBtn">Quit</button>
    <aside id="trainingCoachPanel"><strong id="trainingCoachTitle">Recommended Move</strong></aside>
    <div id="floor"><div class="floor-card training-recommended" data-card-id="m6-2"><img alt="Rose Ribbon"></div></div>
    <div id="playerHand">
      <button class="hand-card matchable" data-card-id="m6-3"><img alt="Rose Single"></button>
      <button class="hand-card" data-card-id="m6-4" id="alternate"><img alt="Rose Double Single"></button>
    </div><dialog id="resultDialog"></dialog>
  </body></html>`);
  await page.evaluate(async e=>{
    const cards=[
      {id:'m6-2',month:6,type:'ribbon',ribbonSet:'blue',flags:[]},
      {id:'m6-3',month:6,type:'pi',flags:[]},
      {id:'m6-4',month:6,type:'pi',flags:['doublePi']}
    ];
    // Match the real GoStopEngine API: masterDeck is an array, NOT a function.
    globalThis.GoStopEngine={masterDeck:cards};
    globalThis.GoStopRanked={getAccount:()=>e?{email:e}:null};
    globalThis.__GoStopLearningTestConfig={endpoint:'http://127.0.0.1:4173/mock-learning'};
    localStorage.setItem('gostop-auth-token','e2e-demo-token');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('expert@example.test'));
    globalThis.__GoStopFeedbackTestHash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    globalThis.__actualPlays=0;
    document.getElementById('alternate').addEventListener('click',()=>globalThis.__actualPlays++);
  },email);
  await page.addScriptTag({path:'training-learning/cloud-client.js'});
  await page.addScriptTag({path:'training-learning/feedback-ui.js'});
  await page.locator('#trainingModeBtn').click();
  await expect.poll(async()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().authorized)).toBe(email==='expert@example.test');
  if(email==='expert@example.test')await expect.poll(async()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().serverReady)).toBe(true);
  return server;
}
test('confirmed disagreement syncs to cloud and trains only after game completion',async({page})=>{
  const server=await setup(page);
  await page.locator('#alternate').click();
  const dialog=page.locator('#trainingFeedbackDialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>globalThis.__actualPlays)).toBe(1);
  await dialog.getByRole('button',{name:'My move was better'}).click();
  await expect(dialog).not.toBeVisible();
  expect(server.items).toHaveLength(1);
  expect(await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().modelExamples)).toBe(0);
  await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
  await expect.poll(async()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().modelExamples)).toBe(1);
});
test('mistaken move reinforces recommendation on the server',async({page})=>{
  const server=await setup(page);
  await page.locator('#alternate').click();
  await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'Recommendation was better'}).click();
  await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
  expect(server.items.at(-1).choice).toBe('recommended');
  expect(server.items.at(-1).recommended.hand).toBe('m6-3');
});
test('uncertain move is stored remotely but excluded from learning',async({page})=>{
  const server=await setup(page);
  await page.locator('#alternate').click();
  await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'Not sure / experiment'}).click();
  await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
  await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
  expect(server.items[0].choice).toBe('unsure');
  await expect.poll(async()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().modelExamples)).toBe(0);
});
test('shared development-account history is visible from a different browser page',async({browser})=>{
  const server=fakeCloud();
  const context1=await browser.newContext();
  const page1=await context1.newPage();
  await setup(page1,'expert@example.test',server);
  await page1.locator('#alternate').click();
  await page1.locator('#trainingFeedbackDialog').getByRole('button',{name:'My move was better'}).click();
  await expect(page1.locator('#trainingFeedbackDialog')).not.toBeVisible();
  const context2=await browser.newContext();
  const page2=await context2.newPage();
  await setup(page2,'expert@example.test',server);
  const status=await page2.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus());
  expect(status.examples).toBe(1);
  await context1.close();await context2.close();
});
test('feedback disabled for a different account',async({page})=>{
  await setup(page,'other@example.com');
  await page.locator('#alternate').click();
  await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
});
test('failed cloud saves do not train or claim success',async({page})=>{
  const server=fakeCloud();
  const route=server.handle;
  server.handle=async r=>new URL(r.request().url()).pathname.endsWith('/feedback')?
    r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'SERVER_UNAVAILABLE'})}):route(r);
  await setup(page,'expert@example.test',server);
  await page.locator('#alternate').click();
  const dialog=page.locator('#trainingFeedbackDialog');
  await dialog.getByRole('button',{name:'My move was better'}).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('SERVER_UNAVAILABLE');
  expect(server.items).toHaveLength(0);
});

test('successful live activation acknowledgement is required for update OK dialog',async({page})=>{
 const server=await setup(page);
 await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
 await expect.poll(()=>server.completedCount()).toBe(1);
 await expect(page.getByRole('dialog',{name:'Training model update'})).toHaveCount(0);
 await page.evaluate(()=>document.getElementById('resultDialog').removeAttribute('open'));
 await page.locator('#trainingModeBtn').click();
 server.confirmNextLiveActivation();
 await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
 const dialog=page.getByRole('dialog',{name:'Training model update'});
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('Update was made');
 await dialog.getByRole('button',{name:'OK'}).click();
 await expect(dialog).toHaveCount(0);
});

test('anonymous player still sees move disagreement but cannot submit expert learning',async({page})=>{
 const server=await setup(page,null);
 await page.locator('#alternate').click();
 const dialog=page.locator('#trainingFeedbackDialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('status')).toContainText('No feedback will be saved');
 await dialog.getByRole('button',{name:'My move was better'}).click();
 await expect(dialog.getByRole('alert')).toContainText('Not saved');
 expect(server.items).toHaveLength(0);
 await dialog.getByRole('button',{name:'OK'}).click();
 await expect(dialog).not.toBeVisible();
});
