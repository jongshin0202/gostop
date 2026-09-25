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

test('touch selection survives hand rerenders by card identity instead of DOM identity',()=>{
  assert.match(presentation,/let touchSelectedCardId=null/);
  assert.match(presentation,/const cardIdentity=card=>String\(card\?\.dataset\?\.cardId\|\|card\?\.closest\?\.\('\.hand-card-slot'\)\?\.dataset\?\.handKey\|\|''\)/);
  assert.match(presentation,/touchSelectedCardId=cardIdentity\(card\)/);
  assert.match(presentation,/touchSelectedCardId===id/);
  assert.doesNotMatch(presentation,/touchSelectedCard===card/);
});

test('mobile gestures prefer native TouchEvents on touch phones and tolerate low-end tap jitter',()=>{
  assert.match(presentation,/const pointerTouchSupported=typeof globalThis\.PointerEvent==='function'/);
  assert.match(presentation,/const nativeTouchSupported=\('ontouchstart' in globalThis\)\|\|Number\(globalThis\.navigator\?\.maxTouchPoints\|\|0\)>0/);
  assert.match(presentation,/if\(event\.pointerType==='touch'\)\{[\s\S]*if\(nativeTouchSupported\)return;[\s\S]*beginPointerTouch\(event\)/);
  assert.match(presentation,/if\(nativeTouchSupported\|\|!pointerTouchSupported\)\{[\s\S]*addEventListener\('touchstart'/);
  assert.match(presentation,/const tap=!browsed&&Math\.abs\(dx\)<=18&&Math\.abs\(dy\)<=18&&endTime-state\.anchorTime<=650/);
  assert.match(presentation,/if\(tap&&state\.wasSelected\)\{triggerPlay\(cardId\);return;\}/);
});

test('flick classifier tolerates slower phones while rejecting jitter and horizontal browsing',()=>{
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:120}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:500}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:210,duration:80}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:700}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:400,endY:190,duration:100}),false);
});

test('pointer intent separates horizontal browsing from upward flicking',()=>{
  assert.match(presentation,/sideways>=16&&sideways>Math\.max\(12,Math\.abs\(up\)\*1\.20\)/);
  assert.match(presentation,/up>=12&&up>=sideways\*\.72/);
  assert.match(presentation,/state\.intent='flick'/);
  assert.match(presentation,/state\.intent='browse'/);
  assert.match(presentation,/if\(state\.intent==='browse'\)[\s\S]*nearestHandCard/);
  assert.match(presentation,/if\(state\.intent==='flick'\)[\s\S]*ensureGhost/);
});

test('pointerup classifies flick and second tap even if move delivery was sparse',()=>{
  assert.match(presentation,/const flick=!browsed&&isUpwardFlick\(\{startX:state\.anchorX,startY:state\.anchorY,endX,endY,duration:/);
  assert.match(presentation,/if\(tap&&state\.wasSelected\)\{triggerPlay\(cardId\);return;\}/);
  assert.equal(plan.isUpwardFlick({startX:100,startY:500,endX:108,endY:445,duration:180}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:500,endX:170,endY:485,duration:180}),false);
});

test('touch pointers commit on pointerup and suppress generated browser clicks',()=>{
  assert.match(presentation,/addEventListener\('pointerdown'[\s\S]*beginPointerTouch\(event\)/);
  assert.match(presentation,/addEventListener\('pointermove'[\s\S]*classifyMove\(state,event\.clientX,event\.clientY\)/);
  assert.match(presentation,/addEventListener\('pointerup'[\s\S]*finishGesture\(state,event\.clientX,event\.clientY,now\(\),event\)/);
  assert.match(presentation,/Date\.now\(\)<suppressTouchClicksUntil\|\|Date\.now\(\)<suppressPointerClicksUntil/);
});

test('gesture layer activates the canonical game input directly before falling back to click',()=>{
  const gesture=presentation.slice(presentation.indexOf('function installHandFlickGestures'),presentation.indexOf('function pendingOnlineStageIds'));
  assert.match(gesture,/new CustomEventCtor\('gostop-hand-activate',\{cancelable:true,detail:\{cardId,blank:/);
  assert.match(gesture,/const unhandled=doc\.dispatchEvent\(activation\);[\s\S]*if\(!unhandled\)return true;[\s\S]*card\.click\(\)/);
  assert.match(app,/document\.addEventListener\('gostop-hand-activate',event=>\{/);
  assert.match(app,/void humanPlay\(cardId,live\)/);
  assert.doesNotMatch(gesture,/onlineSubmit\(/);
  assert.doesNotMatch(gesture,/matchesFor\(/);
  assert.doesNotMatch(gesture,/chooseFloorTarget\(/);
  const online=app.slice(app.indexOf('async function humanPlay'),app.indexOf('// While choosing between two floor targets'));
  assert.match(online,/if\(needsPrePlayDecision\)\{[\s\S]*onlineSubmit\(\{type:'attemptPlayCard',cardId\}\)/);
  assert.match(online,/await submitOnlineCardPlay\(\)/);
});
