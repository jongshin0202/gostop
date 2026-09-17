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
