import {test,expect} from '@playwright/test';
const cards=[
 ...[1,3,8,11,12].map(month=>({id:'m'+month+'-1',month,type:'bright',flags:[]})),
 ...[[1,'red'],[2,'red'],[3,'red'],[6,'blue'],[9,'blue'],[10,'blue'],[4,'grass'],[5,'grass'],[7,'grass']].map(([month,ribbonSet])=>({id:'m'+month+'-2',month,type:'ribbon',ribbonSet,flags:[]})),
 ...[2,4,8].map(month=>({id:'m'+month+'-3',month,type:'animal',flags:['godori']})),
 ...[4,5,6,7,8].map(month=>({id:'m'+month+'-4',month,type:'pi',flags:[]}))
];
async function setup(page,{authorized=true,locale='en'}={}){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 await page.setContent(`<!DOCTYPE html><html lang="${locale}"><body>
 <button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button><button id="quitYesBtn">Quit</button>
 <div id="trainingCoachPanel"><b id="trainingCoachTitle">Opening Strategy</b>
 <p id="trainingCoachText">Best strategy: Singles. No Bright set has two cards within reach.</p></div>
 <main class="game-stage" style="display:block;width:100%">
 <section class="table" style="height:320px"><div id="floor"></div></section>
 <section class="hand" id="playerHand"></section>
 <div id="playerCaptured"></div><div id="aiCaptured"></div>
 </main></body></html>`);
 await page.evaluate(({cards,authorized})=>{
  window.GoStopEngine={masterDeck:cards};
  window.__sent=[];
  window.GoStopTrainingFeedbackDev={getStatus:()=>({gameId:'dev-opening-test-game',authorized})};
  window.GoStopTrainingCloud={openingFeedback:async payload=>{
   window.__sent.push(payload);return {ok:true};
  }};
  const card=(id)=>'<button class="hand-card" data-card-id="'+id+'">'+id+'</button>';
  document.getElementById('playerHand').innerHTML=['m1-1','m4-4','m5-4','m6-4','m7-4'].map(card).join('');
  document.getElementById('floor').innerHTML='<div class="floor-card" data-card-id="m8-1">Bright floor</div>';
 },{cards,authorized});
 await page.addScriptTag({path:'dev-site/training-opening-evidence.js'});
 await page.addScriptTag({path:'dev-site/training-opening-review.js'});
 await page.addStyleTag({path:'dev-site/training-opening-review.css'});
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  const layer=document.createElement('div');layer.className='training-opening-dismiss-layer';
  layer.addEventListener('click',()=>{window.__continued=(window.__continued||0)+1;layer.remove();});
  document.body.appendChild(layer);
 });
 await expect(page.locator('#devOpeningReview')).toBeVisible();
}
test('opening confirmation asks if the expert agrees before exposing alternatives',async({page})=>{
 await setup(page);
 const review=page.locator('#devOpeningReview');
 await expect(review).toHaveAttribute('open','');
 await expect(review).toContainText('Do you agree with these opening strategies?');
 await expect(review).toContainText('Recommended opening strategies: Singles');
 await expect(review).not.toContainText('Recommended opening strategies: Brights');
 await expect(review.getByRole('button',{name:'Yes, I agree'})).toBeVisible();
 await expect(review.getByRole('button',{name:'No, change strategies'})).toBeVisible();
 await expect(review.locator('.dev-opening-review-options')).toBeHidden();
 await page.keyboard.press('Escape');
 await expect(review).toBeVisible(); // No silent dismissal / skipped feedback.
 await review.getByRole('button',{name:'Yes, I agree'}).click();
 await expect(review).toHaveCount(0);
 const received=await page.evaluate(()=>({sent:window.__sent,continued:window.__continued}));
 expect(received.sent).toHaveLength(1);
 expect(received.sent[0].choice).toBe('confirmed');
 expect(received.sent[0].selected).toEqual(received.sent[0].suggested);
 expect(received.continued).toBe(1);
});
test('choosing No reveals all eight selectable strategies and saves expert corrections',async({page})=>{
 await setup(page);
 const review=page.locator('#devOpeningReview');
 await review.getByRole('button',{name:'No, change strategies'}).click();
 const options=review.locator('.dev-opening-review-options');
 await expect(options).toBeVisible();
 await expect(options.locator('input[type=checkbox]')).toHaveCount(8);
 await expect(options.locator('input[value="brights"]')).not.toBeChecked();
 await expect(options.locator('input[value="singles"]')).toBeChecked();
 await expect(options.locator('input[value="red-stripes"]')).not.toBeChecked();
 await options.locator('input[value="brights"]').check();
 await options.locator('input[value="blue-stripes"]').check();
 await options.locator('input[value="singles"]').uncheck();
 await review.getByRole('button',{name:'Submit my strategies'}).click();
 await expect(review).toHaveCount(0);
 const received=await page.evaluate(()=>({sent:window.__sent,continued:window.__continued}));
 expect(received.sent).toHaveLength(1);
 expect(received.sent[0].choice).toBe('confirmed');
 expect(received.sent[0].selected).toContain('brights');
 expect(received.sent[0].selected).toContain('blue-stripes');
 expect(received.sent[0].selected).not.toContain('singles');
 expect(received.sent[0].visible.hand).toHaveLength(5);
 expect(received.sent[0].evidence).toHaveLength(12);
 expect(received.continued).toBe(1);
});
test('phone opening dialog stays in the visible viewport and lets expert review options',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 const review=page.locator('#devOpeningReview');
 const viewport=await review.evaluate(el=>{
  const rect=el.getBoundingClientRect();
  return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,
   height:rect.height,viewportHeight:innerHeight,viewportWidth:innerWidth};
 });
 expect(viewport.top).toBeGreaterThanOrEqual(0);
 expect(viewport.bottom).toBeLessThanOrEqual(viewport.viewportHeight+1);
 expect(viewport.left).toBeGreaterThanOrEqual(0);
 expect(viewport.right).toBeLessThanOrEqual(viewport.viewportWidth+1);
 await review.getByRole('button',{name:'No, change strategies'}).click();
 await expect(review.locator('input[type=checkbox]')).toHaveCount(8);
 await review.getByRole('button',{name:'Back'}).click();
 await expect(review.locator('.dev-opening-review-options')).toBeHidden();
 await review.getByRole('button',{name:'Continue without saving'}).click();
 expect(await page.evaluate(()=>window.__sent.length)).toBe(0);
});
test('Not sure is stored as uncertain, never as confirmed labels',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'Not sure'}).click();
 await expect(page.locator('#devOpeningReview')).toHaveCount(0);
 const sent=await page.evaluate(()=>window.__sent);
 expect(sent).toHaveLength(1);
 expect(sent[0].choice).toBe('unsure');expect(sent[0].selected).toEqual([]);
});
test('Skip continues without network, and an unverified expert cannot silently submit',async({page})=>{
 await setup(page,{authorized:false});
 await page.getByRole('button',{name:'Yes, I agree'}).click();
 await expect(page.locator('#devOpeningReview')).toContainText('authorized development expert account');
 expect(await page.evaluate(()=>window.__sent.length)).toBe(0);
 await page.getByRole('button',{name:'Continue without saving'}).click();
 await expect(page.locator('#devOpeningReview')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__continued)).toBe(1);
 expect(await page.evaluate(()=>window.__sent.length)).toBe(0);
});
test('opening review and strategy feedback stay absent from ordinary Solo',async({page})=>{
 await setup(page);
 // The modal deliberately blocks the underlying game until an explicit answer.
 await page.getByRole('button',{name:'Continue without saving'}).click();
 await page.locator('#playSoloBtn').click();
 await expect(page.locator('#devOpeningReview')).toHaveCount(0);
 await page.evaluate(()=>{
  const layer=document.createElement('div');layer.className='training-opening-dismiss-layer';
  document.body.appendChild(layer);
 });
 await page.waitForTimeout(60);
 await expect(page.locator('#devOpeningReview')).toHaveCount(0);
});
test('Korean opening guidance and strategy labels are localized without changing card views',async({page})=>{
 await setup(page,{locale:'ko'});
 await expect(page.locator('#devOpeningReview')).toContainText('시작 전략 검토');
 await expect(page.locator('#devOpeningReview')).toContainText('추천된 시작 전략에 동의하십니까?');
 await page.getByRole('button',{name:'아니요, 전략 수정'}).click();
 await expect(page.locator('#devOpeningReview')).toContainText('광');
 await expect(page.locator('#devOpeningReview')).toContainText('홍단');
 await expect(page.locator('#playerHand .hand-card')).toHaveCount(5);
});

