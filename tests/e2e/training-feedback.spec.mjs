import {test,expect} from '@playwright/test';

function fakeCloud(){
  const items=[];const finished=new Set();
  let learned=0,specialLearned=0,goStopLearned=0,announceDevelopmentActivation=false;
  const kind=x=>x.context?.kind==='go-stop'?'go-stop':x.context?'special':'card';
  return {items,completedCount:()=>finished.size,confirmNextDevelopmentActivation:()=>{announceDevelopmentActivation=true;},
    handle:async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      const reply=(status,obj)=>route.fulfill({status,contentType:'application/json',
        headers:{'access-control-allow-origin':'http://127.0.0.1:4173','access-control-allow-headers':'authorization,content-type'},
        body:JSON.stringify(obj)});
      if(request.headers()['authorization']!=='Bearer e2e-demo-token')return reply(401,{ok:false,error:'AUTH_REQUIRED'});
      if(path.endsWith('/state'))return reply(200,{ok:true,feedbackCount:items.length,
        confirmedCount:items.filter(x=>x.choice!=='unsure').length,model:{examples:learned},specialModel:{examples:specialLearned},goStopModel:{examples:goStopLearned}});
      if(path.endsWith('/history'))return reply(200,{ok:true,feedback:items.map(x=>x.context?{gameId:x.gameId,kind:kind(x),choice:x.choice,recommendedAction:x.recommendedAction,playedAction:x.playedAction}:{gameId:x.gameId,choice:x.choice,recommendedId:x.recommended.hand+'|'+x.recommended.target,playedId:x.played.hand+'|'+x.played.target})});
      if(path.endsWith('/feedback')||path.endsWith('/special-feedback')||path.endsWith('/go-stop-feedback')){
        const x=request.postDataJSON();items.push(x);return reply(200,{ok:true,confirmed:x.choice!=='unsure',feedbackCount:items.length});
      }
      if(path.endsWith('/review')){
        const gameId=new URL(request.url()).searchParams.get('gameId');
        const rows=items.filter(x=>x.gameId===gameId).map(x=>{
          const type=kind(x);
          return {id:type+':'+x.feedbackId,kind:type,choice:x.choice,
            ...(type!=='card'?{recommendedAction:x.recommendedAction,
              playedAction:x.playedAction,context:x.context}:{
              recommendedId:x.recommended.hand+'|'+(x.recommended.target||'-'),
              playedId:x.played.hand+'|'+(x.played.target||'-')})};
        });
        return reply(200,{ok:true,gameId,items:rows,
          complete:finished.has(gameId),reviewVersion:'fixture-review-version'});
      }
      if(path.endsWith('/finalize')){
        const body=request.postDataJSON(),gameId=body.gameId;
        if(body.reviewVersion!=='fixture-review-version')
          return reply(409,{ok:false,error:'REVIEW_CHANGED'});
        const original=items.filter(x=>x.gameId===gameId);
        const ids=original.map(x=>kind(x)+':'+x.feedbackId);
        if(!Array.isArray(body.keptFeedbackIds)||
           body.keptFeedbackIds.some(id=>!ids.includes(id)))
          return reply(400,{ok:false,error:'INVALID_FINAL_SELECTION'});
        if(!finished.has(gameId)){
          const kept=new Set(body.keptFeedbackIds);
          const accepted=original.filter(x=>kept.has(kind(x)+':'+x.feedbackId));
          learned+=accepted.filter(x=>!x.context&&x.choice!=='unsure').length;
          specialLearned+=accepted.filter(x=>kind(x)==='special'&&x.choice!=='unsure').length;
          goStopLearned+=accepted.filter(x=>kind(x)==='go-stop'&&x.choice!=='unsure').length;
          for(let i=items.length-1;i>=0;i--){
            const item=items[i];
            if(item.gameId===gameId&&!kept.has(kind(item)+':'+item.feedbackId))
              items.splice(i,1);
          }
          finished.add(gameId);
        }
        const update=announceDevelopmentActivation;
        announceDevelopmentActivation=false;
        return reply(200,{ok:true,trained:learned+specialLearned+goStopLearned,
          modelExamples:learned,specialModelExamples:specialLearned,goStopModelExamples:goStopLearned,
          publishedToLive:false,developmentModelUpdated:update});
      }
      if(path.endsWith('/complete')){
        const gameId=request.postDataJSON().gameId;
        if(!finished.has(gameId)){
          learned+=items.filter(x=>x.gameId===gameId&&!x.context&&x.choice!=='unsure').length;
          specialLearned+=items.filter(x=>x.gameId===gameId&&kind(x)==='special'&&x.choice!=='unsure').length;
          goStopLearned+=items.filter(x=>x.gameId===gameId&&kind(x)==='go-stop'&&x.choice!=='unsure').length;
          finished.add(gameId);
        }
        const developmentModelUpdated=announceDevelopmentActivation;
        announceDevelopmentActivation=false;
        return reply(200,{ok:true,trained:learned+specialLearned+goStopLearned,modelExamples:learned,specialModelExamples:specialLearned,goStopModelExamples:goStopLearned,publishedToLive:false,developmentModelUpdated});
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
      {id:'m6-1',month:6,type:'bright',flags:[]},
      {id:'m6-2',month:6,type:'ribbon',ribbonSet:'blue',flags:[]},
      {id:'m6-3',month:6,type:'pi',flags:[]},
      {id:'m6-4',month:6,type:'pi',flags:['doublePi']},
      {id:'m11-1',month:11,type:'ribbon',flags:[]},
      {id:'m11-2',month:11,type:'bright',flags:[]},
      {id:'m11-3',month:11,type:'pi',flags:[]}
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
async function showFinalReview(page){
 await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
 const dialog=page.locator('#trainingFinalReviewDialog');
 await expect(dialog).toBeVisible({timeout:5000});
 return dialog;
}
async function finishFinalReview(page){
 const dialog=await showFinalReview(page);
 await dialog.getByRole('button',{name:'Finish'}).click();
 await expect(dialog).toBeHidden({timeout:5000});
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
  await finishFinalReview(page);
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
  await finishFinalReview(page);
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
test('other accounts can review a disagreement but cannot submit training data',async({page})=>{
  const server=await setup(page,'other@example.com');
  await page.locator('#alternate').click();
  const dialog=page.locator('#trainingFeedbackDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('No feedback will be saved');
  expect(server.items).toHaveLength(0);
  await dialog.getByRole('button',{name:'OK'}).click();
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

test('ordinary completed Training game never shows a false live-update dialog',async({page})=>{
 const server=await setup(page);
 await finishFinalReview(page);
 await expect.poll(()=>server.completedCount()).toBe(1);
 await expect(page.getByRole('dialog',{name:'Training model update'})).toHaveCount(0);
});
test('acknowledged development-only server activation permits update OK dialog',async({page})=>{
 const server=await setup(page);
 server.confirmNextDevelopmentActivation();
 await finishFinalReview(page);
 await expect.poll(()=>server.completedCount()).toBe(1);
 const dialog=page.getByRole('dialog',{name:'Training model update'});
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('Update was made');
 await dialog.getByRole('button',{name:'OK'}).click();
 await expect(dialog).toHaveCount(0);
});

async function showSpecialChoice(page,{kind='shake',bombReady=false}={}){
 await page.evaluate(({kind,bombReady})=>{
  // Build the same DOM affordances the frozen game uses; its actual input
  // remains independently bound and must not be canceled by feedback.
  const hand=document.getElementById('playerHand');
  for(const id of ['m11-1','m11-2','m11-3']){
    const card=document.createElement('button');card.className='hand-card';
    card.dataset.cardId=id;card.disabled=true;hand.append(card);
  }
  const dialog=document.createElement('dialog');
  dialog.id=kind==='shake'?'shakeDialog':'bombDialog';
  const cards='<div class="shake-cards">'+['m11-1','m11-2','m11-3']
    .map(id=>'<span class="magnified-card" data-card-id="'+id+'"></span>').join('')+'</div>';
  const actions=kind==='shake'?
    '<button id="shakeBtn" class="'+(bombReady?'':'training-choice-recommended')+'">Shake</button>'+
    '<button id="keepSecretBtn" class="'+(bombReady?'training-choice-recommended':'')+'">Bomb/Keep</button>':
    '<button id="bombBtn" class="training-choice-recommended">Bomb</button>'+
    '<button id="playOneBtn">Play One</button>';
  dialog.innerHTML=cards+actions;
  document.body.append(dialog);dialog.showModal();
  globalThis.__specialClicks=0;
  dialog.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    globalThis.__specialClicks++;
    dialog.close();
  }));
 },{kind,bombReady});
}
test('Shake recommended, Keep for Bomb chosen: prompts, saves confirmation, trains only after game completion',async({page})=>{
 const server=await setup(page);
 await showSpecialChoice(page,{kind:'shake'});
 await page.locator('#keepSecretBtn').click();
 const dlg=page.locator('#trainingFeedbackDialog');
 await expect(dlg).toBeVisible();
 await expect(dlg).toContainText('Shake (×4)');
 await expect(dlg).toContainText('Keep for Bomb');
 expect(await page.evaluate(()=>globalThis.__specialClicks)).toBe(1);
 await dlg.getByRole('button',{name:'My move was better'}).click();
 await expect(dlg).not.toBeVisible();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].context).toMatchObject({kind:'shake',month:11,bombReady:false});
 expect(server.items[0].recommendedAction).toBe('shake');
 expect(server.items[0].playedAction).toBe('keepForBomb');
 expect(server.items[0].choice).toBe('mine');
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().specialModelExamples)).toBe(0);
 await finishFinalReview(page);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().specialModelExamples)).toBe(1);
});
test('Bomb recommended in Shake dialog but expert chooses Shake: uncertain feedback stays untrained',async({page})=>{
 const server=await setup(page);
 await showSpecialChoice(page,{kind:'shake',bombReady:true});
 await page.locator('#shakeBtn').click();
 const dlg=page.locator('#trainingFeedbackDialog');
 await expect(dlg).toBeVisible();
 await expect(dlg).toContainText('Recommendation: Bomb');
 await expect(dlg).toContainText('Your move: Shake (×4)');
 await dlg.getByRole('button',{name:'Not sure / experiment'}).click();
 await expect(dlg).not.toBeVisible();
 expect(server.items[0].choice).toBe('unsure');
 expect(server.items[0].recommendedAction).toBe('bomb');
 expect(server.items[0].playedAction).toBe('shake');
 await finishFinalReview(page);
 await expect.poll(()=>server.completedCount()).toBe(1);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().specialModelExamples)).toBe(0);
});
test('Bomb recommended, Play One selected: review reinforces recommendation and records special decision',async({page})=>{
 const server=await setup(page);
 await showSpecialChoice(page,{kind:'bomb',bombReady:true});
 await page.locator('#playOneBtn').click();
 const dlg=page.locator('#trainingFeedbackDialog');
 await expect(dlg).toBeVisible();
 await expect(dlg).toContainText('Recommendation: Bomb');
 await expect(dlg).toContainText('Your move: Play One');
 await dlg.getByRole('button',{name:'Recommendation was better'}).click();
 await expect(dlg).not.toBeVisible();
 expect(server.items[0].context.kind).toBe('bomb');
 expect(server.items[0].choice).toBe('recommended');
});
test('following the special recommendation never prompts',async({page})=>{
 await setup(page);
 await showSpecialChoice(page,{kind:'shake',bombReady:false});
 await page.locator('#shakeBtn').click();
 await page.waitForTimeout(350);
 await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
});
test('guest can see Shake/Bomb comparison without persisting unapproved feedback',async({page})=>{
 const server=await setup(page,null);
 await showSpecialChoice(page,{kind:'shake',bombReady:true});
 await page.locator('#shakeBtn').click();
 const dlg=page.locator('#trainingFeedbackDialog');
 await expect(dlg).toBeVisible();
 await expect(dlg.getByRole('status')).toContainText('No feedback will be saved');
 await dlg.getByRole('button',{name:'OK'}).click();
 expect(server.items).toHaveLength(0);
});
test('special decision observer does not operate outside Training Mode',async({page})=>{
 await setup(page);
 await page.locator('#playSoloBtn').click();
 await showSpecialChoice(page,{kind:'bomb',bombReady:true});
 await page.locator('#playOneBtn').click();
 await page.waitForTimeout(350);
 await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
});


