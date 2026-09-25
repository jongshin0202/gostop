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

test('touch flick sampling retains the full gesture window for slower phones',()=>{
  assert.match(presentation,/const cutoff=time-360/);
  assert.match(presentation,/const cutoff=endTime-320/);
  assert.match(presentation,/const secondTap=!state\.dragging&&!browsed&&state\.wasSelected&&Math\.abs\(endX-state\.anchorX\)<18&&Math\.abs\(endY-state\.anchorY\)<18/);
});

test('flick classifier tolerates slower phones while rejecting jitter and horizontal browsing',()=>{
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:120}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:500}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:210,duration:80}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:104,endY:160,duration:700}),false);
  assert.equal(plan.isUpwardFlick({startX:100,startY:220,endX:400,endY:190,duration:100}),false);
});

test('touch intent locks upward flicks before horizontal browsing can switch cards',()=>{
  assert.match(presentation,/const upwardIntent=up>=10&&up>=sideways\*\.75/);
  assert.match(presentation,/const browseIntent=sideways>=14&&sideways>Math\.max\(10,Math\.abs\(up\)\*1\.25\)/);
  assert.match(presentation,/state\.intent='flick'/);
  assert.match(presentation,/state\.intent='browse'/);
  assert.match(presentation,/if\(state\.intent==='browse'\)[\s\S]*nearestHandCard/);
  assert.match(presentation,/if\(state\.intent==='flick'\)[\s\S]*startX:state\.anchorX,startY:state\.anchorY/);
  assert.doesNotMatch(presentation,/state\.anchorX=x;[\s\S]{0,120}state\.anchorY=y/);
});

test('touchend can classify an upward flick even when a slow phone skipped intermediate touchmove delivery',()=>{
  assert.match(presentation,/const flick=!browsed&&isUpwardFlick\(flickSample\)/);
  assert.match(presentation,/const secondTap=!state\.dragging&&!browsed&&state\.wasSelected&&Math\.abs\(endX-state\.anchorX\)<18&&Math\.abs\(endY-state\.anchorY\)<18/);
  assert.equal(plan.isUpwardFlick({startX:100,startY:500,endX:108,endY:445,duration:180}),true);
  assert.equal(plan.isUpwardFlick({startX:100,startY:500,endX:170,endY:485,duration:180}),false);
});

test('touch and pointer flicks commit before release and suppress generated clicks',()=>{
  assert.match(presentation,/processTouchMove[\s\S]*isUpwardFlick\(flickSample\)[\s\S]*triggerPlay\(card\)/);
  assert.match(presentation,/addEventListener\('pointerdown'/);
  assert.match(presentation,/addEventListener\('pointermove'[\s\S]*isUpwardFlick\(sample\)[\s\S]*triggerPlay\(state\.card\)/);
  assert.match(presentation,/suppressTouchClicksUntil\|\|Date\.now\(\)<suppressPointerClicksUntil/);
});

test('gesture layer reuses canonical click path without ranked authority logic',()=>{
  const gesture=presentation.slice(presentation.indexOf('function installHandFlickGestures'),presentation.indexOf('function pendingOnlineStageIds'));
  assert.match(gesture,/const triggerPlay=card=>[\s\S]*card\.click\(\)/);
  assert.doesNotMatch(gesture,/onlineSubmit\(/);
  assert.doesNotMatch(gesture,/matchesFor\(/);
  assert.doesNotMatch(gesture,/chooseFloorTarget\(/);
  const online=app.slice(app.indexOf('async function humanPlay'),app.indexOf('// While choosing between two floor targets'));
  assert.match(online,/if\(needsPrePlayDecision\)\{[\s\S]*onlineSubmit\(\{type:'attemptPlayCard',cardId\}\)/);
  assert.match(online,/await submitOnlineCardPlay\(\)/);
});
