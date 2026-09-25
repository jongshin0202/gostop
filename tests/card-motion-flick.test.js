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

test('touch selection is card-identity based and resets every new hand/game',()=>{
  assert.match(presentation,/let selectedCardId=null/);
  assert.match(presentation,/const cardIdentity=card=>String\(card\?\.dataset\?\.cardId\|\|card\?\.closest\?\.\('\.hand-card-slot'\)\?\.dataset\?\.handKey\|\|''\)/);
  assert.match(presentation,/selectedCardId=cardIdentity\(card\)/);
  assert.match(presentation,/doc\.addEventListener\('gostop-hand-reset',resetGestureState\)/);
  assert.match(app,/document\.dispatchEvent\(new Event\('gostop-hand-reset'\)\)/);
});

test('pointer events own modern phone hand gestures with native touch as fallback',()=>{
  assert.match(presentation,/const nativeTouchSupported=\('ontouchstart' in globalThis\)\|\|Number\(globalThis\.navigator\?\.maxTouchPoints\|\|0\)>0/);
  assert.match(presentation,/const pointerTouchSupported=typeof globalThis\.PointerEvent==='function'/);
  assert.match(presentation,/if\(pointerTouchSupported\)\{[\s\S]*addEventListener\('pointerdown'/);
  assert.match(presentation,/addEventListener\('pointermove'/);
  assert.match(presentation,/addEventListener\('pointerup'/);
  assert.match(presentation,/if\(nativeTouchSupported&&!pointerTouchSupported\)\{[\s\S]*addEventListener\('touchstart'/);
  assert.match(presentation,/addEventListener\('touchmove'/);
  assert.match(presentation,/addEventListener\('touchend'/);
});

test('horizontal browse, upward flick, and tap are separate deterministic outcomes',()=>{
  assert.match(presentation,/sideways>=10&&sideways>Math\.max\(8,Math\.abs\(up\)\*1\.10\)/);
  assert.match(presentation,/up>=10&&up>sideways\*1\.05/);
  assert.match(presentation,/state\.intent='browse'/);
  assert.match(presentation,/state\.intent='flick'/);
  assert.match(presentation,/const flick=state\.intent!=='browse'&&isUpwardFlick/);
  assert.match(presentation,/minUpwardDistance:10,minTravelDistance:22,maxDuration:750,minSpeed:\.035,maxHorizontalRatio:\.95/);
  assert.match(presentation,/const browsed=state\.intent==='browse'/);
  assert.match(presentation,/const tap=Math\.abs\(dx\)<=22&&Math\.abs\(dy\)<=22&&endTime-state\.startTime<=800/);
  assert.match(presentation,/clearPreviousClickSuppression\(\)/);
  assert.match(presentation,/suppressNextClick\(state\.cardId\)/);
});

test('browse release clears the raised hover instead of leaving the last card sticking out',()=>{
  const end=presentation.slice(presentation.indexOf("doc.addEventListener('touchend'"),presentation.indexOf("doc.addEventListener('touchcancel'"));
  assert.match(end,/if\(browsed\)\{[\s\S]*clearSelection\(\);return;/);
  const browseBranch=end.slice(end.indexOf('if(browsed){'),end.indexOf('const tap='));
  assert.doesNotMatch(browseBranch,/commitSelection/);
});

test('modern pointer path commits the second tap and upward flick without synthesized click timing',()=>{
  const pointer=presentation.slice(presentation.indexOf('if(pointerTouchSupported){'),presentation.indexOf('if(nativeTouchSupported&&!pointerTouchSupported){'));
  assert.match(pointer,/if\(flick\)\{clearSelection\(\);triggerPlay\(state\.cardId\);return;\}/);
  assert.match(pointer,/if\(state\.wasSelected\)\{clearSelection\(\);triggerPlay\(state\.cardId\);\}/);
  assert.match(pointer,/event\.preventDefault\(\);event\.stopPropagation\(\);suppressNextClick\(state\.cardId,420\)/);
});

test('second tap and upward flick play through the live card click handler',()=>{
  assert.match(presentation,/if\(flick\)\{[\s\S]*triggerPlay\(state\.cardId\);return;/);
  assert.match(presentation,/if\(state\.wasSelected\)\{clearSelection\(\);triggerPlay\(state\.cardId\);\}/);
  assert.match(presentation,/bypassClickCard=card;[\s\S]*card\.click\(\);[\s\S]*bypassClickCard=null/);
  assert.match(app,/el\.addEventListener\('click',\(\)=>\{void humanPlay\(card\.id,el\);\}\)/);
  assert.match(app,/blank\.addEventListener\('click',\(\)=>\{void humanUseBombBlank\(\);\}\)/);
});

test('flick classifier tolerates slower phones while rejecting jitter and horizontal browsing',()=>{
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:120}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:500}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:210,duration:80}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:700}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:400,endY:190,duration:100}),false);
});
