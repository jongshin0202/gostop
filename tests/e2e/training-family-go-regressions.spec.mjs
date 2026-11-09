import {test,expect} from '@playwright/test';
async function familyFixture(page){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="en"><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
 <aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle">RECOMMENDED MOVE</strong>
 <p id="trainingCoachText">Play Willow 2x Single onto Willow Stripe.</p></aside>
 <div id="playerHand"><button class="hand-card" data-card-id="m5-1" title="Iris Picture">Iris Picture</button>
 <button class="hand-card" data-card-id="m5-4" title="Iris Single">Iris Single</button>
 <button class="hand-card" data-card-id="m12-4" title="Willow 2x Single">Willow 2x Single</button></div>
 <div id="floor"><div class="floor-card" data-card-id="m5-3" title="Iris Single">Iris Single</div>
 <div class="floor-card" data-card-id="m12-3" title="Willow Stripe">Willow Stripe</div></div>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 <dialog id="shakeDialog"></dialog><dialog id="bombDialog"></dialog>
 <dialog id="gukjinDialog"></dialog><dialog id="decisionDialog"></dialog>
 <dialog id="resultDialog"></dialog></body></html>`);
 await page.evaluate(()=>{globalThis.GoStopEngine={masterDeck:[
  {id:'m5-1',month:5,type:'animal',flags:[]},{id:'m5-3',month:5,type:'pi',flags:[]},
  {id:'m5-4',month:5,type:'pi',flags:[]},{id:'m12-3',month:12,type:'ribbon',flags:[]},
  {id:'m12-4',month:12,type:'pi',flags:['doublePi']}
 ]};});
 await page.addScriptTag({path:'dev-site/training-family-capture-priority.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-card-id="m12-4"]').classList.add('matchable');
  document.querySelector('#floor [data-card-id="m12-3"]').classList.add('training-recommended');
  document.getElementById('trainingCoachPanel').hidden=false;
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().familyPriority)).toBe(true);
}
for(const viewport of [{name:'PC',width:1480,height:980},{name:'Android portrait',width:390,height:844}]){
 test('family capture beats Willow 2x Single on '+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await familyFixture(page);
  const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
  expect(s.hand).toBe('m5-4');expect(s.floor).toBe('m5-3');
  await expect(page.locator('#playerHand [data-card-id="m5-4"]')).toHaveClass(/matchable/);
  await expect(page.locator('#playerHand [data-card-id="m12-4"]')).not.toHaveClass(/matchable/);
  await expect(page.locator('#floor [data-card-id="m5-3"]')).toHaveClass(/training-recommended/);
  await expect(page.locator('#trainingCoachText')).toContainText('Two cards in your hand');
 });
}
test('table state change clears old locked family suggestion',async({page})=>{
 await familyFixture(page);
 await page.locator('#floor [data-card-id="m5-3"]').evaluate(el=>el.remove());
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(false);
});
test('family override does not activate in ordinary Solo play',async({page})=>{
 await familyFixture(page);
 await page.locator('#playSoloBtn').click();
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().active)).toBe(false);
});
async function goFixture(page,{training=true}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="en"><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
 <section class="opponent-zone"><div class="cpu-status-component">
 <span class="go-count-badge"></span></div></section>
 <div id="goCallout" class="go-callout" aria-live="polite">GO!</div></body></html>`);
 await page.addStyleTag({path:'dev-site/training-cpu-go-visibility.css'});
 await page.addScriptTag({path:'dev-site/training-cpu-go-visibility.js'});
 if(training)await page.locator('#trainingModeBtn').click();
}
test('computer native GO event gets a visible callout even before score badge refresh',async({page})=>{
 await goFixture(page);
 await page.evaluate(()=>{
  const callout=document.getElementById('goCallout');
  callout.className='go-callout go-callout-ai';
  callout.classList.add('show');
 });
 await expect(page.locator('#devTrainingCpuGo')).toBeVisible();
 await expect(page.locator('#devTrainingCpuGo')).toHaveText('GO!');
 expect(await page.evaluate(()=>globalThis.GoStopDevCpuGoVisibility.getStatus().announcements)).toBe(1);
 await page.evaluate(()=>document.querySelector('.cpu-status-component .go-count-badge').textContent='1 GO');
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevCpuGoVisibility.getStatus().previousGoCount)).toBe(1);
 expect(await page.evaluate(()=>globalThis.GoStopDevCpuGoVisibility.getStatus().announcements)).toBe(1);
});
test('computer GO badge produces fallback callout if native event omitted',async({page})=>{
 await goFixture(page);
 await page.evaluate(()=>document.querySelector('.go-count-badge').textContent='1 GO');
 await expect(page.locator('#devTrainingCpuGo')).toBeVisible();
 await expect(page.locator('#devTrainingCpuGo')).toHaveText('GO!');
});
test('ordinary Solo game never displays development GO overlay',async({page})=>{
 await goFixture(page,{training:false});
 await page.evaluate(()=>{
  document.querySelector('.go-count-badge').textContent='1 GO';
  document.getElementById('goCallout').className='go-callout go-callout-ai show';
 });
 await page.waitForTimeout(120);
 await expect(page.locator('#devTrainingCpuGo')).toHaveCount(0);
});
