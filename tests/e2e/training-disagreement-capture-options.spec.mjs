import {test,expect} from '@playwright/test';
async function fixture(page,{lang='en',roseFloor=true,training=true}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="${lang}"><head></head><body>
  <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
  <aside id="trainingCoachPanel" hidden>
   <strong id="trainingCoachTitle">RECOMMENDED MOVE</strong>
   <p id="trainingCoachText">Play Vine Single onto Vine Bird Picture. This is the only available capture.</p>
  </aside>
  <div id="playerHand">
   <button class="hand-card" data-card-id="m4-4" title="Vine Single">Vine Single</button>
   <button class="hand-card" data-card-id="m6-2" title="Rose Stripe">Rose Stripe</button>
  </div>
  <div id="floor">
   <div class="floor-card" data-card-id="m8-1" title="Hill Bright">Hill Bright</div>
   <div class="floor-card" data-card-id="m4-1" title="Vine Bird Picture">Vine Bird Picture</div>
   <div class="floor-card" data-card-id="m12-2">Willow Picture</div>
   ${roseFloor?'<div class="floor-card" data-card-id="m6-3" title="Rose Single">Rose Single</div>':''}
  </div>
  <div id="playerCaptured"></div><div id="aiCaptured"></div>
  <dialog id="shakeDialog"></dialog><dialog id="bombDialog"></dialog>
  <dialog id="gukjinDialog"></dialog><dialog id="decisionDialog"></dialog>
  <dialog id="resultDialog"></dialog></body></html>`);
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-context-coach.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.addScriptTag({path:'training-learning/feedback-ui.js'});
 if(training)await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-card-id="m4-4"]').classList.add('matchable');
  document.querySelector('#floor [data-card-id="m4-1"]').classList.add('training-recommended');
  document.getElementById('trainingCoachPanel').hidden=false;
 });
 if(training)await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
}
for(const viewport of [{name:'PC',width:1504,height:1020},{name:'Android portrait',width:390,height:844}]){
 test('Vine and Rose are both captures, Rose alternative triggers expert feedback on '+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await fixture(page);
  await expect(page.locator('#trainingCoachText')).not.toContainText('only available capture');
  await expect(page.locator('#trainingCoachText')).toContainText('Rose');
  await page.locator('#playerHand [data-card-id="m6-2"]').click();
  await expect(page.locator('#trainingFeedbackDialog')).toBeVisible();
  await expect(page.locator('#trainingFeedbackDialog')).toContainText('Vine');
  await expect(page.locator('#trainingFeedbackDialog')).toContainText('Rose');
  expect(await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().active)).toBe(true);
 });
}
test('mobile flick preselection of Rose cannot erase the original Vine advice',async({page})=>{
 await fixture(page);
 await page.locator('#playerHand [data-card-id="m6-2"]').dispatchEvent('pointerdown');
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-card-id="m4-4"]').classList.remove('matchable');
  document.querySelector('#playerHand [data-card-id="m6-2"]').classList.add('matchable');
  document.dispatchEvent(new CustomEvent('gostop-hand-activate',{detail:{cardId:'m6-2'}}));
 });
 await expect(page.locator('#trainingFeedbackDialog')).toBeVisible();
 await expect(page.locator('#trainingFeedbackDialog')).toContainText('Vine');
});
test('following the Vine recommendation does not create a false disagreement',async({page})=>{
 await fixture(page);
 await page.locator('#playerHand [data-card-id="m4-4"]').click();
 await page.waitForTimeout(350);
 await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
});
test('without a Rose table match, the one available Vine capture is accurately described',async({page})=>{
 await fixture(page,{roseFloor:false});
 await expect(page.locator('#trainingCoachText')).toContainText('only available capture');
});
test('ordinary play cannot trigger Training feedback or rewrite its recommendation',async({page})=>{
 await fixture(page,{training:false});
 await page.locator('#playerHand [data-card-id="m6-2"]').click();
 await page.waitForTimeout(300);
 expect(await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().active)).toBe(false);
 await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
});