test('one Bright in hand plus one reachable Bright on table is never reported as two in hand',async({page})=>{
 await setup(page);
 // This reproduces the expert screenshot: the native opening strategy
 // aggregates hand + reachable floor cards into two potential Brights.
 await page.locator('#devOpeningReview').getByRole('button',{name:'Continue without saving'}).click();
 await page.evaluate(()=>{
  const eighth=document.createElement('button');
  eighth.className='hand-card';eighth.dataset.cardId='m8-4';
  document.getElementById('playerHand').append(eighth);
  document.getElementById('trainingCoachText').textContent=
   'Best strategy: Brights. Brights: 2 Brights are in hand, captured, or directly reachable; 1 can be acted on now. Tap or click anywhere when you are ready to continue.';
  const layer=document.createElement('div');
  layer.className='training-opening-dismiss-layer';
  document.body.appendChild(layer);
  window.__newOpeningGame='manual-fresh-game';
 });
 // Reset the review only through its ordinary Training entry point.
 await page.locator('#playSoloBtn').click();
 await page.locator('#trainingModeBtn').click();
 await page.evaluate(()=>{
  document.querySelector('.training-opening-dismiss-layer')?.remove();
  const layer=document.createElement('div');
  layer.className='training-opening-dismiss-layer';
  document.body.appendChild(layer);
 });
 await expect(page.locator('#devOpeningReview')).toBeVisible();
 await expect(page.locator('#devOpeningReview .dev-opening-review-recommendation')).toContainText('Brights');
 await expect(page.locator('#devOpeningReview .dev-opening-review-location-counts'))
  .toContainText('Brights: 1 in hand, 0 captured, 1 reachable on the table.');
 await expect(page.locator('#trainingCoachText'))
  .toContainText('Brights: 1 in hand, 0 captured, 1 reachable on the table.');
 await expect(page.locator('#trainingCoachText'))
  .not.toContainText('2 Brights are in hand, captured, or directly reachable');
 await page.locator('#devOpeningReview').getByRole('button',{name:'No, change strategies'}).click();
 await expect(page.locator('#devOpeningReview input[value="brights"]')).toBeChecked();
 await expect(page.locator('#devOpeningReview .dev-opening-review-evidence').first())
  .toContainText('1 in hand');
});
