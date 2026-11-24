import {test,expect} from '@playwright/test';
async function setup(page,{locked=true,language='en'}={}){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="${language}"><body>
 <button id="trainingModeBtn">Training</button>
 <button id="playSoloBtn">Solo</button>
 <div id="trainingCoachPanel" hidden>
  <strong id="trainingCoachTitle">Recommended Move</strong>
  <p id="trainingCoachText"></p>
 </div>
 <div id="playerHand">
  <button class="hand-card matchable" data-card-id="m6-1" title="Rose Picture">Rose Picture</button>
  <button class="hand-card" data-card-id="m12-2" title="Willow Picture">Willow Picture</button>
 </div>
 <div id="floor">
  <button class="floor-card" data-card-id="m6-3" title="Rose Single">Rose Single</button>
  <button class="floor-card" data-card-id="m12-3" title="Willow Stripe">Willow Stripe</button>
 </div>
 <div id="playerCaptured">
  ${['m1-3','m2-3','m3-3','m4-3','m5-3','m7-3','m8-3','m9-3','m10-3']
    .map(id=>'<img class="captured-mini" data-card-id="'+id+'">').join('')}
 </div>
 <div id="aiCaptured">
  <img class="captured-mini" data-card-id="m12-1">
  ${locked?'<img class="captured-mini" data-card-id="m12-4">':''}
 </div></body></html>`);
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-context-coach.js'});
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  const coach=document.getElementById('trainingCoachPanel');
  const copy=document.getElementById('trainingCoachText');
  copy.textContent='Play Rose Picture onto Rose Single. This reaches 10 Singles and starts Single scoring. Take Rose Picture onto Rose Single now; it advances your score more than Willow Picture onto Willow Stripe.';
  coach.hidden=false;
 });
}
for(const viewport of [{name:'PC',width:1450,height:960},{name:'Android portrait',width:390,height:844}]){
 test('Willow locked explanation replaces redundant score comparison on '+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await setup(page);
  const copy=page.locator('#trainingCoachText');
  await expect(copy).toContainText('Willow is locked in');
  await expect(copy).toContainText('This reaches 10 Singles and starts Single scoring.');
  await expect(copy).toContainText('Willow can wait');
  await expect(copy).not.toContainText('advances your score more than');
  await page.waitForTimeout(250);
  const text=await copy.textContent();
  expect((text.match(/Willow is locked in/g)||[]).length).toBe(1);
  expect((text.match(/This reaches 10 Singles/g)||[]).length).toBe(1);
 });
}
test('no false locked-in claim with fourth Willow card unaccounted for',async({page})=>{
 await setup(page,{locked:false});
 await page.waitForTimeout(230);
 await expect(page.locator('#trainingCoachText')).not.toContainText('Willow is locked in');
});
test('non-Training Solo advice is not rewritten',async({page})=>{
 await setup(page);
 await page.locator('#playSoloBtn').click();
 await page.locator('#trainingCoachText').evaluate(e=>{e.textContent='Play Rose Picture onto Rose Single. This reaches 10 Singles.';});
 await page.waitForTimeout(130);
 await expect(page.locator('#trainingCoachText')).toHaveText('Play Rose Picture onto Rose Single. This reaches 10 Singles.');
});