test('mobile flick custom hand activation shows feedback for a different recommended card',async({page})=>{
 const server=await setup(page);
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('gostop-hand-activate',{
  bubbles:true,detail:{cardId:'m6-4'}
 })));
 const modal=page.locator('#trainingFeedbackDialog');
 await expect(modal).toBeVisible();
 await expect(modal).toContainText('Rose Double Single');
 await modal.getByRole('button',{name:'My move was better'}).click();
 await expect(modal).toBeHidden();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].recommended.hand).toBe('m6-3');
 expect(server.items[0].played.hand).toBe('m6-4');
});
test('feedback retains original recommendation when game clears the glowing hint on play',async({page})=>{
 const server=await setup(page);
 await page.evaluate(()=>{
  document.dispatchEvent(new CustomEvent('gostop-hand-activate',{bubbles:true,detail:{cardId:'m6-4'}}));
  document.querySelector('.hand-card.matchable')?.classList.remove('matchable');
  document.querySelector('.floor-card.training-recommended')?.classList.remove('training-recommended');
 });
 const modal=page.locator('#trainingFeedbackDialog');
 await expect(modal).toBeVisible();
 await modal.getByRole('button',{name:'Recommendation was better'}).click();
 await expect(modal).toBeHidden();
 expect(server.items[0].recommended).toEqual({hand:'m6-3',target:'m6-2'});
});
test('different hand card with two table targets waits for the selected target and compares to the ORIGINAL recommendation',async({page})=>{
 const server=await setup(page);
 await page.evaluate(()=>{
  const floor=document.getElementById('floor');
  floor.insertAdjacentHTML('beforeend','<div class="floor-card" data-card-id="m6-1"><img alt="Rose Bright"></div>');
 });
 await page.locator('#alternate').click();
 await expect(page.locator('#trainingFeedbackDialog')).toBeHidden();
 await page.evaluate(()=>{
  // The frozen game can temporarily highlight the currently selected card's
  // target. It must NOT rewrite the opening recommended move for feedback.
  document.querySelector('#floor [data-card-id="m6-2"]').classList.remove('training-recommended');
  document.querySelector('#floor [data-card-id="m6-1"]').classList.add('training-recommended');
  document.querySelector('#playerHand .matchable')?.classList.remove('matchable');
  document.querySelectorAll('#floor [data-card-id]').forEach(el=>el.classList.add('target-option'));
 });
 await page.locator('#floor [data-card-id="m6-1"]').click();
 const modal=page.locator('#trainingFeedbackDialog');
 await expect(modal).toBeVisible();
 await modal.getByRole('button',{name:'My move was better'}).click();
 await expect(modal).toBeHidden();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].recommended).toEqual({hand:'m6-3',target:'m6-2'});
 expect(server.items[0].played).toEqual({hand:'m6-4',target:'m6-1'});
});
test('following a recommended card does not create a false disagreement',async({page})=>{
 const server=await setup(page);
 await page.locator('#playerHand .hand-card.matchable').click();
 await page.waitForTimeout(330);
 await expect(page.locator('#trainingFeedbackDialog')).toBeHidden();
 expect(server.items).toHaveLength(0);
});

