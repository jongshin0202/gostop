'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');

test('main menu accordion activates on first pointer-down and avoids layout animation',()=>{
  assert.match(ranked,/function installImmediateAccordion\(button,section\)/);
  assert.match(ranked,/button\.addEventListener\('pointerdown',event=>\{/);
  assert.match(ranked,/if\(event\.isPrimary===false\)return/);
  assert.match(ranked,/if\(event\.pointerType==='mouse'&&event\.button!==0\)return/);
  assert.match(ranked,/toggleMenuSection\(section\)/);
  assert.match(ranked,/installImmediateAccordion\(rankedToggle,'competitive'\)/);
  assert.match(ranked,/installImmediateAccordion\(freeToggle,'friendly'\)/);
  assert.match(ranked,/\.menu-submenu\{[\s\S]*?display:none!important[\s\S]*?transition:none!important/);
  assert.match(ranked,/\.menu-category-block\.expanded \.menu-submenu\{[\s\S]*?display:grid!important/);
  assert.match(ranked,/@keyframes menuSubmenuReveal/);
  assert.match(ranked,/html\.gostop-performance-lite \.menu-category-block\.expanded \.menu-submenu-inner\{animation:none!important\}/);
  assert.match(ranked,/\.menu-category-toggle:before\{display:none!important;animation:none!important\}/);
});

test('Training Shake decision explains why Shake is useful and what Keep for Bomb preserves',()=>{
  const block=app.slice(app.indexOf('function showShakeChoice'),app.indexOf('async function chooseOpeningTriple'));
  assert.match(block,/presentation\.trainingMode/);
  assert.match(block,/Why Shake\?/);
  assert.match(block,/there is no \$\{monthLabel\} card on the floor for a Bomb right now/);
  assert.match(block,/increases this hand's score multiplier if you later win/);
  assert.match(block,/preserves the chance to Bomb if the fourth \$\{monthLabel\} card appears later/);
  assert.match(block,/whiteSpace='pre-line'/);
});

test('verification dialog self-heals after email verification without manual dismissal',()=>{
  assert.match(ranked,/verificationWatchTimer=setInterval\(\(\)=>\{void checkVerificationCompletion\(\);\},15000\)/);
  assert.match(ranked,/api\('\/api\/auth\/login',\{method:'POST',body:pendingVerificationCredentials,auth:false\}\)/);
  assert.match(ranked,/saveSession\(data\);const success=verificationSuccessData\(data\);pendingVerificationCredentials=null;stopVerificationWatch\(\);verificationDialog\.close\(\);showAccountSuccess\('verified',success\)/);
  assert.match(ranked,/addEventListener\('focus',\(\)=>\{if\(verificationDialog\.open\)void checkVerificationCompletion\(\);\}\)/);
  assert.match(ranked,/visibilitychange',[^\n]*verificationDialog\.open[^\n]*checkVerificationCompletion/);
});
