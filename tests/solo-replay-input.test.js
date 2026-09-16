import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('same-match new hand clears previous hand selection and staging state',()=>{
  assert.match(source,/newHandCreated'[\s\S]*?resetHandPresentationState\(\);\s*onlinePendingCardId=null;\s*onlineStageState=\{\};\s*presentation\.recordedTerminal=null;\s*await presentDealSequence\(\)/);
});
