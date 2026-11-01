import {test,expect} from '@playwright/test';

async function shakeFixture(page,{lang='en',critical=false,withReveal=true}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="${lang}"><head></head><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>
 <button id="quitYesBtn">Quit</button>
 <aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle"></strong>
 <p id="trainingCoachText"></p></aside>
 <div id="playerHand"></div><div id="floor"></div>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 <dialog id="shakeRevealDialog"><div id="shakeRevealCards"></div></dialog>
 <dialog id="decisionDialog"></dialog><dialog id="resultDialog"></dialog>
 </body></html>`);
 await page.addScriptTag({path:'game-engine.js'});
 await page.addScriptTag({path:'dev-site/training-opponent-shake-priority.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.locator('#trainingModeBtn').click();
 if(withReveal){
  await page.evaluate(({critical})=>{
   const d=document.getElementById('shakeRevealDialog');
   const month=critical?6:4;
   document.getElementById('shakeRevealCards').innerHTML=
    [1,2,3].map(n=>'<span data-card-id="m'+month+'-'+n+'">Revealed</span>').join('');
   d.showModal();
  },{critical});
  await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevOpponentShake.getStatus().revealedIds.length)).toBe(3);
  await page.evaluate(()=>document.getElementById('shakeRevealDialog').close());
 }
 await page.evaluate(({critical})=>{
  const nativeHand=critical?'m8-3':'m6-4';
  const nativeFloor=critical?'m8-2':'m6-2';
  const shakeHand=critical?'m6-4':'m4-4';
  const shakeFloor=critical?'m6-3':'m4-3';
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card" data-card-id="'+nativeHand+'">Native</button>'+
   '<button class="hand-card" data-card-id="'+shakeHand+'">Shake</button>';
  document.getElementById('floor').innerHTML=
   '<div class="floor-card" data-card-id="'+nativeFloor+'">Native floor</div>'+
   '<div class="floor-card" data-card-id="'+shakeFloor+'">Shaken card</div>';
  if(critical)document.getElementById('playerCaptured').innerHTML=
   '<img class="captured-mini" data-card-id="m2-1">'+
   '<img class="captured-mini" data-card-id="m4-1">';
  document.getElementById('trainingCoachTitle').textContent='RECOMMENDED MOVE';
  document.getElementById('trainingCoachText').textContent='Take original table card';
  document.getElementById('trainingCoachPanel').hidden=false;
  document.querySelector('#playerHand [data-card-id="'+nativeHand+'"]').classList.add('matchable');
  document.querySelector('#floor [data-card-id="'+nativeFloor+'"]').classList.add('training-recommended');
 },{critical});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
}
for(const viewport of [{name:'PC',width:1504,height:1020},{name:'Android',width:390,height:844}]){
 test('public opponent Shaken discard is the capture priority on '+viewport.name,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await shakeFixture(page);
  await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().shakeOverride)).toBe(true);
  await expect(page.locator('#playerHand [data-card-id="m4-4"]')).toHaveClass(/matchable/);
  await expect(page.locator('#floor [data-card-id="m4-3"]')).toHaveClass(/training-recommended/);
  await expect(page.locator('#playerHand [data-card-id="m6-4"]')).not.toHaveClass(/matchable/);
  await expect(page.locator('#trainingCoachText')).toContainText('Shaken');
 });
}
test('do not sacrifice an immediately completed 5-BIRDIES set for a Shaken card',async({page})=>{
 await shakeFixture(page,{critical:true});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().shakeOverride)).toBe(false);
 await expect(page.locator('#playerHand [data-card-id="m8-3"]')).toHaveClass(/matchable/);
 await expect(page.locator('#floor [data-card-id="m8-2"]')).toHaveClass(/training-recommended/);
});
test('without a publicly revealed Shake, no change to game advice',async({page})=>{
 await shakeFixture(page,{withReveal:false});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().shakeOverride)).toBe(false);
 await expect(page.locator('#playerHand [data-card-id="m6-4"]')).toHaveClass(/matchable/);
});
test('Korean Shaken-card priority uses localized concise text',async({page})=>{
 await shakeFixture(page,{lang:'ko'});
 await expect(page.locator('#trainingCoachText')).toContainText('상대가 흔들어');
});
async function goRiskFixture(page,{threat=false}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html lang="en"><head></head><body>
 <button id="trainingModeBtn">Training</button>
 <dialog id="decisionDialog"><button id="goBtn">GO</button>
 <button id="stopBtn" class="training-choice-recommended">STOP</button></dialog>
 <span id="playerScore">9</span><span id="aiScore">1</span><span id="goCount">0</span>
 <span id="deckCount">8</span>
 <div id="playerHand"></div><div id="floor"></div>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 <p id="trainingCoachText">STOP. Only one scoring turn remains.</p>
 </body></html>`);
 await page.addScriptTag({path:'game-engine.js'});
 await page.evaluate(({threat})=>{
  const deck=globalThis.GoStopEngine.masterDeck;
  const pi=deck.filter(c=>c.type==='pi'&&!['m11-3','m11-4','m8-3','m8-4'].includes(c.id)).slice(0,10);
  const captured=threat?[...pi,{id:'m2-1'},{id:'m4-1'}]:pi;
  document.getElementById('aiCaptured').innerHTML=captured.map(c=>
   '<img class="captured-mini" data-card-id="'+c.id+'">').join('');
  document.getElementById('playerHand').innerHTML=
   '<button class="hand-card" data-card-id="'+(threat?'m6-4':'m8-4')+'">Hand</button>';
  document.getElementById('floor').innerHTML=threat?
   '<div class="floor-card" data-card-id="m8-2"></div>'+
   '<div class="floor-card" data-card-id="m11-3"></div>'+
   '<div class="floor-card" data-card-id="m6-2"></div>':
   '<div class="floor-card" data-card-id="m8-2"></div>'+
   '<div class="floor-card" data-card-id="m6-2"></div>';
  document.getElementById('aiScore').textContent=
   globalThis.GoStopEngine.score(captured.map(c=>deck.find(d=>d.id===c.id))).total;
  globalThis.GoStopTrainingFeedbackDev={getStatus:()=>({active:true})};
 },{threat});
 await page.addScriptTag({path:'dev-site/training-go-stop-risk.js'});
 await page.addScriptTag({path:'dev-site/training-go-stop-advice.js'});
 await page.evaluate(()=>document.getElementById('decisionDialog').showModal());
}
test('opponent has 1 point, max attainable score below 7, own match and Birdie route: recommend GO',async({page})=>{
 await goRiskFixture(page);
 await expect(page.locator('#goBtn')).toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#stopBtn')).not.toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#trainingCoachText')).toContainText('5-BIRDIES');
 await expect(page.locator('#trainingCoachText')).toContainText('below 7');
});
test('when opponent could get to 7 on next turn, do not replace STOP with GO',async({page})=>{
 await goRiskFixture(page,{threat:true});
 await expect(page.locator('#stopBtn')).toHaveClass(/training-choice-recommended/);
});
