import {test,expect} from '@playwright/test';
async function setup(page,{nativeStar=false,thirdBlue=false,onlyStar=false,shaken=false}={}){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 await page.setContent([
 '<!doctype html><html lang="en"><body>',
 '<button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>',
 '<aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle">Recommended Move</strong>',
 '<p id="trainingCoachText"></p></aside><div id="playerHand">',
 '<button class="hand-card '+(nativeStar||onlyStar?'matchable':'')+'" data-card-id="m10-3" title="Star Single">Star Single</button>',
 onlyStar?'':'<button class="hand-card '+(nativeStar?'':'matchable')+'" data-card-id="m12-4" title="Willow 2x Single">Willow 2x Single</button>',
 '</div><div id="floor">',
 '<button class="floor-card '+(nativeStar||onlyStar?'training-recommended':'')+'" data-card-id="m10-1" title="Star Picture">Star Picture</button>',
 '<button class="floor-card" data-card-id="m10-2" title="Star Blue Stripe">Star Blue Stripe</button>',
 onlyStar?'':'<button class="floor-card '+(nativeStar?'':'training-recommended')+'" data-card-id="m12-3" title="Willow Stripe">Willow Stripe</button>',
 '</div><div id="playerCaptured"></div>',
 '<div id="aiCaptured">'+(thirdBlue?'<img class="captured-mini" data-card-id="m6-2"><img class="captured-mini" data-card-id="m9-2">':'')+'</div>',
 '<dialog id="shakeDialog"></dialog><dialog id="bombDialog"></dialog>',
 '<dialog id="gukjinDialog"></dialog><dialog id="decisionDialog"></dialog>',
 '<dialog id="resultDialog"></dialog></body></html>'
 ].join(''));
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-safe-two-table.js'});
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-context-coach.js'});
 if(shaken)await page.evaluate(()=>{
  globalThis.GoStopDevShakenPriority={getStatus:()=>({revealedMonths:[10]})};
 });
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(({nativeStar,onlyStar})=>{
  document.getElementById('trainingCoachText').textContent=
   nativeStar||onlyStar?'Play Star Single onto Star Picture. No demonstrated immediate scoring advantage.':
   'Play Willow 2x Single onto Willow Stripe. No demonstrated immediate scoring advantage.';
  document.getElementById('trainingCoachPanel').hidden=false;
 },{nativeStar,onlyStar});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
}
for(const viewport of [{name:'PC',width:1440,height:900},{name:'Android portrait',width:390,height:844}]){
 test('native Willow: explains why Star can wait, not generic score filler ('+viewport.name+')',async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await setup(page);
  const copy=page.locator('#trainingCoachText');
  await expect(copy).toContainText('Star can wait');
  await expect(copy).toContainText('two Star cards are on the table');
  await expect(copy).not.toContainText('No demonstrated immediate scoring advantage');
  const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
  expect(s.hand).toBe('m12-4');expect(s.floor).toBe('m12-3');
  await page.waitForTimeout(250);
  const text=await copy.textContent();
  expect((text.match(/Star can wait/g)||[]).length).toBe(1);
 });
}
test('native Star advice is corrected to other available Willow capture',async({page})=>{
 await setup(page,{nativeStar:true});
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.safeTwoPriority).toBe(true);
 expect(s.hand).toBe('m12-4');expect(s.floor).toBe('m12-3');
 await expect(page.locator('#trainingCoachText')).toContainText('Star can wait');
 await expect(page.locator('#playerHand [data-card-id="m12-4"]')).toHaveClass(/matchable/);
});
test('only Star available: no invented alternative',async({page})=>{
 await setup(page,{nativeStar:true,onlyStar:true});
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.safeTwoPriority).toBe(false);
 expect(s.hand).toBe('m10-3');
 await expect(page.locator('#trainingCoachText')).not.toContainText('Capture a different family first');
});
test('third Blue Stripe threat prevents deferred Star recommendation',async({page})=>{
 await setup(page,{nativeStar:true,thirdBlue:true});
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.safeTwoPriority).toBe(false);
 expect(s.hand).toBe('m10-3');
});
test('publicly revealed opponent Shake Star is never deferred even with two floor Stars',async({page})=>{
 await setup(page,{nativeStar:true,shaken:true});
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.safeTwoPriority).toBe(false);
 expect(s.hand).toBe('m10-3');
});
test('Solo mode does not rewrite advice',async({page})=>{
 await setup(page);
 await page.locator('#playSoloBtn').click();
 await page.locator('#trainingCoachText').evaluate(el=>el.textContent='No demonstrated immediate scoring advantage.');
 await page.waitForTimeout(150);
 await expect(page.locator('#trainingCoachText')).toHaveText('No demonstrated immediate scoring advantage.');
});
