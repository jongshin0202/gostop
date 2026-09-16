from pathlib import Path

app=Path('app.js')
source=app.read_text()
old="""      onlinePendingCardId=cardId;rememberOnlineHandSource(cardId,clickedEl);if(!onlineSubmit({type:'attemptPlayCard',cardId}))onlineHandSourceRects.delete(cardId);return;
"""
new="""      const card=state.human.hand.find(item=>item.id===cardId);if(!card)return;
      onlinePendingCardId=cardId;rememberOnlineHandSource(cardId,clickedEl);clickedEl?.classList.add('pending-card');
      const needsPrePlayDecision=state.human.armedBombMonths?.includes(card.month)||state.human.hiddenTripleMonths?.includes(card.month);
      const action=needsPrePlayDecision?{type:'attemptPlayCard',cardId}:{type:'playCard',cardId,targetId:null};
      if(!onlineSubmit(action)){onlineHandSourceRects.delete(cardId);onlinePendingCardId=null;clickedEl?.classList.remove('pending-card');}return;
"""
if old not in source:
    raise SystemExit('expected ranked humanPlay submit line not found')
source=source.replace(old,new,1)
old_reject="""        if(action?.cardId)onlineHandSourceRects.delete(action.cardId);
        onlineStatus.textContent=event.detail.error?.message||'The server rejected that action.';presentation.locked=true;render();
"""
new_reject="""        if(action?.cardId){
          onlineHandSourceRects.delete(action.cardId);
          if(onlinePendingCardId===action.cardId)onlinePendingCardId=null;
          els.playerHand.querySelector(`[data-card-id=\"${action.cardId}\"]`)?.classList.remove('pending-card');
        }
        onlineStatus.textContent=event.detail.error?.message||'The server rejected that action.';presentation.locked=true;render();
"""
if old_reject not in source:
    raise SystemExit('expected actionRejected cleanup block not found')
app.write_text(source.replace(old_reject,new_reject,1))

test=Path('tests/two-floor-click-pipeline.test.js')
text=test.read_text()
insert="""

test('ordinary ranked cards use one-click authoritative play while Shake/Bomb cards keep the pre-decision path',()=>{
  assert.match(app,/const needsPrePlayDecision=state\.human\.armedBombMonths\?\.includes\(card\.month\)\|\|state\.human\.hiddenTripleMonths\?\.includes\(card\.month\)/);
  assert.match(app,/const action=needsPrePlayDecision\?\{type:'attemptPlayCard',cardId\}:\{type:'playCard',cardId,targetId:null\}/);
  assert.match(app,/clickedEl\?\.classList\.add\('pending-card'\)/);
});
"""
if "ordinary ranked cards use one-click authoritative play" not in text:
    text += insert
test.write_text(text)
