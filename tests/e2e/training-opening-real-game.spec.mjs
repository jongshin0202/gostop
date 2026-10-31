import {test,expect} from '@playwright/test';

// Real frozen-game integration check. The dedicated opening-review fixture tests
// the individual choices; this exercises the actual Training entry and opening gate.
// The mocked expert endpoint only exists inside this browser test, and no game or
// production source is changed.
test('real Training opening shows the dev-only strategy review without obscuring hand and table',async({page})=>{
 test.setTimeout(90000);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 expect(await page.evaluate(()=>globalThis.GoStopEngine?.masterDeck?.length)).toBe(48);
 await page.evaluate(()=>{
  globalThis.__openingSubmissionTest=[];
  globalThis.GoStopTrainingFeedbackDev={
   getStatus:()=>({gameId:'dev-real-opening-test',authorized:true})
  };
  globalThis.GoStopTrainingCloud={
   state:async()=>({activeOpeningModel:null}),
   openingFeedback:async payload=>{
    globalThis.__openingSubmissionTest.push(payload);
    return {ok:true};
   }
  };
 });
 await page.addScriptTag({path:'dev-site/training-opening-evidence.js'});
 await page.addScriptTag({path:'dev-site/training-opening-review.js'});
 await page.addStyleTag({path:'dev-site/training-opening-review.css'});
 await page.locator('#friendlyGamingBtn').click();
 await page.locator('#trainingModeBtn').click();
 await expect(page.locator('.training-opening-dismiss-layer')).toBeVisible({timeout:40000});
 const review=page.locator('#devOpeningReview');
 await expect(review).toBeVisible({timeout:10000});
 await expect(review.locator('input[type="checkbox"]')).toHaveCount(8);
 await expect(page.locator('#playerHand .hand-card[data-card-id]').first()).toBeVisible();
 await expect(page.locator('#floor .floor-card[data-card-id]').first()).toBeVisible();
 const positions=await page.evaluate(()=>{
  const box=selector=>document.querySelector(selector).getBoundingClientRect();
  return {stageBottom:box('main.game-stage').bottom,
   reviewTop:box('#devOpeningReview').top,
   handBottom:box('#playerHand').bottom};
 });
 expect(positions.reviewTop).toBeGreaterThanOrEqual(positions.stageBottom-2);
 expect(positions.reviewTop).toBeGreaterThanOrEqual(positions.handBottom-2);
 // Multi-selection is explicit: this tests the expert interface, not whether
 // these two categories are optimal for the random hand dealt in this game.
 await review.locator('input[value="brights"]').check();
 await review.locator('input[value="singles"]').check();
 await review.getByRole('button',{name:'Submit expert feedback'}).click();
 await expect(review).toHaveCount(0);
 await expect(page.locator('.training-opening-dismiss-layer')).toHaveCount(0);
 const submissions=await page.evaluate(()=>globalThis.__openingSubmissionTest);
 expect(submissions).toHaveLength(1);
 expect(submissions[0].gameId).toBe('dev-real-opening-test');
 expect(submissions[0].choice).toBe('confirmed');
 expect(submissions[0].selected).toContain('brights');
 expect(submissions[0].selected).toContain('singles');
 expect(submissions[0].visible.hand.length).toBeGreaterThan(0);
 expect(submissions[0].visible.floor.length).toBeGreaterThan(0);
 expect(submissions[0].evidence).toHaveLength(12);
 expect(errors).toEqual([]);
});
