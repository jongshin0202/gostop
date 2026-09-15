from pathlib import Path

app=Path('app.js')
text=app.read_text()
old="""      if(presentation.targetChoice){
        if(onlinePendingCardId===cardId){syncTargetChoiceUi();return;}
        cleanupTargetChoice();onlineHandSourceRects.clear();
      }
"""
new="""      if(presentation.targetChoice){
        const authoritativeTargetChoice=state?.pendingDecision?.type==='chooseFloorTarget'||state?.pendingTurn?.phase==='awaitingFloorTarget'||latestOnlineSnapshot?.nextAction?.type==='chooseFloorTarget';
        if(onlinePendingCardId===cardId||authoritativeTargetChoice){syncTargetChoiceUi();return;}
        cleanupTargetChoice();onlineHandSourceRects.clear();
      }
"""
if old not in text:raise RuntimeError('humanPlay target-choice block not found')
app.write_text(text.replace(old,new,1))

test=Path('tests/target-choice-persistence.test.js')
text=test.read_text()
text=text.replace("""test('repeat tap on same ranked hand card cannot start a duplicate target submission',()=>{
  assert.match(source,/if\\(presentation\\.targetChoice\\)\\{\\s*if\\(onlinePendingCardId===cardId\\)\\{syncTargetChoiceUi\\(\\);return;\\}/);
});
""","""test('repeat taps cannot cancel or duplicate an active ranked target choice',()=>{
  assert.match(source,/const authoritativeTargetChoice=state\\?\\.pendingDecision\\?\\.type==='chooseFloorTarget'\\|\\|state\\?\\.pendingTurn\\?\\.phase==='awaitingFloorTarget'\\|\\|latestOnlineSnapshot\\?\\.nextAction\\?\\.type==='chooseFloorTarget'/);
  assert.match(source,/if\\(onlinePendingCardId===cardId\\|\\|authoritativeTargetChoice\\)\\{syncTargetChoiceUi\\(\\);return;\\}/);
});
""")
test.write_text(text)
