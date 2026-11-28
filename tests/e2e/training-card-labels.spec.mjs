import {test,expect} from '@playwright/test';
const testDeck=[
 {id:'m4-2',month:4,type:'ribbon',ribbonSet:'grass',flags:[]},
 {id:'m4-3',month:4,type:'pi',flags:[]},
 {id:'m12-1',month:12,type:'bright',flags:[]},
 {id:'m12-2',month:12,type:'animal',flags:[]}
];
async function setup(page){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="en"><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Exit Training</button>
 <aside id="trainingCoachPanel"><h2 id="trainingCoachTitle">RECOMMENDED MOVE</h2>
 <p id="trainingCoachText">Play m4-2 onto m4-3. Save m12-1.</p></aside>
 <div id="playerHand"><button class="hand-card matchable" data-card-id="m4-2">Vine</button>
 <button class="hand-card" data-card-id="m12-1">Willow</button></div>
 <div id="floor"><button class="floor-card training-recommended" data-card-id="m4-3"></button></div>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 </body></html>`);
 await page.evaluate(deck=>{globalThis.GoStopEngine={masterDeck:deck};},testDeck);
 await page.addScriptTag({path:'dev-site/training-card-labels.js'});
}
for(const viewport of [
 {name:'PC',width:1440,height:900},
 {name:'Android portrait',width:390,height:844}
]){
 test('all visible Training coach card IDs are readable on '+viewport.name,async({page})=>{
  await page.setViewportSize(viewport);
  await setup(page);
  await page.locator('#trainingModeBtn').click();
  await expect(page.locator('#trainingCoachText')).toHaveText(
   'Play Vine Plain Stripe onto Vine Single. Save Willow Bright.');
  await page.evaluate(()=>{
   document.getElementById('trainingCoachText').textContent=
    'Play M2-10 instead of m12-1; m4-2 is still playable.';
  });
  await expect(page.locator('#trainingCoachText')).toHaveText(
   'Play Plum card instead of Willow Bright; Vine Plain Stripe is still playable.');
  await page.locator('#playSoloBtn').click();
  await page.evaluate(()=>{
   document.getElementById('trainingCoachText').textContent='DEV m4-2';
  });
  await expect(page.locator('#trainingCoachText')).toHaveText('DEV m4-2',
   'normal non-Training text must never be rewritten');
 });
 test('the recommendation lock preserves the readable source instead of restoring raw IDs on '+viewport.name,async({page})=>{
  await page.setViewportSize(viewport);
  await setup(page);
  await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
  await page.locator('#trainingModeBtn').click();
  await expect.poll(()=>page.evaluate(()=>
   globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
  const copy=page.locator('#trainingCoachText');
  await expect(copy).toHaveText('Play Vine Plain Stripe onto Vine Single. Save Willow Bright.');
  const status=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
  expect(status.text).toBe('Play Vine Plain Stripe onto Vine Single. Save Willow Bright.');
  await page.evaluate(()=>{
   document.getElementById('trainingCoachText').textContent=
    'Play m4-2 onto m4-3. Save m12-1.';
  });
  await expect(copy).toHaveText('Play Vine Plain Stripe onto Vine Single. Save Willow Bright.');
 });
}
