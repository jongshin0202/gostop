const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const plan=require('../presentation-plan.js');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const presentation=fs.readFileSync(path.join(root,'presentation-plan.js'),'utf8');

test('physical motion has one isolated viewport layer above the board',()=>{
  assert.match(html,/id="cardMotionLayer" class="card-motion-layer"/);
  assert.match(css,/\.card-motion-layer\{position:fixed;inset:0;z-index:1000;pointer-events:none;isolation:isolate;overflow:visible\}/);
  assert.match(app,/\(els\.cardMotionLayer\|\|document\.body\)\.appendChild\(el\)/);
  assert.doesNotMatch(presentation,/214748[0-9]+/);
});

test('staged physical card owns visibility until shared cleanup',()=>{
  assert.match(app,/function stagePhysicalCard\(id,el\)/);
  assert.match(app,/function syncStageOwnedCards\(\)/);
  assert.match(app,/syncStageOwnedCards\(\);/);
  assert.match(app,/function removeStage\(id\)[\s\S]*style\.visibility=''\);/);
});

test('mobile hand input is native-touch first and resets every new hand/game',()=>{
  assert.match(presentation,/doc\.addEventListener\('touchstart'/);
  assert.match(presentation,/doc\.addEventListener\('touchmove'/);
  assert.match(presentation,/doc\.addEventListener\('touchend'/);
  assert.match(presentation,/doc\.addEventListener\('touchcancel'/);
  assert.match(presentation,/doc\.addEventListener\('gostop-hand-reset',resetGestureState\)/);
  assert.match(app,/document\.dispatchEvent\(new Event\('gostop-hand-reset'\)\)/);
  assert.doesNotMatch(presentation,/pointerTouchSupported|nativeTouchSupported/);
});

test('native touch keeps horizontal browse, upward flick, and second tap as distinct outcomes',()=>{
  assert.match(presentation,/const secondTap=!state\.dragging&&!state\.browsing&&!state\.switched&&state\.wasSelected/);
  assert.match(presentation,/if\(flick\)\{[\s\S]*triggerPlay\(card\)/);
  assert.match(presentation,/else if\(browsed\)\{[\s\S]*clearSelection\(\)/);
  assert.match(presentation,/else if\(secondTap\)\{[\s\S]*triggerPlay\(card\)/);
  assert.match(presentation,/bypassClickCard=card;[\s\S]*try\{card\.click\(\);\}finally\{bypassClickCard=null;\}/);
});

test('desktop pointer support does not take ownership of touch pointers or normal clicks',()=>{
  assert.match(presentation,/doc\.addEventListener\('pointerdown',event=>\{[\s\S]*if\(event\.pointerType==='touch'\|\|event\.button!==0\)return/);
  assert.match(presentation,/doc\.addEventListener\('click',event=>\{[\s\S]*if\(card===bypassClickCard\)return/);
  assert.match(presentation,/if\(Date\.now\(\)<suppressTouchClicksUntil\|\|Date\.now\(\)<suppressPointerClicksUntil\)/);
});

test('flick classifier tolerates slower phones while rejecting jitter and horizontal browsing',()=>{
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:120}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:500}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:210,duration:80}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:700}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:400,endY:190,duration:100}),false);
});
