import {test,expect} from '@playwright/test';
// Integration smoke against the REAL frozen engine. The independent fixture suite
// verifies actual disagreement selection, dialog answers and server persistence.
test('real guest Training engine initializes the optional feedback observer without changing game controls',async({page})=>{
 test.setTimeout(45000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 expect(await page.evaluate(()=>Array.isArray(globalThis.GoStopEngine?.masterDeck))).toBe(true);
 expect(await page.evaluate(()=>globalThis.GoStopEngine.masterDeck.length)).toBe(48);
 await page.addScriptTag({path:'training-learning/feedback-ui.js'});
 await expect.poll(()=>page.evaluate(()=>!!globalThis.GoStopTrainingFeedbackDev)).toBe(true);
 await page.locator('#friendlyGamingBtn').click();
 await page.locator('#trainingModeBtn').click();
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().active)).toBe(true);
 await expect(page.locator('#trainingFeedbackDialog')).toHaveCount(1);
 await expect(page.locator('.training-opening-dismiss-layer')).toBeVisible({timeout:20000});
 await expect(page.locator('#playerHand .hand-card[data-card-id]').first()).toBeVisible();
 expect(errors).toEqual([]);
});


test('real Training gameplay shows feedback after clicking a nonrecommended playable hand card',async({page})=>{
 test.setTimeout(125000);
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.addScriptTag({path:'training-learning/feedback-ui.js'});
 await page.locator('#friendlyGamingBtn').click();
 await page.locator('#trainingModeBtn').click();
 await expect(page.locator('.training-opening-dismiss-layer')).toBeVisible({timeout:35000});
 await page.locator('.training-opening-dismiss-layer').click({position:{x:8,y:8}});
 // Opening three-card rules are random. Respect the frozen game choice so this
 // test doesn't depend on a particular shuffle or alter game decision logic.
 let clicked=false;
 for(let attempt=0;attempt<5&&!clicked;attempt++){
  await page.waitForFunction(()=>{
   const shake=document.querySelector('#shakeDialog[open]'),bomb=document.querySelector('#bombDialog[open]');
   const hint=document.querySelector('#playerHand .hand-card.matchable:not([disabled])');
   return shake||bomb||hint;
  },null,{timeout:55000});
  const state=await page.evaluate(()=>{
   if(document.querySelector('#shakeDialog[open]'))return 'shake';
   if(document.querySelector('#bombDialog[open]'))return 'bomb';
   return 'hand';
  });
  if(state==='shake'){
   const choice=page.locator('#shakeDialog .training-choice-recommended').first();
   await choice.click();continue;
  }
  if(state==='bomb'){
   await page.locator('#bombDialog #bombBtn').click();continue;
  }
  clicked=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('#playerHand .hand-card[data-card-id]:not([disabled])')];
   const rec=cards.find(el=>el.classList.contains('matchable'));
   if(!rec)return false;
   const counts=new Map();
   for(const el of cards)counts.set(el.dataset.month,(counts.get(el.dataset.month)||0)+1);
   const alternative=cards.find(el=>el!==rec&&!el.classList.contains('armed-bomb-card')&&
     (counts.get(el.dataset.month)||0)<3)||cards.find(el=>el!==rec);
   if(!alternative)return false;
   alternative.click();
   return true;
  });
 }
 expect(clicked).toBe(true);
 await expect(page.locator('#trainingFeedbackDialog')).toBeVisible({timeout:8000});
 await expect(page.locator('#trainingFeedbackDialog')).toContainText('The recommended move and your chosen move were different');
 const status=await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus());
 expect(status.cardObservationCount).toBeGreaterThan(0);
 await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'OK'}).click();
 await expect(page.locator('#trainingFeedbackDialog')).toBeHidden();
});
