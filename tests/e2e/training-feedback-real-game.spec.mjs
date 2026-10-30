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
