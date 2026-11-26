import {test,expect} from '@playwright/test';

const baseline=[
 'm1-1','m7-1','m8-2','m10-1','m3-2','m9-2',
 'm1-3','m2-3','m3-3','m4-3','m6-3','m12-4'
];
async function setup(page,{actualRisk=false,training=true}={}){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 const opponent=actualRisk?baseline.map(id=>id==='m6-3'?'m11-3':id):baseline;
 await page.setContent([
 '<!doctype html><html lang="en"><body>',
 '<button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>',
 '<aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle">Recommended Move</strong>',
 '<p id="trainingCoachText">Discard Iris Single. No capture is available.</p></aside>',
 '<div id="playerHand">',
 '<button class="hand-card" data-card-id="m3-4" title="Cherry Single">Cherry Single</button>',
 '<button class="hand-card matchable" data-card-id="m5-3" title="Iris Single">Iris Single</button>',
 '</div><div id="floor">',
 '<div class="floor-card" data-card-id="m1-4">Pine Single</div>',
 '<div class="floor-card" data-card-id="m7-3">Bush Single</div>',
 '</div><div id="playerCaptured"></div>',
 '<div id="aiCaptured">'+opponent.map(id=>'<img class="captured-mini" data-card-id="'+id+'">').join('')+'</div>',
 '<dialog id="shakeDialog"></dialog><dialog id="bombDialog"></dialog>',
 '<dialog id="gukjinDialog"></dialog><dialog id="decisionDialog"></dialog>',
 '<dialog id="resultDialog"></dialog></body></html>'
 ].join(''));
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 if(training)await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{document.getElementById('trainingCoachPanel').hidden=false;});
 if(training)await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
}
for(const viewport of [{name:'PC',width:1440,height:900},{name:'Android',width:393,height:852}]){
 test('six physical Singles with one 2x card cannot falsely show immediate Iris point risk ('+viewport.name+')',async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await setup(page);
  const status=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
  expect(status.riskOverride).toBe(false);
  expect(status.hand).toBe('m5-3');
  await expect(page.locator('#trainingCoachText')).not.toContainText('could let the computer complete 1 immediate points');
  await expect(page.locator('#trainingCoachText')).not.toContainText('If the computer has');
 });
}
test('real opponent ten-Singles route is explained with matching card and exact scoring threshold',async({page})=>{
 await setup(page,{actualRisk:true});
 const status=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(status.riskOverride).toBe(true);
 expect(status.hand).toBe('m3-4');
 const coach=page.locator('#trainingCoachText');
 await expect(coach).toContainText('Discard Cherry Single instead');
 await expect(coach).toContainText('If the computer has Iris Single');
 await expect(coach).toContainText('10 effective Singles for 1 point');
 await expect(coach).not.toContainText('1 immediate points');
});
test('outside Training Mode the protected game advice is not rewritten',async({page})=>{
 await setup(page,{actualRisk:true,training:false});
 await page.evaluate(()=>{document.getElementById('trainingCoachText').textContent='Original non-Training advice.';});
 await page.waitForTimeout(100);
 await expect(page.locator('#trainingCoachText')).toHaveText('Original non-Training advice.');
});