test('endgame Remove requires Yes, No preserves the judgment, Finish trains only remaining choices',async({page})=>{
 const server=await setup(page);
 await page.locator('#alternate').click();
 await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'My move was better'}).click();
 await expect(page.locator('#trainingFeedbackDialog')).toBeHidden();
 await showSpecialChoice(page,{kind:'shake'});
 await page.locator('#keepSecretBtn').click();
 await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'Recommendation was better'}).click();
 await expect(page.locator('#trainingFeedbackDialog')).toBeHidden();
 expect(server.items).toHaveLength(2);
 const dialog=await showFinalReview(page);
 await expect(dialog.locator('.training-final-row')).toHaveCount(2);
 await expect(dialog).toContainText('Recommendation');
 const first=dialog.locator('.training-final-row').first();
 await first.getByRole('button',{name:'Remove'}).click();
 let confirm=page.locator('#trainingReviewRemoveConfirm');
 await expect(confirm).toBeVisible();
 await expect(confirm).toContainText('Are you sure?');
 await confirm.getByRole('button',{name:'No'}).click();
 await expect(confirm).toBeHidden();
 await expect(dialog.locator('.training-final-row')).toHaveCount(2);
 await dialog.locator('.training-final-row').first().getByRole('button',{name:'Remove'}).click();
 confirm=page.locator('#trainingReviewRemoveConfirm');
 await confirm.getByRole('button',{name:'Yes'}).click();
 await expect(confirm).toBeHidden();
 await expect(dialog.locator('.training-final-row')).toHaveCount(1);
 expect(server.items).toHaveLength(2,'deletion is staged, not committed before Finish');
 expect(server.completedCount()).toBe(0);
 await dialog.getByRole('button',{name:'Finish'}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>server.completedCount()).toBe(1);
 expect(server.items).toHaveLength(1);
 expect(server.items[0].context.kind).toBe('shake');
 expect((await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus())).modelExamples).toBe(0);
 expect((await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus())).specialModelExamples).toBe(1);
});
test('removing all incorrect expert labels still allows Finish without training',async({page})=>{
 const server=await setup(page);
 await page.locator('#alternate').click();
 await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'My move was better'}).click();
 const dialog=await showFinalReview(page);
 await dialog.locator('.training-final-row').getByRole('button',{name:'Remove'}).click();
 await page.locator('#trainingReviewRemoveConfirm').getByRole('button',{name:'Yes'}).click();
 await expect(dialog.locator('.training-final-row')).toHaveCount(0);
 await dialog.getByRole('button',{name:'Finish'}).click();
 await expect(dialog).toBeHidden();
 expect(server.items).toHaveLength(0);
 expect(server.completedCount()).toBe(1);
 expect((await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus())).modelExamples).toBe(0);
});
test('server failure during final Finish retains review and does not claim learning',async({page})=>{
 const server=fakeCloud(),original=server.handle;
 server.handle=async route=>new URL(route.request().url()).pathname.endsWith('/finalize')?
   route.fulfill({status:503,contentType:'application/json',
     body:JSON.stringify({ok:false,error:'FINALIZE_UNAVAILABLE'})}):original(route);
 await setup(page,'expert@example.test',server);
 await page.locator('#alternate').click();
 await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'My move was better'}).click();
 const dialog=await showFinalReview(page);
 await dialog.getByRole('button',{name:'Finish'}).click();
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('#trainingFinalReviewStatus')).toContainText('FINALIZE_UNAVAILABLE');
 expect(server.completedCount()).toBe(0);
});

