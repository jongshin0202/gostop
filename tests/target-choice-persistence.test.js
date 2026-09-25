import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('two-floor target choice survives authoritative floor rerenders',()=>{
  assert.match(source,/function renderFloor\(\)[\s\S]*?syncTargetChoiceUi\(\);\s*\}/);
  assert.match(source,/presentation\.targetChoice=\{key,ids:new Set\(matches\.map\(card=>card\.id\)\),matches:\[\.\.\.matches\],resolve,cancelable\}/);
  assert.match(source,/function syncTargetChoiceUi\(\)[\s\S]*?classList\.add\('target-option'\)/);
});

test('floor target input uses delegated handlers so rebuilt card nodes stay selectable',()=>{
  assert.match(source,/els\.floor\.addEventListener\('click',[\s\S]*?finishTargetChoice\(cardId\)/);
  assert.match(source,/els\.floor\.addEventListener\('keydown',[\s\S]*?finishTargetChoice\(cardId\)/);
});

test('ranked precommit target choice is cancelable while authoritative post-commit target choice is not',()=>{
  assert.match(source,/if\(presentation\.targetChoice\.cancelable&&presentation\.pendingHumanCardId\)\{[\s\S]*?cardId===presentation\.pendingHumanCardId\)presentation\.targetChoiceCleanup\?\.\(\)/);
  assert.match(source,/const authoritativeTargetChoice=state\?\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.doesNotMatch(source,/const authoritativeTargetChoice=[^\n]*pendingTurn\?\.phase==='awaitingFloorTarget'/);
  assert.match(source,/if\(onlinePendingCardId===cardId\|\|authoritativeTargetChoice\)\{syncTargetChoiceUi\(\);return;\}/);
});


test('pre-hit floor choice can be cancelled anywhere except a highlighted target without consuming the selected card',()=>{
  assert.match(source,/document\.addEventListener\('click',event=>\{[\s\S]*?!presentation\.targetChoice\?\.cancelable\|\|!presentation\.targetChoiceCleanup\|\|!presentation\.pendingHumanCardId[\s\S]*?targetChoiceCardId\(event\)\|\|els\.playerHand\.contains\(event\.target\)[\s\S]*?presentation\.targetChoiceCleanup\(\)/);
  assert.match(source,/if\(presentation\.locked\)\{[\s\S]*?if\(presentation\.targetChoiceCleanup&&presentation\.pendingHumanCardId\)\{[\s\S]*?cardId===presentation\.pendingHumanCardId\)presentation\.targetChoiceCleanup\(\)/);
  assert.match(source,/if\(presentation\.targetChoice\?\.cancelable&&presentation\.targetChoiceCleanup&&presentation\.pendingHumanCardId\)\{presentation\.targetChoiceCleanup\(\);return;\}/);
});


test('ranked two-target hand cards are not submitted until a highlighted floor target is chosen',()=>{
  const submit=source.slice(source.indexOf('async function submitOnlineCardPlay'),source.indexOf('function enterOnlineMatchView'));
  assert.match(submit,/const matches=matchesFor\(card\)/);
  assert.match(submit,/if\(matches\.length===2\)\{/);
  assert.match(submit,/chooseFloorTarget\(matches,'Choose which floor card to hit',\{cancelable:true\}\)/);
  assert.match(submit,/targetId=target\.id/);
  assert.match(submit,/onlineSubmit\(\{type:'playCard',cardId,targetId\}\)/);
});
