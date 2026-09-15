from pathlib import Path
path=Path('app.js')
text=path.read_text()
old="""    async function submitOnlineCardPlay(){const card=state.human.hand.find(item=>item.id===onlinePendingCardId),matches=card?matchesFor(card):[];let target=null;if(matches.length===1)target=matches[0];else if(matches.length>1)target=await chooseFloorTarget(matches,'Choose which floor card to hit');if(target||matches.length<2)onlineSubmit({type:'playCard',cardId:onlinePendingCardId,targetId:target?.id||null});}
"""
new="""    async function submitOnlineCardPlay(){
      const card=state.human.hand.find(item=>item.id===onlinePendingCardId),matches=card?matchesFor(card):[];
      // Two-match choices are authority-owned. Do not start a second local chooser here;
      // driveOnline presents the server's chooseFloorTarget decision and keeps it alive.
      if(matches.length>1){await driveOnline(latestOnlineSnapshot,onlineLastEvents);return;}
      const target=matches[0]||null;
      onlineSubmit({type:'playCard',cardId:onlinePendingCardId,targetId:target?.id||null});
    }
"""
if old not in text: raise SystemExit('submitOnlineCardPlay anchor not found')
text=text.replace(old,new,1)
old="""        const automatic=latestOnlineSnapshot?.nextAction?.type!=='chooseFloorTarget'?latestOnlineSnapshot?.nextAction:null;
        if(action?.type==='attemptPlayCard'&&!state.pendingDecision){if(automatic)onlineSubmit(automatic);else await submitOnlineCardPlay();return;}
"""
new="""        const authoritativeTargetChoice=state.pendingDecision?.type==='chooseFloorTarget'||latestOnlineSnapshot?.nextAction?.type==='chooseFloorTarget';
        const automatic=latestOnlineSnapshot?.nextAction?.type!=='chooseFloorTarget'?latestOnlineSnapshot?.nextAction:null;
        if(action?.type==='attemptPlayCard'&&authoritativeTargetChoice){await driveOnline(latestOnlineSnapshot,onlineLastEvents);return;}
        if(action?.type==='attemptPlayCard'&&!state.pendingDecision){if(automatic)onlineSubmit(automatic);else await submitOnlineCardPlay();return;}
"""
if old not in text: raise SystemExit('actionAccepted anchor not found')
text=text.replace(old,new,1)
path.write_text(text)
Path('tests/authoritative-target-choice.test.js').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('ranked two-card choice has one authoritative owner',()=>{
  assert.match(source,/const authoritativeTargetChoice=state\.pendingDecision\?\.type==='chooseFloorTarget'\|\|latestOnlineSnapshot\?\.nextAction\?\.type==='chooseFloorTarget'/);
  assert.match(source,/if\(action\?\.type==='attemptPlayCard'&&authoritativeTargetChoice\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
  const submit=source.match(/async function submitOnlineCardPlay\(\)\{[\s\S]*?\n    \}/)?.[0]||'';
  assert.match(submit,/if\(matches\.length>1\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
  assert.doesNotMatch(submit,/chooseFloorTarget\(/);
});
''')
