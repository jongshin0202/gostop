import {test,expect} from '@playwright/test';

// The removable development bridge does not generate its own strategy.
// It calls the frozen game's already wired #hintBtn only when the human can play.
async function setup(page){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!doctype html><html><body>
  <button id="trainingModeBtn">Training</button>
  <button id="playSoloBtn">Solo</button><button id="quitYesBtn">Quit</button>
  <button id="playAgainBtn">Again</button><button id="newGameYesBtn">New game</button>
  <button id="hintBtn">Native hint</button>
  <aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle"></strong><p id="trainingCoachText"></p></aside>
  <div id="playerHand">
   <button class="hand-card" data-card-id="m2-1" disabled>Card 1</button>
   <button class="hand-card" data-card-id="m2-2" disabled>Card 2</button>
  </div>
  <dialog id="resultDialog"></dialog>
 </body></html>`);
 await page.evaluate(()=>{
  globalThis.__nativeHintCalls=0;
  document.getElementById('hintBtn').addEventListener('click',()=>{
   globalThis.__nativeHintCalls++;
   const hand=document.getElementById('playerHand');
   const playable=hand.querySelector('.hand-card:not(:disabled)');
   if(!playable)return;
   playable.classList.add('matchable');
   document.getElementById('trainingCoachTitle').textContent='Recommended Move';
   document.getElementById('trainingCoachText').textContent='Native game recommendation.';
   document.getElementById('trainingCoachPanel').hidden=false;
  });
 });
 await page.addScriptTag({path:'dev-site/training-immediate-turn-advice.js'});
}
async function openTraining(page){
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  const layer=document.createElement('div');
  layer.className='training-opening-dismiss-layer';
  document.body.appendChild(layer);
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().blocked)).toBe(true);
}
test('when computer plays first, native advice appears after three seconds of player turn',async({page})=>{
 await setup(page);
 await openTraining(page);
 await page.evaluate(()=>document.querySelector('.training-opening-dismiss-layer').remove());
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await page.evaluate(()=>document.querySelectorAll('#playerHand .hand-card').forEach(x=>x.disabled=false));
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().readyForMs),
  {timeout:1000}).toBeGreaterThan(0);
 expect(await page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().delayMs)).toBe(3000);
 await page.waitForTimeout(900);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls),{timeout:4600}).toBe(1);
 await expect(page.locator('#trainingCoachPanel')).toBeVisible();
 await expect(page.locator('#trainingCoachText')).toHaveText('Native game recommendation.');
 await expect(page.locator('#playerHand .hand-card.matchable')).toHaveCount(1);
 await page.waitForTimeout(600);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(1);
});
test('one original recommendation per hand; the next computer-to-human turn gets another',async({page})=>{
 await setup(page);await openTraining(page);
 await page.evaluate(()=>{
  document.querySelector('.training-opening-dismiss-layer').remove();
  document.querySelectorAll('#playerHand .hand-card').forEach(x=>x.disabled=false);
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(1);
 await page.evaluate(()=>{
  document.querySelectorAll('#playerHand .hand-card').forEach(x=>x.disabled=true);
  document.querySelector('[data-card-id="m2-1"]').remove();
  document.getElementById('trainingCoachPanel').hidden=true;
  document.querySelector('[data-card-id="m2-2"]').classList.remove('matchable');
 });
 await page.waitForTimeout(70);
 await page.evaluate(()=>document.querySelector('[data-card-id="m2-2"]').disabled=false);
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls),{timeout:4700}).toBe(2);
 await expect(page.locator('#trainingCoachText')).toHaveText('Native game recommendation.');
});
test('non-Training Solo, modal decisions and opening review never invoke hidden hint',async({page})=>{
 await setup(page);
 await page.locator('#playSoloBtn').click();
 await page.evaluate(()=>document.querySelectorAll('#playerHand .hand-card').forEach(x=>x.disabled=false));
 await page.waitForTimeout(100);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await page.locator('#trainingModeBtn').click(); 
 await page.evaluate(()=>{
  const layer=document.createElement('div');
  layer.className='training-opening-dismiss-layer';
  document.body.appendChild(layer);
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().blocked)).toBe(true);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await page.evaluate(()=>{
  document.querySelector('.training-opening-dismiss-layer').remove();
  const dialog=document.createElement('dialog');dialog.id='trainingFeedbackDialog';document.body.appendChild(dialog);dialog.showModal();
 });
 await page.waitForTimeout(100);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await page.evaluate(()=>document.querySelector('#trainingFeedbackDialog').close());
 await page.evaluate(()=>{const card=document.querySelector('[data-card-id="m2-1"]');card.disabled=true;card.disabled=false;});
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(1);
 await page.locator('#quitYesBtn').click();
 await page.evaluate(()=>{
  document.getElementById('trainingCoachPanel').hidden=true;
  document.querySelectorAll('#playerHand .hand-card').forEach(x=>x.classList.remove('matchable'));
  document.querySelector('[data-card-id="m2-2"]').disabled=true;
  document.querySelector('[data-card-id="m2-2"]').disabled=false;
 });
 await page.waitForTimeout(120);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(1);
});

test('no advice leaks from a canceled player turn into a future turn',async({page})=>{
 await setup(page);await openTraining(page);
 await page.evaluate(()=>{
  document.querySelector('.training-opening-dismiss-layer').remove();
  document.querySelector('[data-card-id="m2-1"]').disabled=false;
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().readyForMs)).toBeGreaterThan(0);
 await page.waitForTimeout(750);
 await page.evaluate(()=>document.querySelectorAll('#playerHand .hand-card').forEach(x=>x.disabled=true));
 await page.waitForTimeout(2600);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await page.evaluate(()=>document.querySelector('[data-card-id="m2-1"]').disabled=false);
 await page.waitForTimeout(850);
 expect(await page.evaluate(()=>globalThis.__nativeHintCalls)).toBe(0);
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls),{timeout:3700}).toBe(1);
});

test('opening transition missed by the observer still yields one hint on the first playable turn',async({page})=>{
 await setup(page);
 await page.locator('#trainingModeBtn').click();
 // An opening layer can be closed by a native handler before a queued scan
 // observes it. Advice must depend on human playability, not seeing a layer.
 await page.evaluate(()=>{
  const layer=document.createElement('div');
  layer.className='training-opening-dismiss-layer';
  document.body.append(layer);layer.remove();
  document.querySelector('[data-card-id="m2-1"]').disabled=false;
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls),{timeout:4600}).toBe(1);
 await expect(page.locator('#trainingCoachText')).toHaveText('Native game recommendation.');
});
test('frequent hand renders do not starve Chrome or call native hint more than once',async({page})=>{
 await setup(page);await openTraining(page);
 await page.evaluate(()=>{
  document.querySelector('.training-opening-dismiss-layer').remove();
  document.querySelector('[data-card-id="m2-1"]').disabled=false;
  // Simulates many unrelated game presentation renders. The observer must
  // run on bounded tasks, rather than an unbounded queueMicrotask chain.
  for(let i=0;i<250;i++){
   const el=document.querySelector('[data-card-id="m2-1"]');
   el.disabled=false;
   el.classList.toggle('preview-only',i%2===0);
  }
 });
 await expect.poll(()=>page.evaluate(()=>globalThis.__nativeHintCalls),{timeout:4700}).toBe(1);
 const state=await page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus());
 expect(state.scans).toBeLessThan(60);
 expect(state.requests).toBe(1);
 await page.evaluate(()=>{globalThis.__eventLoopReturned=true;});
 expect(await page.evaluate(()=>globalThis.__eventLoopReturned)).toBe(true);
});
