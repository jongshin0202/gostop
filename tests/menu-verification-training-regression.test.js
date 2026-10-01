'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');

test('main menu uses immediate desktop pointer-down accordion activation',()=>{
  assert.match(ranked,/function installImmediateDesktopAccordion\(button,section\)/);
  assert.match(ranked,/button\.addEventListener\('pointerdown',event=>\{/);
  assert.match(ranked,/if\(event\.pointerType==='touch'\|\|event\.button!==0\)return/);
  assert.match(ranked,/toggleMenuSection\(section\)/);
  assert.match(ranked,/installImmediateDesktopAccordion\(rankedToggle,'competitive'\)/);
  assert.match(ranked,/installImmediateDesktopAccordion\(freeToggle,'friendly'\)/);
  assert.match(ranked,/\.menu-category-toggle:before\{display:none!important;animation:none!important\}/);
});

test('verification dialog self-heals after email verification without manual dismissal',()=>{
  assert.match(ranked,/verificationWatchTimer=setInterval\(\(\)=>\{void checkVerificationCompletion\(\);\},15000\)/);
  assert.match(ranked,/api\('\/api\/auth\/login',\{method:'POST',body:pendingVerificationCredentials,auth:false\}\)/);
  assert.match(ranked,/saveSession\(data\);const success=verificationSuccessData\(data\);pendingVerificationCredentials=null;stopVerificationWatch\(\);verificationDialog\.close\(\);showAccountSuccess\('verified',success\)/);
  assert.match(ranked,/addEventListener\('focus',\(\)=>\{if\(verificationDialog\.open\)void checkVerificationCompletion\(\);\}\)/);
  assert.match(ranked,/visibilitychange',[^\n]*verificationDialog\.open[^\n]*checkVerificationCompletion/);
});


test('Training strategy stays until user dismissal and gives concise tactical recommendations',()=>{
  assert.match(html,/id="gukjinTrainingReason" class="training-choice-reason" hidden/);
  assert.match(app,/function trainingGukjinRecommendation\(human=state\?\.human\)/);
  assert.match(app,/Recommended: /);
  assert.match(app,/Use as 2 Singles/);
  assert.match(app,/training-choice-recommended/);
  assert.match(app,/function showTrainingOpeningStrategy\(text\)/);
  assert.match(app,/trainingOpeningDismissLayer\.className='training-opening-dismiss-layer'/);
  assert.match(app,/Tap or click anywhere when you are ready to continue/);
  assert.match(app,/await showTrainingOpeningStrategy\(openingAdvice\)/);
  assert.match(app,/Best plan:/);
  assert.match(app,/const action=best\.target\?'Play '/);
  assert.doesNotMatch(app,/\bI would\b/i);
  assert.doesNotMatch(app,/Reserved rule:/);
  assert.doesNotMatch(app,/5-Birdies/);
  assert.match(app,/function trainingCardName\(card\)/);
  assert.match(app,/Peony/);
  assert.match(app,/Paulownia/);
});

test('Training Shake dialog recommends guaranteed Bomb when the fourth month card is on the floor',()=>{
  assert.match(html,/id="shakeTrainingReason" hidden/);
  assert.match(app,/shakeMultiplier=decision\.month>=11\?4:2/);
  assert.match(app,/Recommended: Bomb\. The fourth/);
  assert.match(app,/this Bomb is guaranteed/);
  assert.match(app,/Bomb immediately captures all four/);
  assert.match(app,/gives two optional blank turns/);
  assert.match(app,/Why Shake: revealing these three/);
  assert.match(app,/trainingFlowerName\(decision\.month\)/);
  assert.match(app,/Keep for Bomb keeps the set hidden so you can Bomb later/);
  assert.match(app,/keepSecretBtn\.classList\.toggle\('training-choice-recommended',training&&bombReady\)/);
  assert.match(app,/els\.shakeTrainingReason\.hidden=!training/);
});
