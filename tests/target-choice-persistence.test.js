import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('two-floor target choice survives authoritative floor rerenders',()=>{
  assert.match(source,/function renderFloor\(\)[\s\S]*?syncTargetChoiceUi\(\);\s*\}/);
  assert.match(source,/presentation\.targetChoice=\{key,ids:new Set\(matches\.map\(card=>card\.id\)\),matches:\[\.\.\.matches\],resolve\}/);
  assert.match(source,/function syncTargetChoiceUi\(\)[\s\S]*?classList\.add\('target-option'\)/);
});

test('floor target input uses delegated handlers so rebuilt card nodes stay selectable',()=>{
  assert.match(source,/els\.floor\.addEventListener\('click',[\s\S]*?finishTargetChoice\(cardId\)/);
  assert.match(source,/els\.floor\.addEventListener\('keydown',[\s\S]*?finishTargetChoice\(cardId\)/);
});

test('repeat taps cannot cancel or duplicate an active ranked target choice',()=>{
  assert.match(source,/const authoritativeTargetChoice=state\?\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.doesNotMatch(source,/const authoritativeTargetChoice=[^\n]*pendingTurn\?\.phase==='awaitingFloorTarget'/);
  assert.match(source,/if\(onlinePendingCardId===cardId\|\|authoritativeTargetChoice\)\{syncTargetChoiceUi\(\);return;\}/);
});


test('local pre-hit floor choice can be cancelled without consuming the selected hand card',()=>{
  assert.match(source,/document\.addEventListener\('click',event=>\{[\s\S]*?onlineMode\|\|!presentation\.targetChoiceCleanup\|\|!presentation\.pendingHumanCardId[\s\S]*?targetChoiceCardId\(event\)\|\|els\.playerHand\.contains\(event\.target\)[\s\S]*?presentation\.targetChoiceCleanup\(\)/);
  assert.match(source,/if\(presentation\.locked\)\{[\s\S]*?if\(presentation\.targetChoiceCleanup&&presentation\.pendingHumanCardId\)\{[\s\S]*?cardId===presentation\.pendingHumanCardId\)presentation\.targetChoiceCleanup\(\)/);
  assert.match(source,/if\(presentation\.targetChoiceCleanup&&presentation\.pendingHumanCardId\)\{presentation\.targetChoiceCleanup\(\);return;\}/);
});
