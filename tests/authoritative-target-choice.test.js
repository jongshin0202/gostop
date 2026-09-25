import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('ranked two-card choice stays authority-validated while remaining retractable before commit',()=>{
  const onlinePlay=source.slice(source.indexOf('async function humanPlay'),source.indexOf('// While choosing between two floor targets'));
  assert.match(onlinePlay,/const authoritativeTargetChoice=state\?\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.doesNotMatch(onlinePlay,/pendingTurn\?\.phase==='awaitingFloorTarget'/);
  assert.match(source,/const authoritativeTargetChoice=state\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.match(source,/if\(action\?\.type==='attemptPlayCard'&&authoritativeTargetChoice\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
  const submit=source.slice(source.indexOf('async function submitOnlineCardPlay'),source.indexOf('function enterOnlineMatchView'));
  assert.match(submit,/const matches=matchesFor\(card\)/);
  assert.match(submit,/chooseFloorTarget\(matches,'Choose which floor card to hit',\{cancelable:true\}\)/);
  assert.match(submit,/targetId=target\.id/);
  assert.match(submit,/onlineSubmit\(\{type:'playCard',cardId,targetId\}\)/);
});