async function showGoStopChoice(page,{recommended='stop',opponentScore=2,hasMatch=true,
 handCount=1,nativeReason='STOP. Only one scoring turn remains.'}={}){
 await page.evaluate(({recommended,opponentScore,hasMatch,handCount,nativeReason})=>{
  const hand=document.getElementById('playerHand');
  hand.innerHTML=(handCount===0?[]:handCount===1?['m6-3']:['m6-3','m6-4'])
   .map(id=>'<button class="hand-card" data-card-id="'+id+'">'+id+'</button>').join('');
  document.getElementById('floor').innerHTML='<div class="floor-card" data-card-id="'+
   (hasMatch?'m6-2':'m11-1')+'"></div>';
  const info=document.createElement('div');
  info.innerHTML='<span id="playerScore">8</span><span id="aiScore">'+
    opponentScore+'</span><span id="goCount">0</span>';
  document.body.append(info);
  const coach=document.createElement('p');coach.id='trainingCoachText';coach.textContent=nativeReason;
  document.getElementById('trainingCoachPanel').append(coach);
  const dialog=document.createElement('dialog');dialog.id='decisionDialog';
  dialog.innerHTML='<button id="goBtn" class="'+
   (recommended==='go'?'training-choice-recommended':'')+'">GO</button>'+
   '<button id="stopBtn" class="'+
   (recommended==='stop'?'training-choice-recommended':'')+'">STOP</button>';
  document.body.append(dialog);
  window.__decisionClicks=0;
  dialog.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
   window.__decisionClicks++;dialog.close();
   if(button.id==='stopBtn')document.getElementById('resultDialog').showModal();
  }));
 },{recommended,opponentScore,hasMatch,handCount,nativeReason});
 await page.addScriptTag({path:'dev-site/training-go-stop-advice.js'});
 await page.evaluate(()=>document.getElementById('decisionDialog').show());
 await expect(page.locator('#decisionDialog')).toBeVisible();
}
test('GO instead of recommended STOP asks expert and appears in endgame review',async({page})=>{
 const server=await setup(page);
 await showGoStopChoice(page,{opponentScore:2,hasMatch:true});
 await expect(page.locator('#stopBtn')).toHaveClass(/training-choice-recommended/);
 await page.locator('#goBtn').click();
 const prompt=page.locator('#trainingFeedbackDialog');
 await expect(prompt).toBeVisible();
 await expect(prompt).toContainText('Recommendation: STOP');
 await expect(prompt).toContainText('Your move: GO');
 expect(await page.evaluate(()=>window.__decisionClicks)).toBe(1);
 await prompt.getByRole('button',{name:'My move was better'}).click();
 await expect(prompt).toBeHidden();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].context.kind).toBe('go-stop');
 expect(server.items[0].context.opponentScore).toBe(2);
 await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
 const review=page.locator('#trainingFinalReviewDialog');
 await expect(review).toBeVisible();
 await expect(review.locator('.training-final-row')).toHaveCount(1);
 await expect(review).toContainText('GO / STOP');
 await expect(review).toContainText('Your move: GO');
 await review.getByRole('button',{name:'Finish'}).click();
 await expect(review).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().goStopModelExamples)).toBe(1);
 expect((await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus())).specialModelExamples).toBe(0);
});
test('one last matching card and zero-point opponent changes native STOP advice to GO',async({page})=>{
 const server=await setup(page);
 await showGoStopChoice(page,{opponentScore:0,hasMatch:true});
 await expect(page.locator('#goBtn')).toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#stopBtn')).not.toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#trainingCoachText')).toContainText('computer has 0 points');
 await page.locator('#goBtn').click();
 await expect(page.locator('#trainingFeedbackDialog')).toBeHidden();
 expect(server.items).toHaveLength(0,'following corrected advice is no disagreement');
 expect(await page.evaluate(()=>window.__decisionClicks)).toBe(1);
});
test('GO recommendation is not forced with no match or visible immediate finishing threat',async({page})=>{
 await setup(page);
 await showGoStopChoice(page,{opponentScore:0,hasMatch:false});
 await expect(page.locator('#stopBtn')).toHaveClass(/training-choice-recommended/);
 await page.evaluate(()=>document.getElementById('decisionDialog').close());
 await page.locator('#decisionDialog').evaluate(el=>el.remove());
 await page.locator('#trainingCoachText').evaluate(el=>el.remove());
 // The urgent warning prevents a simplistic score-zero override.
 await page.evaluate(()=>{
  document.getElementById('floor').innerHTML='<div class="floor-card" data-card-id="m6-2"></div>';
  const d=document.createElement('dialog');d.id='decisionDialog';
  d.innerHTML='<button id="goBtn">GO</button><button id="stopBtn" class="training-choice-recommended">STOP</button>';
  document.body.append(d);
  const msg=document.createElement('p');msg.id='trainingCoachText';
  msg.textContent='STOP. The computer is at 0. If it captures two major sets, enough to reach the finish threshold.';
  document.getElementById('trainingCoachPanel').append(msg);
 });
 // Reload the isolated advisor so it observes this new dialog node.
 await page.addScriptTag({path:'dev-site/training-go-stop-advice.js'});
 await page.evaluate(()=>document.getElementById('decisionDialog').show());
 await expect(page.locator('#stopBtn')).toHaveClass(/training-choice-recommended/);
});
test('STOP against GO prompts before final review and Finish keeps the judgment',async({page})=>{
 const server=await setup(page);
 await showGoStopChoice(page,{recommended:'go',opponentScore:4,hasMatch:true});
 await page.locator('#stopBtn').click();
 const prompt=page.locator('#trainingFeedbackDialog');
 await expect(prompt).toBeVisible();
 await expect(page.locator('#trainingFinalReviewDialog')).toBeHidden();
 await prompt.getByRole('button',{name:'Recommendation was better'}).click();
 const review=page.locator('#trainingFinalReviewDialog');
 await expect(review).toBeVisible();
 await expect(review.locator('.training-final-row')).toHaveCount(1);
 await expect(review).toContainText('Recommendation: GO');
 await review.getByRole('button',{name:'Finish'}).click();
 await expect(review).toBeHidden();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].recommendedAction).toBe('go');
 expect(server.items[0].playedAction).toBe('stop');
});

