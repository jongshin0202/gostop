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

test('repeat tap on same ranked hand card cannot start a duplicate target submission',()=>{
  assert.match(source,/if\(presentation\.targetChoice\)\{\s*if\(onlinePendingCardId===cardId\)\{syncTargetChoiceUi\(\);return;\}/);
});
