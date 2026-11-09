import {test,expect} from '@playwright/test';
const weights=()=>{const w=Array(16).fill(0);w[11]=2;return w;};
async function fixture(page,{active=true,bright=false,delayed=false}={}){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.setContent([
 '<!doctype html><html lang="en"><body>',
 '<button id="trainingModeBtn">Training</button><button id="playSoloBtn">Solo</button>',
 '<aside id="trainingCoachPanel" hidden><strong id="trainingCoachTitle">Recommended Move</strong>',
 '<p id="trainingCoachText">Play Iris onto Iris first.</p></aside>',
 '<div id="playerHand">',
 '<button class="hand-card" data-card-id="m2-3" title="Plum Single">Plum Single</button>',
 '<button class="hand-card" data-card-id="m5-3" title="Iris Single">Iris Single</button>',
 bright?'<button class="hand-card" data-card-id="m1-3" title="Pine Single">Pine Single</button>':'',
 '</div><div id="floor">',
 '<button class="floor-card" data-card-id="m2-1" title="Plum Bird Picture">Plum Bird Picture</button>',
 '<button class="floor-card" data-card-id="m5-1" title="Iris Picture">Iris Picture</button>',
 bright?'<button class="floor-card" data-card-id="m1-1" title="Pine Bright">Pine Bright</button>':'',
 '</div><div id="playerCaptured"></div><div id="aiCaptured"></div>',
 '<dialog id="shakeDialog"></dialog><dialog id="bombDialog"></dialog>',
 '<dialog id="gukjinDialog"></dialog><dialog id="decisionDialog"></dialog>',
 '<dialog id="resultDialog"></dialog></body></html>'
 ].join(''));
 const state={ok:true,developmentModelVersion:4,
  activeCardModel:active?{version:4,examples:5,weights:weights()}:null};
 await page.evaluate(({state,delayed})=>{
  globalThis.GoStopEngine={masterDeck:[
   {id:'m2-1',month:2,type:'animal',flags:['godori']},
   {id:'m2-3',month:2,type:'pi',flags:[]},
   {id:'m5-1',month:5,type:'animal',flags:[]},
   {id:'m5-3',month:5,type:'pi',flags:[]},
   {id:'m1-1',month:1,type:'bright',flags:[]},
   {id:'m1-3',month:1,type:'pi',flags:[]}
  ]};
  globalThis.GoStopTrainingCloud={
   state:()=>delayed?new Promise(resolve=>{globalThis.resolveCardModel=()=>resolve(state);}):Promise.resolve(state)
  };
 },{state,delayed});
 await page.addScriptTag({path:'dev-site/training-model-inference.js'});
 await page.addScriptTag({path:'dev-site/training-recommendation-preserver.js'});
 await page.locator('#trainingModeBtn').click();
 if(active&&!delayed){
  await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevTrainingModelInference.getStatus().version)).toBe(4);
 }else if(!active){
  await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevTrainingModelInference.getStatus().enabled)).toBe(true);
 }
 const nativeHand=bright?'m1-3':'m5-3',nativeFloor=bright?'m1-1':'m5-1';
 await page.evaluate(({nativeHand,nativeFloor})=>{
  document.querySelector('#playerHand [data-card-id="'+nativeHand+'"]').classList.add('matchable');
  document.querySelector('#floor [data-card-id="'+nativeFloor+'"]').classList.add('training-recommended');
  document.getElementById('trainingCoachPanel').hidden=false;
 },{nativeHand,nativeFloor});
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().locked)).toBe(true);
}
test('activated card weights change only equal-priority captures on PC',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await fixture(page);
 const state=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(state.modelPriority).toBe(true);
 expect(state.hand).toBe('m2-3');expect(state.floor).toBe('m2-1');
 await expect(page.locator('#trainingCoachText')).toContainText('activated Training model v4');
 await expect(page.locator('#playerHand [data-card-id="m2-3"]')).toHaveClass(/matchable/);
 await expect(page.locator('#playerHand [data-card-id="m5-3"]')).not.toHaveClass(/matchable/);
});
test('same inference displays on Android portrait',async({page})=>{
 await page.setViewportSize({width:393,height:852});await fixture(page);
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus().hand)).toBe('m2-3');
});
test('unactivated model never overrides native recommendation',async({page})=>{
 await fixture(page,{active:false});
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.modelPriority).toBe(false);
 expect(s.hand).toBe('m5-3');expect(s.floor).toBe('m5-1');
});
test('Bright capture remains protected despite learned birdie preference',async({page})=>{
 await fixture(page,{bright:true});
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.modelPriority).toBe(false);
 expect(s.hand).toBe('m1-3');expect(s.floor).toBe('m1-1');
});
test('late weights never change an existing turn recommendation',async({page})=>{
 await fixture(page,{delayed:true});
 await page.evaluate(()=>globalThis.resolveCardModel());
 await expect.poll(()=>page.evaluate(()=>globalThis.GoStopDevTrainingModelInference.getStatus().version)).toBe(4);
 const s=await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus());
 expect(s.hand).toBe('m5-3');
 expect(s.modelPriority).toBe(false);
});
test('leaving Training disables model and clears in-memory active weights',async({page})=>{
 await fixture(page);
 await page.locator('#playSoloBtn').click();
 const s=await page.evaluate(()=>globalThis.GoStopDevTrainingModelInference.getStatus());
 expect(s.enabled).toBe(false);expect(s.version).toBe(null);
 expect((await page.evaluate(()=>globalThis.GoStopTrainingRecommendationDev.getStatus())).active).toBe(false);
});
