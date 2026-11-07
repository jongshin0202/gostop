import {test,expect} from '@playwright/test';

async function base(page){
 await page.goto('/training-learning/test-fixture.html');
 await page.setContent(`<!doctype html><html lang="en"><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
 <aside id="trainingCoachPanel"><b id="trainingCoachTitle">Recommended Move</b>
 <p id="trainingCoachText">Native hint</p></aside>
 <div id="playerHand"></div><div id="floor"></div>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 <div id="aiHand"><span class="mini-back"></span><span class="mini-back"></span></div>
 <span id="playerScore">7</span><span id="aiScore">2</span><span id="goCount">0</span>
 <dialog id="decisionDialog"><button id="goBtn" class="training-choice-recommended">GO</button>
 <button id="stopBtn">STOP</button></dialog>
 </body></html>`);
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-advice-logic.js'});
 await page.addScriptTag({path:'dev-site/training-turn-outcomes.js'});
 await page.addScriptTag({path:'dev-site/training-context-coach.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.locator('#trainingModeBtn').click();
}
test('Training avoids feeding opponent third Blue Stripe when a safer discard exists',async({page})=>{
 await base(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card matchable" data-card-id="m9-2" title="Star Blue Stripe">Star Blue Stripe</button>'+
   '<button class="hand-card" data-card-id="m3-3" title="Cherry Single">Cherry Single</button>';
  document.getElementById('floor').innerHTML=
   '<div class="floor-card" data-card-id="m6-3" title="Rose Single">Rose Single</div>';
  document.getElementById('aiCaptured').innerHTML=
   '<span class="captured-mini" data-card-id="m6-2"></span>'+
   '<span class="captured-mini" data-card-id="m10-2"></span>';
  document.getElementById('trainingCoachText').textContent=
   'Discard Star Blue Stripe. No capture is available.';
 });
 await expect(page.locator('#playerHand [data-card-id="m3-3"]')).toHaveClass(/matchable/);
 await expect(page.locator('#playerHand [data-card-id="m9-2"]')).not.toHaveClass(/matchable/);
 await expect(page.locator('#trainingCoachText')).toContainText('three Blue Stripes for 3 points');
 await expect(page.locator('#trainingCoachText')).toContainText('Cherry Single');
});
test('Training explains two secured capture choices without a false only-option claim',async({page})=>{
 await base(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card matchable" data-card-id="m8-4" title="Hill Single">Hill Single</button>'+
   '<button class="hand-card" data-card-id="m6-3" title="Rose Single">Rose Single</button>';
  document.getElementById('floor').innerHTML=
   '<div class="floor-card training-recommended" data-card-id="m8-3" title="Hill Single">Hill Single</div>'+
   '<div class="floor-card" data-card-id="m6-4" title="Rose Single">Rose Single</div>';
  document.getElementById('playerCaptured').innerHTML=
   '<div class="captured-mini" data-card-id="m8-1"></div>'+
   '<div class="captured-mini" data-card-id="m8-2"></div>'+
   '<div class="captured-mini" data-card-id="m6-1"></div>'+
   '<div class="captured-mini" data-card-id="m6-2"></div>';
  document.getElementById('trainingCoachText').textContent='Play Hill Single onto Hill Single.';
 });
 await expect(page.locator('#trainingCoachText')).toContainText('Both Hill Single and Rose Single are secured');
 await expect(page.locator('#trainingCoachText')).not.toContainText('only available capture');
});
test('Training STOP warns about Godori completing a winning seven-point hand',async({page})=>{
 await base(page);
 await page.evaluate(()=>{
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card" data-card-id="m12-3">Willow Stripe</button>';
  document.getElementById('floor').innerHTML=
   '<div class="floor-card" data-card-id="m8-2">Hill Bird</div>';
  document.getElementById('aiCaptured').innerHTML=
   '<div class="captured-mini" data-card-id="m2-1">Plum Bird</div>'+
   '<div class="captured-mini" data-card-id="m4-1">Vine Bird</div>';
  globalThis.GoStopTrainingFeedbackDev={getStatus:()=>({active:true})};
 });
 await page.addScriptTag({path:'dev-site/training-go-stop-advice.js'});
 await page.locator('#decisionDialog').evaluate(el=>el.showModal());
 await expect(page.locator('#stopBtn')).toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#goBtn')).not.toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#trainingCoachText')).toContainText('5-BIRDIES');
 await expect(page.locator('#trainingCoachText')).toContainText('7');
});
