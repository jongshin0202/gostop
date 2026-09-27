'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');

test('main menu opens its submenu on the same frame with a fast grid-track slide',()=>{
  assert.match(ranked,/immediateMenuSuppressUntil=Date\.now\(\)\+280/);
  assert.match(ranked,/grid-template-rows:0fr!important/);
  assert.match(ranked,/grid-template-rows:1fr!important/);
  assert.match(ranked,/transition:grid-template-rows \.14s/);
  assert.match(ranked,/menu-submenu-inner/);
  assert.doesNotMatch(ranked,/submenu\.style\.setProperty\('--submenu-open-height'/);
  assert.match(ranked,/\.menu-category-chevron\{transition:transform \.10s ease!important\}/);
  assert.match(ranked,/\.menu-category-toggle:hover,\.menu-category-toggle:focus-visible\{filter:none!important\}/);
});

test('verification dialog self-heals after email verification without manual dismissal',()=>{
  assert.match(ranked,/verificationWatchTimer=setInterval\(\(\)=>\{void checkVerificationCompletion\(\);\},15000\)/);
  assert.match(ranked,/api\('\/api\/auth\/login',\{method:'POST',body:pendingVerificationCredentials,auth:false\}\)/);
  assert.match(ranked,/saveSession\(data\);const success=verificationSuccessData\(data\);pendingVerificationCredentials=null;stopVerificationWatch\(\);verificationDialog\.close\(\);showAccountSuccess\('verified',success\)/);
  assert.match(ranked,/addEventListener\('focus',\(\)=>\{if\(verificationDialog\.open\)void checkVerificationCompletion\(\);\}\)/);
  assert.match(ranked,/visibilitychange',[^\n]*verificationDialog\.open[^\n]*checkVerificationCompletion/);
});

test('Training coach values public-state month control and discounts no-Pi bombs',()=>{
  const training=app.slice(app.indexOf('function trainingThreatValue'),app.indexOf('function showTrainingCoach'));
  assert.match(training,/function trainingMonthControlValue/);
  assert.match(training,/facts\.hand\.length>=2/);
  assert.match(training,/function trainingBombAdjustment/);
  assert.match(training,/opponentPi>0\?18:-78/);
  assert.match(training,/if\(safeControl&&noPi\)/);
  assert.doesNotMatch(training,/state\.ai(?:\?\.|\.)hand/);
});


test('Training opening strategy stays pinned until user input, then normal five-second coaching resumes',()=>{
  assert.match(app,/trainingCoachPinned:false/);
  assert.match(app,/showTrainingCoach\('Opening Strategy',openingAdvice,\{pinned:true\}\)/);
  assert.match(app,/if\(presentation\.trainingCoachPinned\)return;[\s\S]*setTimeout\(\(\)=>\{[\s\S]*\},5000\)/);
  assert.match(app,/document\.addEventListener\('pointerdown',event=>\{[\s\S]*presentation\.trainingCoachPinned[\s\S]*hideTrainingCoach\(\)[\s\S]*armTrainingCoach/);
  assert.match(app,/if\(!presentation\.trainingCoachPinned\)clearTrainingCoach\(\)/);
});
