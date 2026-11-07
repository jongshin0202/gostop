import {test,expect} from '@playwright/test';

async function setup(page,{lang='en',floorCapture=false,blanks=2,disabled=false,training=true}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="${lang}"><head></head><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
 <aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle">RECOMMENDED MOVE</strong>
 <p id="trainingCoachText">Discard Vine Single. No capture is available.</p></aside>
 <div id="playerHand"><div class="hand-card-slot" data-hand-key="m4-4">
  <button class="hand-card" data-card-id="m4-4" title="Vine Single">Vine Single</button></div>
  <div class="hand-card-slot" data-hand-key="m10-2">
  <button class="hand-card" data-card-id="m10-2" title="Star Blue Stripe">Star Blue Stripe</button></div>
  ${Array.from({length:blanks},(_,i)=>`<div class="hand-card-slot" data-hand-key="blank-${i}">
   <button class="card hand-card blank-turn-card" aria-label="Use empty Bomb turn and flip from the deck"
   ${disabled?'disabled':''}><span>—</span></button></div>`).join('')}
 </div>
 <div id="floor"><div class="floor-card" data-card-id="m8-4">Hill</div>
 <div class="floor-card" data-card-id="${floorCapture?'m4-2':'m3-3'}">Cherry</div></div>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 <dialog id="shakeDialog"></dialog><dialog id="bombDialog"></dialog>
 <dialog id="gukjinDialog"></dialog><dialog id="decisionDialog"></dialog>
 <dialog id="resultDialog"></dialog></body></html>`);
 await page.addStyleTag({path:'styles.css'});
 await page.addStyleTag({path:'dev-site/training-recommendation-preserver.css'});
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-context-coach.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 if(training)await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-card-id="m4-4"]').classList.add('matchable');
  document.getElementById('trainingCoachPanel').hidden=false;
 });
}
for(const viewport of [{name:'desktop',width:1460,height:900},{name:'Android portrait',width:390,height:844}]){
 test('no capture: prefer Bomb blank over Vine Single on '+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await setup(page);
  await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().bombBlankOverride)).toBe(true);
  await expect(page.locator('.blank-turn-card').first()).toHaveClass(/matchable/);
  await expect(page.locator('#playerHand [data-card-id="m4-4"]')).not.toHaveClass(/matchable/);
  await expect(page.locator('#trainingCoachText')).toContainText('keep your real cards');
  await page.evaluate(()=>{
   globalThis.blankClicks=0;
   document.querySelector('.blank-turn-card').addEventListener('click',()=>globalThis.blankClicks++);
  });
  await page.locator('.blank-turn-card').first().click();
  expect(await page.evaluate(()=>globalThis.blankClicks)).toBe(1);
  await expect(page.locator('#playerHand [data-card-id="m4-4"]')).toHaveCount(1);
 });
}
test('available matching real-card capture takes priority over a Bomb blank',async({page})=>{
 await setup(page,{floorCapture:true});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().bombBlankOverride)).toBe(false);
 await expect(page.locator('#playerHand [data-card-id="m4-4"]')).toHaveClass(/matchable/);
 await expect(page.locator('.blank-turn-card.matchable')).toHaveCount(0);
});
test('no Bomb blanks, or disabled blanks, cannot trigger a blank suggestion',async({page})=>{
 await setup(page,{blanks:0});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
 expect(await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().bombBlankOverride)).toBe(false);
});
test('disabled Bomb blank is never highlighted or recommended',async({page})=>{
 await setup(page,{disabled:true});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
 expect(await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().bombBlankOverride)).toBe(false);
 await expect(page.locator('.blank-turn-card.matchable')).toHaveCount(0);
});
test('spending a Bomb blank invalidates the current recommendation lock',async({page})=>{
 await setup(page);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().bombBlankOverride)).toBe(true);
 await page.locator('#playerHand [data-hand-key="blank-0"]').evaluate(el=>el.remove());
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(false);
});
test('Korean training guidance preserves real hand cards',async({page})=>{
 await setup(page,{lang:'ko'});
 await page.evaluate(()=>document.getElementById('trainingCoachTitle').textContent='추천 수');
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().bombBlankOverride)).toBe(true);
 await expect(page.locator('#trainingCoachText')).toContainText('실제 손패를 보존');
});
test('outside Training mode Bomb blank advice never changes the game',async({page})=>{
 await setup(page,{training:false});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().active)).toBe(false);
 await expect(page.locator('#trainingCoachText')).toHaveText('Discard Vine Single. No capture is available.');
 await expect(page.locator('.blank-turn-card.matchable')).toHaveCount(0);
});
