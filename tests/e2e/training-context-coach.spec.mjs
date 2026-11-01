import {test,expect} from '@playwright/test';
const cards=[
 {id:'m2-1',month:2,type:'bright',flags:[]},
 {id:'m2-2',month:2,type:'ribbon',ribbonSet:'red',flags:[]},
 {id:'m2-3',month:2,type:'animal',flags:[]},
 {id:'m2-4',month:2,type:'pi',flags:[]},
 {id:'m1-1',month:1,type:'bright',flags:[]},
 {id:'m4-4',month:4,type:'pi',flags:['doublePi']},
 {id:'m4-2',month:4,type:'animal',flags:[]}
];
async function setup(page){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!DOCTYPE html><html lang="en"><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
 <div id="trainingCoachPanel" hidden><strong id="trainingCoachTitle">Recommended Move</strong><p id="trainingCoachText"></p></div>
 <div id="playerHand"></div><div id="floor"></div><div id="playerCaptured"></div><div id="aiCaptured"></div>
 </body></html>`);
 await page.evaluate(cards=>{globalThis.GoStopEngine={masterDeck:cards};},cards);
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-context-coach.js'});
 await page.addStyleTag({path:'dev-site/training-context-coach.css'});
 await expect.poll(()=>page.evaluate(()=>!!globalThis.GoStopDevTrainingContextCoach)).toBe(true);
 await page.locator('#trainingModeBtn').click();
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevTrainingContextCoach.getStatus().active)).toBe(true);
}
test('after deck flip two floor cards get a visible choice recommendation without preventing gameplay',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML='<button class="hand-card" data-card-id="m2-2" disabled>Hand card</button>';
  document.getElementById('floor').innerHTML=
   '<button class="floor-card target-option" data-card-id="m4-2">Picture</button>'+
   '<button class="floor-card target-option" data-card-id="m4-4">Double Single</button>';
  const stage=document.createElement('div');stage.className='physical-card';stage.dataset.cardId='m4-1';document.body.appendChild(stage);
  globalThis.__targetClicks=0;
  document.querySelectorAll('.target-option').forEach(el=>el.addEventListener('click',()=>globalThis.__targetClicks++));
 });
 const advice=page.locator('#devDrawTargetCoach');
 await expect(advice).toBeVisible();
 await expect(advice).toContainText('Choose');
 await expect(page.locator('#floor [data-card-id="m4-4"]')).toHaveClass(/dev-drawn-target-recommended/);
 await expect(page.locator('#floor [data-card-id="m4-2"]')).not.toHaveClass(/dev-drawn-target-recommended/);
 await page.locator('#floor [data-card-id="m4-2"]').click();
 expect(await page.evaluate(()=>globalThis.__targetClicks)).toBe(1);
 await page.evaluate(()=>document.querySelectorAll('.target-option').forEach(el=>el.classList.remove('target-option')));
 await expect(advice).toBeHidden();
});
test('normal hand-card target choice does not show a drawn-card hint',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML='<button class="hand-card pending-card" data-card-id="m4-2" disabled>Hand card</button>';
  document.getElementById('floor').innerHTML=
   '<button class="floor-card target-option" data-card-id="m4-2">Picture</button>'+
   '<button class="floor-card target-option" data-card-id="m4-4">Double Single</button>';
  const stage=document.createElement('div');stage.className='physical-card';stage.dataset.cardId='m4-1';document.body.appendChild(stage);
 });
 await page.waitForTimeout(75);
 await expect(page.locator('#devDrawTargetCoach')).toHaveCount(0);
});
test('Plum discard with all four cards accounted for shows short and accurate safe-recapture reasoning',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card" data-card-id="m2-1">Plum Bright</button>'+
   '<button class="hand-card matchable" data-card-id="m2-2" title="Plum Red Stripe">Plum Red Stripe</button>';
  document.getElementById('aiCaptured').innerHTML=
   '<img class="captured-mini" data-card-id="m2-3">'+
   '<img class="captured-mini" data-card-id="m2-4">';
  document.getElementById('trainingCoachPanel').hidden=false;
  document.getElementById('trainingCoachTitle').textContent='Recommended Move';
  document.getElementById('trainingCoachText').textContent='Play Plum Red Stripe. No card for capture is available on the table. You have another Plum card in hand, so this uses the lower-risk Plum card as bait while preserving the stronger Plum card.';
 });
 await expect(page.locator('#trainingCoachText')).toHaveText(
  'Discard Plum Red Stripe. You hold the only matching card, so you can take it back.');
});
test('text only removes unsupported hand-card sentence while retaining correct recommendation',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML='<button class="hand-card matchable" data-card-id="m2-2" title="Plum Red Stripe">Plum Red Stripe</button>';
  document.getElementById('floor').innerHTML='<div class="floor-card" data-card-id="m2-4">Plum Single</div>';
  document.getElementById('trainingCoachPanel').hidden=false;
  document.getElementById('trainingCoachTitle').textContent='Recommended Move';
  document.getElementById('trainingCoachText').textContent='Play Plum Red Stripe onto Plum Single. This uses the higher-value hand card.';
 });
 await expect(page.locator('#trainingCoachText')).toHaveText('Play Plum Red Stripe onto Plum Single.');
 await expect(page.locator('#floor [data-card-id="m2-4"]')).not.toHaveClass(/dev-drawn-target-recommended/);
});
test('non-training Solo UI stays unchanged',async({page})=>{
 await setup(page);
 await page.locator('#playSoloBtn').click();
 await page.evaluate(()=>{
  document.getElementById('trainingCoachPanel').hidden=false;
  document.getElementById('trainingCoachTitle').textContent='Recommended Move';
  document.getElementById('trainingCoachText').textContent='Play Plum Red Stripe. This uses the higher-value hand card.';
 });
 await page.waitForTimeout(75);
 await expect(page.locator('#trainingCoachText')).toContainText('This uses the higher-value hand card.');
});

test('context correction and recommendation preservation settle without freezing the browser',async({page})=>{
 await setup(page);
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 // The additional preserver joins an already running Training game.
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  globalThis.__copyMutations=0;
  const coach=document.getElementById('trainingCoachText');
  new MutationObserver(records=>globalThis.__copyMutations+=records.length)
    .observe(coach,{childList:true,characterData:true,subtree:true});
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card" data-card-id="m2-1">Plum Bright</button>'+
   '<button class="hand-card matchable" data-card-id="m2-2" title="Plum Red Stripe">Plum Red Stripe</button>';
  document.getElementById('aiCaptured').innerHTML=
   '<img class="captured-mini" data-card-id="m2-3">'+
   '<img class="captured-mini" data-card-id="m2-4">';
  document.getElementById('trainingCoachTitle').textContent='Recommended Move';
  coach.textContent='Play Plum Red Stripe. No card for capture is available.';
  document.getElementById('trainingCoachPanel').hidden=false;
 });
 const expected='Discard Plum Red Stripe. You hold the only matching card, so you can take it back.';
 await expect(page.locator('#trainingCoachText')).toHaveText(expected,{timeout:2000});
 // The original preserve observer and context copy must agree on the same
 // corrected text even while subsequent renders mutate disabled flags.
 await page.evaluate(()=>{
  const hand=document.getElementById('playerHand');
  for(let i=0;i<90;i++){
   const el=hand.querySelector('[data-card-id="m2-2"]');
   el.disabled=i%2===0;
   el.classList.toggle('preview-only',i%2===0);
  }
 });
 await page.waitForTimeout(280);
 await expect(page.locator('#trainingCoachText')).toHaveText(expected);
 expect(await page.evaluate(()=>globalThis.__copyMutations)).toBeLessThan(15);
 // The browser must still process timers/interaction instead of becoming
 // unresponsive in a queueMicrotask feedback loop.
 const responsive=await page.evaluate(()=>new Promise(resolve=>
  setTimeout(()=>resolve(true),40)));
 expect(responsive).toBe(true);
 expect((await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus())).locked).toBe(true);
});
