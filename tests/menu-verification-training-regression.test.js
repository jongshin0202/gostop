'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');

test('main menu keeps animation but uses a short response path',()=>{
  assert.match(ranked,/immediateMenuSuppressUntil=Date\.now\(\)\+280/);
  assert.match(ranked,/\.menu-submenu\{will-change:opacity,transform!important;transition:max-height \.12s/);
  assert.match(ranked,/\.menu-category-chevron\{transition:transform \.10s ease!important\}/);
  assert.match(ranked,/\.menu-category-toggle:hover,\.menu-category-toggle:focus-visible\{filter:none!important\}/);
  assert.doesNotMatch(ranked,/immediateMenuSuppressUntil=Date\.now\(\)\+650/);
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
  assert.doesNotMatch(training,/state\.ai(?:\?\.)?hand/);
});
