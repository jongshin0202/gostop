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
test('opening review lists all eight strategies and multi-selects Brights + Singles without covering cards',async({page})=>{
 await setup(page);
 const review=page.locator('#devOpeningReview');
 await expect(review.locator('input[type=checkbox]')).toHaveCount(8);
 await expect(review.locator('input[value="brights"]')).toBeChecked();
 await expect(review.locator('input[value="singles"]')).toBeChecked();
 await expect(review.locator('input[value="red-stripes"]')).not.toBeChecked();
 const geom=await page.evaluate(()=>{
  const panel=document.getElementById('devOpeningReview').getBoundingClientRect();
  const stage=document.querySelector('main.game-stage').getBoundingClientRect();
  const hand=document.getElementById('playerHand').getBoundingClientRect();
  return {panelTop:panel.top,stageBottom:stage.bottom,handBottom:hand.bottom};
 });
 expect(geom.panelTop).toBeGreaterThanOrEqual(geom.stageBottom-2);
 expect(geom.panelTop).toBeGreaterThanOrEqual(geom.handBottom-2);
 await review.locator('input[value="blue-stripes"]').check();
 await review.locator('input[value="singles"]').uncheck();
 await review.getByRole('button',{name:'Submit expert feedback'}).click();
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
 await page.getByRole('button',{name:'Submit expert feedback'}).click();
 await expect(page.locator('#devOpeningReview')).toContainText('authorized development expert account');
 expect(await page.evaluate(()=>window.__sent.length)).toBe(0);
 await page.getByRole('button',{name:'Continue without saving'}).click();
 await expect(page.locator('#devOpeningReview')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__continued)).toBe(1);
 expect(await page.evaluate(()=>window.__sent.length)).toBe(0);
});
test('opening review and strategy feedback stay absent from ordinary Solo',async({page})=>{
 await setup(page);
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
 await expect(page.locator('#devOpeningReview')).toContainText('광');
 await expect(page.locator('#devOpeningReview')).toContainText('홍단');
 await expect(page.locator('#playerHand .hand-card')).toHaveCount(5);
});
