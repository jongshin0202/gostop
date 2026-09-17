import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('ranked two-card choice has one authoritative owner',()=>{
  const onlinePlay=source.slice(source.indexOf('async function humanPlay'),source.indexOf('// While choosing between two floor targets'));
  assert.match(onlinePlay,/const authoritativeTargetChoice=state\?\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.doesNotMatch(onlinePlay,/pendingTurn\?\.phase==='awaitingFloorTarget'/);
  assert.match(source,/const authoritativeTargetChoice=state\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.match(source,/if\(action\?\.type==='attemptPlayCard'&&authoritativeTargetChoice\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
  const submit=source.match(/async function submitOnlineCardPlay\(\)\{[\s\S]*?\n    \}/)?.[0]||'';
  assert.match(submit,/onlineSubmit\(\{type:'playCard',cardId,targetId:null\}\)/);
  assert.doesNotMatch(submit,/matchesFor\(/);
  assert.doesNotMatch(submit,/chooseFloorTarget\(/);
});