test('zero cards remaining does not drop a valid GO against STOP disagreement',async({page})=>{
 const server=await setup(page);
 await showGoStopChoice(page,{recommended:'stop',opponentScore:1,handCount:0});
 await page.locator('#goBtn').click();
 const modal=page.locator('#trainingFeedbackDialog');
 await expect(modal).toBeVisible();
 await expect(modal).toContainText('Recommendation: STOP');
 await expect(modal).toContainText('Your move: GO');
 await modal.getByRole('button',{name:'My move was better'}).click();
 await expect(modal).toBeHidden();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].context.remainingCards).toBe(0);
 const review=await showFinalReview(page);
 await expect(review.locator('.training-final-row')).toHaveCount(1);
 await expect(review).toContainText('GO / STOP');
 await review.getByRole('button',{name:'Finish'}).click();
 await expect(review).toBeHidden();
});
test('playing a 3-card ppeok pile against the original recommendation triggers expert feedback',async({page})=>{
 const server=await setup(page);
 await page.evaluate(()=>{
  const hand=document.getElementById('playerHand');
  hand.innerHTML='<button class="hand-card matchable" data-card-id="m11-1" id="otherCapture">Star</button>'+
   '<button class="hand-card" data-card-id="m6-4" id="pileCapture">Vine</button>';
  const floor=document.getElementById('floor');
  floor.innerHTML='<div class="floor-card training-recommended" data-card-id="m11-2">Star</div>'+
   '<div class="floor-stack-three" data-stack-month="6">'+
   '<div class="floor-card" data-card-id="m6-1"></div>'+
   '<div class="floor-card" data-card-id="m6-2"></div>'+
   '<div class="floor-card" data-card-id="m6-3"></div></div>';
  document.getElementById('trainingCoachPanel').hidden=false;
 });
 await page.waitForTimeout(80);
 await page.locator('#pileCapture').click();
 const modal=page.locator('#trainingFeedbackDialog');
 await expect(modal).toBeVisible();
 await expect(modal).toContainText('Recommendation');
 await expect(modal).toContainText('Your move');
 await modal.getByRole('button',{name:'My move was better'}).click();
 await expect(modal).toBeHidden();
 expect(server.items).toHaveLength(1);
 expect(server.items[0].recommended).toEqual({hand:'m11-1',target:'m11-2'});
 expect(server.items[0].played).toEqual({hand:'m6-4',target:'m6-3'});
 const review=await showFinalReview(page);
 await expect(review.locator('.training-final-row')).toHaveCount(1);
 await review.getByRole('button',{name:'Finish'}).click();
 await expect(review).toBeHidden();
});
