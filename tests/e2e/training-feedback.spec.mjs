import {test,expect} from '@playwright/test';

async function setup(page,email='jwshin1@gmail.com'){
  await page.goto('/');
  await page.setContent(`<!doctype html><html lang="en"><head></head><body>
    <button id="trainingModeBtn">Training</button>
    <button id="playSoloBtn">Friendly Solo</button><button id="quitYesBtn">Quit</button>
    <aside id="trainingCoachPanel"><strong id="trainingCoachTitle">Recommended Move</strong></aside>
    <div id="floor"><div class="floor-card training-recommended" data-card-id="m6-2"><img alt="Rose Ribbon"></div></div>
    <div id="playerHand">
      <button class="hand-card matchable" data-card-id="m6-3"><img alt="Rose Single"></button>
      <button class="hand-card" data-card-id="m6-4" id="alternate"><img alt="Rose Double Single"></button>
    </div><dialog id="resultDialog"></dialog>
  </body></html>`);
  await page.evaluate(e=>{
    const cards=[
      {id:'m6-2',month:6,type:'ribbon',ribbonSet:'blue',flags:[]},
      {id:'m6-3',month:6,type:'pi',flags:[]},
      {id:'m6-4',month:6,type:'pi',flags:['doublePi']}
    ];
    globalThis.GoStopEngine={masterDeck:()=>cards};
    globalThis.GoStopRanked={getAccount:()=>e?{email:e}:null};
    globalThis.__actualPlays=0;
    document.getElementById('alternate').addEventListener('click',()=>globalThis.__actualPlays++);
  },email);
  await page.addScriptTag({path:'training-learning/learner.js'});
  await page.addScriptTag({path:'training-learning/feedback-ui.js'});
  await page.locator('#trainingModeBtn').click();
}
test('only confirmed training disagreement is learned after finished game, without suppressing clicks',async({page})=>{
  await setup(page);
  await page.locator('#alternate').click();
  const dialog=page.locator('#trainingFeedbackDialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>globalThis.__actualPlays)).toBe(1);
  await expect(dialog).toContainText('Your move');
  await dialog.getByRole('button',{name:'My move was better'}).click();
  await expect(dialog).not.toBeVisible();
  let state=await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus());
  expect(state.examples).toBe(1);
  expect(state.modelExamples).toBe(0);
  await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
  await expect.poll(async()=>page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().modelExamples)).toBe(1);
});
test('explicit mistake reinforces recommendation rather than the clicked card',async({page})=>{
  await setup(page);
  await page.locator('#alternate').click();
  await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'Recommendation was better'}).click();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('gostop-training-feedback-v1')));
  expect(data.at(-1).choice).toBe('recommended');
  expect(data.at(-1).recommended.hand).toBe('m6-3');
});
test('uncertain move is recorded but never becomes learning label',async({page})=>{
  await setup(page);
  await page.locator('#alternate').click();
  await page.locator('#trainingFeedbackDialog').getByRole('button',{name:'Not sure / experiment'}).click();
  await page.evaluate(()=>document.getElementById('resultDialog').setAttribute('open',''));
  expect(await page.evaluate(()=>globalThis.GoStopTrainingFeedbackDev.getStatus().modelExamples)).toBe(0);
});
test('no feedback outside specified development account',async({page})=>{
  await setup(page,'other@example.com');
  await page.locator('#alternate').click();
  await expect(page.locator('#trainingFeedbackDialog')).not.toBeVisible();
});
