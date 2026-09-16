import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('ranked two-card choice has one authoritative owner',()=>{
  assert.match(source,/const authoritativeTargetChoice=state\.pendingDecision\?\.type==='chooseFloorTarget'\|\|state\.pendingTurn\?\.phase==='awaitingFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.match(source,/if\(action\?\.type==='attemptPlayCard'&&authoritativeTargetChoice\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
  const submit=source.match(/async function submitOnlineCardPlay\(\)\{[\s\S]*?\n    \}/)?.[0]||'';
  assert.match(submit,/onlineSubmit\(\{type:'playCard',cardId,targetId:null\}\)/);
  assert.doesNotMatch(submit,/matchesFor\(/);
  assert.doesNotMatch(submit,/chooseFloorTarget\(/);
});
