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
 await expect(review).toContainText('Do you agree with these opening strategies?');
 // Regression: the game's actual visible opening advice must match exactly
 // what the expert is being asked to confirm, for whichever hand was dealt.
 const comparison=await page.evaluate(()=>{
  const coach=document.getElementById('trainingCoachText')?.textContent||'';
  const shown=document.querySelector('#devOpeningReview .dev-opening-review-recommendation')?.textContent||'';
  const native=coach.match(/^Best strateg(?:y|ies):\s*([^.!?]+)[.!?]/i);
  return {coach,shown,native:native?.[1]||''};
 });
 expect(comparison.native).not.toBe('');
 const nativeNames=comparison.native.replace(/,?\s+and\s+/g,',').split(',').map(x=>x.trim());
 const displayedNames=comparison.shown.replace(/^Recommended opening strategies:\s*/,'').split(',').map(x=>x.trim());
 expect(displayedNames).toEqual(nativeNames);
 await expect(review.getByRole('button',{name:'Yes, I agree'})).toBeVisible();
 await expect(review.getByRole('button',{name:'No, change strategies'})).toBeVisible();
 await expect(review.locator('.dev-opening-review-options')).toBeHidden();
 await expect(page.locator('#playerHand .hand-card[data-card-id]').first()).toBeVisible();
 await expect(page.locator('#floor .floor-card[data-card-id]').first()).toBeVisible();
 // A native dialog must be on-screen, instead of an inaccessible form after the board.
 const rect=await review.evaluate(el=>{
  const b=el.getBoundingClientRect();
  return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,
   viewportHeight:innerHeight,viewportWidth:innerWidth};
 });
 expect(rect.top).toBeGreaterThanOrEqual(0);
 expect(rect.bottom).toBeLessThanOrEqual(rect.viewportHeight+1);
 expect(rect.left).toBeGreaterThanOrEqual(0);
 expect(rect.right).toBeLessThanOrEqual(rect.viewportWidth+1);
 await review.getByRole('button',{name:'No, change strategies'}).click();
 await expect(review.locator('input[type="checkbox"]')).toHaveCount(8);
 // Multi-selection is explicit: this tests the expert interface, not whether
 // these two categories are optimal for the random hand dealt in this game.
 await review.locator('input[value="brights"]').check();
 await review.locator('input[value="singles"]').check();
 await review.getByRole('button',{name:'Submit my strategies'}).click();
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
