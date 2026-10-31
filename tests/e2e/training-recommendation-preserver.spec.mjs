import {test,expect} from '@playwright/test';

async function fixture(page,{lang='en',initialText='Play Rose onto Rose on the table.',initialTitle='RECOMMENDED MOVE'}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="${lang}"><head></head><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button><button id="quitYesBtn">Quit</button>
 <aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle"></strong><p id="trainingCoachText"></p><button id="trainingCoachDismiss">×</button></aside>
 <div id="playerHand">
  <div class="hand-card-slot" data-hand-key="m1-1"><button class="card hand-card" data-card-id="m1-1">Rose</button></div>
  <div class="hand-card-slot" data-hand-key="m2-1"><button class="card hand-card" data-card-id="m2-1">Bird</button></div>
 </div>
 <div id="floor">
  <div class="floor-card" data-card-id="m1-2">Rose floor</div>
  <div class="floor-card" data-card-id="m2-2">Vine Stripe</div>
  <div class="floor-card" data-card-id="m2-3">Vine Single</div>
 </div>
 <dialog id="shakeDialog"><div class="special-rule-card">Shake advice</div></dialog>
 <dialog id="bombDialog"><div class="special-rule-card">Bomb advice</div></dialog>
 <dialog id="resultDialog"></dialog></body></html>`);
 await page.addStyleTag({path:'styles.css'});
 await page.addStyleTag({path:'dev-site/training-recommendation-preserver.css'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(({title,text})=>{
  document.getElementById('trainingCoachPanel').hidden=false;
  document.getElementById('trainingCoachTitle').textContent=title;
  document.getElementById('trainingCoachText').textContent=text;
  document.querySelector('#playerHand [data-card-id="m1-1"]').classList.add('matchable');
  document.querySelector('#floor [data-card-id="m1-2"]').classList.add('training-recommended');
 },{title:initialTitle,text:initialText});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
}
async function previewAlternative(page){
 await page.evaluate(()=>{
  const hand=document.getElementById('playerHand');
  const floor=document.getElementById('floor');
  hand.querySelector('[data-card-id="m1-1"]').classList.remove('matchable');
  hand.querySelector('[data-card-id="m2-1"]').classList.add('pending-card');
  hand.querySelector('[data-hand-key="m1-1"]').classList.add('is-hovered');
  floor.querySelector('[data-card-id="m1-2"]').classList.remove('training-recommended');
  floor.querySelector('[data-card-id="m2-2"]').classList.add('training-recommended');
  floor.querySelectorAll('[data-card-id^="m2-"]').forEach(el=>el.classList.add('target-option'));
  document.getElementById('trainingCoachTitle').textContent='TARGET CHOICE';
  document.getElementById('trainingCoachText').textContent='Choose Vine Plain Stripe on the table. This secures your live 5-BIRDIES Picture.';
  document.getElementById('trainingCoachPanel').hidden=false;
 });
}
for(const viewport of [
 {name:'PC',width:1504,height:1020},
 {name:'phone portrait',width:390,height:844},
 {name:'phone landscape',width:844,height:390}
]){
 test('original recommendation persists during alternative two-target preview on '+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await fixture(page);
  await previewAlternative(page);
  const panel=page.locator('#trainingCoachPanel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#trainingCoachTitle')).toHaveText('RECOMMENDED MOVE');
  await expect(page.locator('#trainingCoachText')).toHaveText('Play Rose onto Rose on the table.');
  await expect(page.locator('#playerHand [data-card-id="m1-1"]')).toHaveClass(/matchable/);
  await expect(page.locator('#floor [data-card-id="m1-2"]')).toHaveClass(/training-recommended/);
  await expect(page.locator('#floor [data-card-id="m2-2"]')).not.toHaveClass(/training-recommended/);
  await expect(page.locator('#floor .target-option')).toHaveCount(2);
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.querySelector('#playerHand .hand-card.matchable')).transform)).toBe('none');
  await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().floor)).toBe('m1-2');
 });
}
test('moving between hand cards does not leave the recommendation raised',async({page})=>{
 await fixture(page);
 await previewAlternative(page);
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-hand-key="m1-1"]').classList.remove('is-hovered');
  document.querySelector('#playerHand [data-hand-key="m2-1"]').classList.add('is-hovered');
 });
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.querySelector('#playerHand .hand-card.matchable')).transform)).toBe('none');
 await expect(page.locator('#playerHand [data-card-id="m1-1"]')).toHaveClass(/matchable/);
 await expect(page.locator('#trainingCoachText')).toHaveText('Play Rose onto Rose on the table.');
});
test('when the played card leaves the hand the original recommendation lock ends',async({page})=>{
 await fixture(page);
 await previewAlternative(page);
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-hand-key="m2-1"]').remove();
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(false);
 await page.evaluate(()=>{
  document.getElementById('trainingCoachText').textContent='Next turn recommendation.';
 });
 await expect(page.locator('#trainingCoachText')).toHaveText('Next turn recommendation.');
});
test('Korean recommendation copy stays exactly as initially presented',async({page})=>{
 await fixture(page,{lang:'ko',initialTitle:'추천 수',initialText:'장미 패를 내고 바닥의 장미 패를 가져오세요.'});
 await previewAlternative(page);
 await expect(page.locator('#trainingCoachTitle')).toHaveText('추천 수');
 await expect(page.locator('#trainingCoachText')).toHaveText('장미 패를 내고 바닥의 장미 패를 가져오세요.');
});
test('explicitly dismissed recommendations stay dismissed',async({page})=>{
 await fixture(page);
 await page.locator('#trainingCoachDismiss').click();
 await page.evaluate(()=>{
  document.getElementById('trainingCoachPanel').hidden=true;
  document.getElementById('trainingCoachText').textContent='Different advice.';
 });
 await expect(page.locator('#trainingCoachPanel')).toBeHidden();
 await expect(page.locator('#trainingCoachText')).toHaveText('Different advice.');
});
test('special decision dialog does not inherit the frozen ordinary move advice',async({page})=>{
 await fixture(page);
 await page.evaluate(()=>{
  document.getElementById('shakeDialog').showModal();
  document.getElementById('trainingCoachText').textContent='Shake or Keep for Bomb decision';
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(false);
 await expect(page.locator('#trainingCoachText')).toHaveText('Shake or Keep for Bomb decision');
});
test('without a Training session the adapter does not rewrite ordinary game UI',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  document.getElementById('soloStartOverlay').hidden=true;
 });
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().active)).toBe(false);
 await page.evaluate(()=>{
  const panel=document.getElementById('trainingCoachPanel');
  panel.hidden=false;
  document.getElementById('trainingCoachText').textContent='Normal hint';
 });
 await expect(page.locator('#trainingCoachText')).toHaveText('Normal hint');
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(false);
});

test('new turn can capture a fresh recommendation only after the previous hint clears',async({page})=>{
 await fixture(page);
 await previewAlternative(page);
 await page.evaluate(()=>document.querySelector('#playerHand [data-hand-key="m2-1"]').remove());
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(false);
 await page.evaluate(()=>{
  document.querySelector('#playerHand [data-card-id="m1-1"]').classList.remove('matchable');
  document.querySelector('#trainingCoachPanel').hidden=true;
 });
 await page.waitForTimeout(50);
 await page.evaluate(()=>{
  const hand=document.getElementById('playerHand');
  hand.insertAdjacentHTML('beforeend','<div class="hand-card-slot" data-hand-key="m3-1"><button class="card hand-card" data-card-id="m3-1">Next card</button></div>');
  document.getElementById('trainingCoachTitle').textContent='RECOMMENDED MOVE';
  document.getElementById('trainingCoachText').textContent='New turn strategy.';
  document.querySelector('#playerHand [data-card-id="m1-1"]').classList.add('matchable');
  document.querySelector('#trainingCoachPanel').hidden=false;
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
 await expect(page.locator('#trainingCoachText')).toHaveText('New turn strategy.');
});
