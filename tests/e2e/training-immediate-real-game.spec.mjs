import {test,expect} from '@playwright/test';

// Full frozen game, not a fixture: computer takes the opening turn.
// The dev-only bridge asks the game's own hint exactly 3 seconds into a playable human turn.
test('real computer-first Training shows native card and text at the three-second turn mark',async({page})=>{
 test.setTimeout(100000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const original=crypto.getRandomValues.bind(crypto);
  let firstRandomUint32=true;
  crypto.getRandomValues=function(values){
   // The game's first secureRandomInt(2) chooses the session starter.
   if(firstRandomUint32&&values instanceof Uint32Array&&values.length===1){
    firstRandomUint32=false;values[0]=1;return values; // PLAYER_B is computer.
   }
   return original(values);
  };
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.addScriptTag({path:'dev-site/training-immediate-turn-advice.js'});
 await page.locator('#friendlyGamingBtn').click();
 await page.locator('#trainingModeBtn').click();
 await expect(page.locator('.training-opening-dismiss-layer')).toBeVisible({timeout:40000});
 // This is the original frozen coach. No synthetic opening dialog is needed
 // to verify transition from the computer's first turn to player's turn.
 const starter=await page.locator('#openingMessage').textContent();
 expect(starter?.toLowerCase()).toContain('computer');
 expect(await page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().openingSeen)).toBe(true);
 await page.locator('.training-opening-dismiss-layer').click();
 await expect(page.locator('.training-opening-dismiss-layer')).toHaveCount(0);
 await expect.poll(()=>page.locator('#playerHand .hand-card[data-card-id]:not(:disabled)').count(),
  {timeout:35000,intervals:[60,100,180,250]}).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().requests),
  {timeout:4400,intervals:[100,150,250]}).toBeGreaterThanOrEqual(1);
 await expect(page.locator('#trainingCoachPanel')).toBeVisible({timeout:1400});
 await expect(page.locator('#trainingCoachTitle')).toHaveText('Recommended Move',{timeout:1400});
 await expect(page.locator('#trainingCoachText')).not.toBeEmpty();
 await expect(page.locator('#playerHand .hand-card.matchable[data-card-id]')).toHaveCount(1);
 const status=await page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus());
 expect(status.delayMs).toBe(3000);
 expect(status.requests).toBeGreaterThanOrEqual(1);
 expect(status.adviceVisible).toBe(true);
 expect(errors).toEqual([]);
});

test('three-second Training recommendation survives computer-first opening strategy confirmation',async({page})=>{
 test.setTimeout(100000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const original=crypto.getRandomValues.bind(crypto);
  let first=true;
  crypto.getRandomValues=function(values){
   if(first&&values instanceof Uint32Array&&values.length===1){first=false;values[0]=1;return values;}
   return original(values);
  };
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  globalThis.GoStopTrainingFeedbackDev={getStatus:()=>({gameId:'first-computer-training',authorized:true})};
  globalThis.GoStopTrainingCloud={state:async()=>({activeOpeningModel:null}),
   openingFeedback:async()=>({ok:true})};
 });
 await page.addScriptTag({path:'dev-site/training-opening-evidence.js'});
 await page.addScriptTag({path:'dev-site/training-opening-review.js'});
 await page.addScriptTag({path:'dev-site/training-immediate-turn-advice.js'});
 await page.addStyleTag({path:'dev-site/training-opening-review.css'});
 await page.locator('#friendlyGamingBtn').click();
 await page.locator('#trainingModeBtn').click();
 await expect(page.locator('#devOpeningReview')).toBeVisible({timeout:40000});
 expect((await page.locator('#openingMessage').textContent())?.toLowerCase()).toContain('computer');
 await page.locator('#devOpeningReview').getByRole('button',{name:'Yes, I agree'}).click();
 await expect(page.locator('#devOpeningReview')).toHaveCount(0);
 await expect(page.locator('.training-opening-dismiss-layer')).toHaveCount(0);
 await expect.poll(()=>page.locator('#playerHand .hand-card[data-card-id]:not(:disabled)').count(),
  {timeout:35000,intervals:[60,100,180,250]}).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus().requests),
  {timeout:4400,intervals:[100,150,250]}).toBeGreaterThanOrEqual(1);
 await expect(page.locator('#trainingCoachPanel')).toBeVisible({timeout:1400});
 await expect(page.locator('#trainingCoachTitle')).toHaveText('Recommended Move',{timeout:1400});
 await expect(page.locator('#trainingCoachText')).not.toBeEmpty();
 await expect(page.locator('#playerHand .hand-card.matchable[data-card-id]')).toHaveCount(1);
 const status=await page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus());
 expect(status.adviceVisible).toBe(true);
 expect(status.delayMs).toBe(3000);
 expect(errors).toEqual([]);
});
