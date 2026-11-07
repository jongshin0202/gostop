import {test,expect} from '@playwright/test';

async function setup(page,{mode='safe'}={}){
 await page.goto('/training-learning/test-fixture.html',{waitUntil:'domcontentloaded'});
 const hand=mode==='safe'?['m1-4']:['m4-1'];
 const floor=mode==='safe'?['m1-1','m2-1']:['m1-1','m2-1','m3-1'];
 const ownCaptured=mode==='safe'?['m1-2','m1-3']:[];
 await page.setContent(`<!doctype html><html lang="en"><body>
 <button id="trainingModeBtn">Training</button>
 <div id="trainingCoachPanel"><b id="trainingCoachTitle">Go / Stop Advice</b><p id="trainingCoachText">STOP. Generic comeback risk.</p></div>
 <div id="playerHand"></div><div id="floor"></div><div id="playerCaptured"></div><div id="aiCaptured"></div>
 <span id="playerScore">7</span><span id="aiScore">${mode==='safe'?2:4}</span>
 <span id="goCount">0</span>
 <dialog id="decisionDialog"><button id="goBtn" class="${mode==='safe'?'':'training-choice-recommended'}">GO</button>
 <button id="stopBtn" class="${mode==='safe'?'training-choice-recommended':''}">STOP</button></dialog>
 </body></html>`);
 await page.evaluate(({hand,floor,ownCaptured})=>{
  const card=(id)=>'<span class="hand-card" data-card-id="'+id+'"></span>';
  const fc=(id)=>'<span class="floor-card" data-card-id="'+id+'"></span>';
  const cap=(id)=>'<span class="captured-mini" data-card-id="'+id+'"></span>';
  document.getElementById('playerHand').innerHTML=hand.map(card).join('');
  document.getElementById('floor').innerHTML=floor.map(fc).join('');
  document.getElementById('playerCaptured').innerHTML=ownCaptured.map(cap).join('');
  globalThis.GoStopEngine={
   masterDeck:[1,2,3,4].flatMap(month=>[1,2,3,4].map(n=>({
    id:'m'+month+'-'+n,month,type:'pi',flags:[]
   }))),
   scorePlayer:player=>({total:player.captured.length})
  };
  globalThis.GoStopTrainingFeedbackDev={getStatus:()=>({active:true})};
 },{hand,floor,ownCaptured});
 await page.addScriptTag({path:'dev-site/training-go-stop-advice.js'});
 await page.locator('#decisionDialog').evaluate(el=>el.showModal());
}
test('Training STOP becomes GO when opponent has no visible seven-point route and next capture is protected',async({page})=>{
 await setup(page,{mode:'safe'});
 await expect(page.locator('#goBtn')).toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#stopBtn')).not.toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#trainingCoachText')).toContainText('GO.');
 await expect(page.locator('#trainingCoachText')).toContainText('below 7');
});
test('Training GO becomes STOP when opponent can reach seven and user has no scoring match',async({page})=>{
 await setup(page,{mode:'risk'});
 await expect(page.locator('#stopBtn')).toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#goBtn')).not.toHaveClass(/training-choice-recommended/);
 await expect(page.locator('#trainingCoachText')).toContainText('STOP.');
 await expect(page.locator('#trainingCoachText')).toContainText('reach');
});
