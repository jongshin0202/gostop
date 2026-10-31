import {test,expect} from '@playwright/test';
const oldSingle='Recommended: Use as Single. Use as 2 Singles. You would have 3 Single value, which is more useful right now than one ordinary Picture.';
const fixedSingle='Recommended: Use as Single. The Sake Cup counts as 2 Singles.';
async function setup(page){
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.setContent(`<!doctype html><html lang="en"><body>
    <dialog id="gukjinDialog">
      <p id="gukjinTrainingReason" hidden></p>
      <button id="gukjinSingleBtn" type="button">Use as Single</button>
      <button id="gukjinPictureBtn" type="button">Use as Picture</button>
    </dialog>
    <div id="gameCardState">untouched</div>
  </body></html>`);
  await page.addScriptTag({path:'dev-site/training-sake-cup-copy.js'});
}
test('corrects only English Single explanation, not the decision or buttons',async({page})=>{
  await setup(page);
  await page.evaluate(t=>{
    const r=document.getElementById('gukjinTrainingReason');
    r.textContent=t;r.hidden=false;
    document.getElementById('gukjinSingleBtn').classList.add('training-choice-recommended');
    document.getElementById('gukjinDialog').showModal();
  },oldSingle);
  await expect(page.locator('#gukjinTrainingReason')).toHaveText(fixedSingle);
  await expect(page.locator('#gukjinSingleBtn')).toHaveClass(/training-choice-recommended/);
  await expect(page.locator('#gukjinPictureBtn')).not.toHaveClass(/training-choice-recommended/);
  await expect(page.locator('#gameCardState')).toHaveText('untouched');
});
test('copy stays unchanged before the dialog is open',async({page})=>{
  await setup(page);
  await page.evaluate(t=>{
    const r=document.getElementById('gukjinTrainingReason');
    r.textContent=t;r.hidden=false;
    document.getElementById('gukjinSingleBtn').classList.add('training-choice-recommended');
  },oldSingle);
  await expect(page.locator('#gukjinTrainingReason')).toHaveText(oldSingle);
});
test('preserves a Picture recommendation and all non-English copy',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const r=document.getElementById('gukjinTrainingReason');
    r.hidden=false;r.textContent='Recommended: Use as Picture. The Picture option is more useful.';
    document.getElementById('gukjinPictureBtn').classList.add('training-choice-recommended');
    document.getElementById('gukjinDialog').showModal();
  });
  await expect(page.locator('#gukjinTrainingReason')).toHaveText('Recommended: Use as Picture. The Picture option is more useful.');
  await page.evaluate(()=>{
    document.getElementById('gukjinPictureBtn').classList.remove('training-choice-recommended');
    document.getElementById('gukjinSingleBtn').classList.add('training-choice-recommended');
    document.documentElement.lang='ko';
    document.getElementById('gukjinTrainingReason').textContent='국진 술잔을 쌍피로 사용하세요.';
  });
  await expect(page.locator('#gukjinTrainingReason')).toHaveText('국진 술잔을 쌍피로 사용하세요.');
});
test('does not rewrite any text without the Single recommendation state',async({page})=>{
  await setup(page);
  await page.evaluate(t=>{
    const r=document.getElementById('gukjinTrainingReason');
    r.hidden=false;r.textContent=t;
    document.getElementById('gukjinDialog').showModal();
  },oldSingle);
  await expect(page.locator('#gukjinTrainingReason')).toHaveText(oldSingle);
});
test('corrects every existing English Single branch without using captured total as card value',async({page})=>{
  await setup(page);
  const reasons=[
    'Recommended: Use as Single. Use as 2 Singles. That gives you 10 Single value and 1 Single point now; as a Picture it would give 4 Pictures and 0 Picture points.',
    'Recommended: Use as Single. Use as 2 Singles. Singles are your best current scoring route, and this card advances that route twice as fast as an ordinary Single.'
  ];
  await page.evaluate(()=>{
    document.getElementById('gukjinTrainingReason').hidden=false;
    document.getElementById('gukjinSingleBtn').classList.add('training-choice-recommended');
    document.getElementById('gukjinDialog').showModal();
  });
  for(const advice of reasons){
    await page.evaluate(t=>document.getElementById('gukjinTrainingReason').textContent=t,advice);
    await expect(page.locator('#gukjinTrainingReason')).toHaveText(fixedSingle);
  }
});
