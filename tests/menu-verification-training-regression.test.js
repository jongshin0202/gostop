'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const tutorial=fs.readFileSync(require.resolve('../tutorial-video.js'),'utf8');

test('main menu uses immediate desktop pointer-down accordion activation',()=>{
  assert.match(ranked,/function installImmediateDesktopAccordion\(button,section\)/);
  assert.match(ranked,/button\.addEventListener\('pointerdown',event=>\{/);
  assert.match(ranked,/if\(event\.pointerType==='touch'\|\|event\.button!==0\)return/);
  assert.match(ranked,/toggleMenuSection\(section\)/);
  assert.match(ranked,/installImmediateDesktopAccordion\(rankedToggle,'competitive'\)/);
  assert.match(ranked,/installImmediateDesktopAccordion\(freeToggle,'friendly'\)/);
  assert.match(ranked,/\.menu-category-toggle:before\{display:none!important;animation:none!important\}/);
});

test('mobile main menu keeps collapsed top controls and expanded Player info on stable anchors',()=>{
  assert.match(ranked,/stable-mobile-menu-anchors/);
  assert.match(ranked,/menu\.classList\.toggle\('has-expanded-section',!!expandedMenuSection\)/);
  const anchors=ranked.slice(ranked.indexOf('function lockStableMobileMenuAnchors'),ranked.indexOf('const freePanel=',ranked.indexOf('function lockStableMobileMenuAnchors')));
  assert.match(anchors,/setMenuSection\(null\)[^]*menu\.getBoundingClientRect\(\)\.top-overlayRect\.top/);
  assert.match(anchors,/setMenuSection\('friendly'\)[^]*accountBox\.getBoundingClientRect\(\)\.top-overlayRect\.top/);
  assert.match(anchors,/--gostop-menu-shell-top/);
  assert.match(anchors,/--gostop-menu-account-top/);
  assert.match(ranked,/overlay\.dataset\.currentMenuReady='true';overlay\.hidden=false;scheduleStableMobileMenuAnchors\(\)/);
  assert.match(ranked,/\.stable-mobile-menu-anchors \.gostop-main-menu\.main-menu-accordion\.has-expanded-section\{padding:7px!important;gap:5px!important\}/);
});

test('How to Play film stays caption-only and teaches the approved product and rule language',()=>{
  assert.match(html,/id="tutorialFullRulesBtn"/);
  assert.match(html,/id="tutorialTrainingModeBtn"/);
  assert.doesNotMatch(html,/tutorialVideoPlay|tutorialVideoReplay|tutorialVideoNarration|tutorialVideoVolume|tutorialVideoChapters/);
  assert.doesNotMatch(tutorial,/speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(tutorial,/anywhere you are/);
  assert.match(tutorial,/Click once → select/);
  assert.match(tutorial,/Tap · Tap again · or Flick up/);
  assert.match(tutorial,/Competitive Online Play matches you against other players for Coins and global ranking/);
  assert.match(tutorial,/Attract Mode automatically cycles through the leaderboards and back/);
  assert.match(tutorial,/Every family has exactly four cards/);
  assert.match(tutorial,/3 Brights with the Rain Bright = 2 points/);
  assert.match(tutorial,/All 5 Brights = 15 points/);
  assert.match(tutorial,/5-BIRDIES! and a 5-point bonus/);
  assert.match(tutorial,/Any 5 Stripes = 1 point/);
  assert.match(tutorial,/10 Singles = 1 point/);
  assert.match(tutorial,/1 GO adds \+1 point\. 2 GO means \+2 points total/);
  assert.match(tutorial,/From 3 GO onward, your score doubles/);
  assert.match(tutorial,/POOPED! \(뻑\)/);
  assert.match(tutorial,/KISS! \(쪽\)/);
  assert.match(tutorial,/FLUSH! \(따닥\)/);
  assert.match(tutorial,/CLEAN SWEEP! \(싹쓸이\)/);
  assert.match(tutorial,/steal 1 Single/);
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
  assert.match(app,/Rose/);
  assert.match(app,/Berry/);
});

test('Training Shake and Bomb dialogs use the same information coach panel for recommendations',()=>{
  assert.match(html,/id="shakeTrainingReason" hidden/);
  assert.match(html,/id="bombTrainingReason" hidden/);
  assert.match(app,/function showTrainingSpecialCoach\(dialog,title,text\)/);
  assert.match(app,/dialog\.appendChild\(els\.trainingCoachPanel\)/);
  assert.match(app,/showTrainingSpecialCoach\(els\.shakeDialog,bombReady\?'BOMB ADVICE':'SHAKE ADVICE',advice\)/);
  assert.match(app,/showTrainingSpecialCoach\(\s*els\.bombDialog,\s*'BOMB ADVICE'/);
  assert.match(app,/shakeMultiplier=decision\.month>=11\?4:2/);
  assert.match(app,/Bomb\. The fourth/);
  assert.match(app,/Bomb is guaranteed/);
  assert.match(app,/Capture all four/);
  assert.match(app,/gain two optional blank turns/);
  assert.match(app,/Shake\. Reveal these three/);
  assert.match(app,/Keep for Bomb only preserves a future Bomb chance/);
  assert.match(app,/shakeBtn\?\.classList\.toggle\('training-choice-recommended',training&&!bombReady\)/);
  assert.match(app,/keepSecretBtn\.classList\.toggle\('training-choice-recommended',training&&bombReady\)/);
  assert.match(app,/bombBtn\?\.classList\.toggle\('training-choice-recommended',training\)/);
  assert.match(app,/els\.shakeTrainingReason\.hidden=true/);
  assert.match(app,/els\.bombTrainingReason\.hidden=true/);
  assert.match(app,/shakeDialog\.addEventListener\('close',closeTrainingSpecialCoach\)/);
  assert.match(app,/bombDialog\.addEventListener\('close',closeTrainingSpecialCoach\)/);
});
