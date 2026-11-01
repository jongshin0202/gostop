import {test,expect} from '@playwright/test';

// Full frozen game, not a fixture: computer takes the opening turn.
// The dev-only bridge can request the game's own hint before its 5-second timer.
test('real computer-first Training shows the native recommended card and text immediately on first playable hand',async({page})=>{
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
 await expect(page.locator('#trainingCoachPanel')).toBeVisible({timeout:1700});
 await expect(page.locator('#trainingCoachTitle')).toHaveText('Recommended Move',{timeout:1700});
 await expect(page.locator('#trainingCoachText')).not.toBeEmpty();
 await expect(page.locator('#playerHand .hand-card.matchable[data-card-id]')).toHaveCount(1);
 const status=await page.evaluate(()=>globalThis.GoStopDevImmediateTrainingAdvice.getStatus());
 expect(status.requests).toBeGreaterThanOrEqual(1);
 expect(status.adviceVisible).toBe(true);
 expect(errors).toEqual([]);
});
