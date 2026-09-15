from pathlib import Path

path=Path('app.js')
text=path.read_text()

def replace_once(old,new):
    global text
    if old not in text:
        raise RuntimeError('expected app.js source not found: '+old[:180])
    text=text.replace(old,new,1)

replace_once(
"""    targetChoiceCleanup:null,
    pendingHumanCardId:null,""",
"""    targetChoiceCleanup:null,
    targetChoice:null,
    pendingHumanCardId:null,"""
)

replace_once(
"""      els.floor.appendChild(slotEl);
    }
  }

  function sortCards""",
"""      els.floor.appendChild(slotEl);
    }
    syncTargetChoiceUi();
  }

  function sortCards"""
)

old="""  async function chooseFloorTarget(matches, message='Choose which card to hit'){
    if(matches.length<=1) return matches[0]||null;
    cleanupTargetChoice();
    presentation.locked=true;
    showActionCue('human','choose a floor card');

    return new Promise(resolve=>{
      const handlers=[];
      const finish=card=>{
        handlers.forEach(({el,click,key})=>{el.removeEventListener('click',click);el.removeEventListener('keydown',key);el.classList.remove('target-option');el.removeAttribute('role');el.removeAttribute('tabindex');});
        presentation.targetChoiceCleanup=null;
        resolve(card);
      };
      matches.forEach(card=>{
        const el=els.floor.querySelector(`[data-card-id=\"${card.id}\"]`); if(!el)return;
        el.classList.add('target-option'); el.setAttribute('role','button'); el.setAttribute('tabindex','0');
        const click=()=>finish(card);
        const key=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();finish(card);}};
        el.addEventListener('click',click); el.addEventListener('keydown',key); handlers.push({el,click,key});
      });
      presentation.targetChoiceCleanup=()=>finish(null);
    });
  }
  function cleanupTargetChoice(){ if(presentation.targetChoiceCleanup){ const fn=presentation.targetChoiceCleanup; presentation.targetChoiceCleanup=null; fn(); } }
"""
new="""  function syncTargetChoiceUi(){
    const choice=presentation.targetChoice;
    els.floor.querySelectorAll('[data-target-choice=\"1\"]').forEach(el=>{
      if(choice?.ids.has(el.dataset.cardId))return;
      el.classList.remove('target-option');el.removeAttribute('role');el.removeAttribute('tabindex');delete el.dataset.targetChoice;
    });
    if(!choice)return;
    choice.ids.forEach(cardId=>{
      const el=els.floor.querySelector(`[data-card-id=\"${cardId}\"]`);if(!el)return;
      el.classList.add('target-option');el.setAttribute('role','button');el.setAttribute('tabindex','0');el.dataset.targetChoice='1';
    });
  }
  function finishTargetChoice(cardId=null){
    const choice=presentation.targetChoice;if(!choice)return false;
    presentation.targetChoice=null;presentation.targetChoiceCleanup=null;
    els.floor.querySelectorAll('[data-target-choice=\"1\"]').forEach(el=>{el.classList.remove('target-option');el.removeAttribute('role');el.removeAttribute('tabindex');delete el.dataset.targetChoice;});
    const card=cardId?choice.matches.find(item=>item.id===cardId)||null:null;
    choice.resolve(card);return !!card;
  }
  async function chooseFloorTarget(matches, message='Choose which card to hit'){
    if(matches.length<=1)return matches[0]||null;
    const key=matches.map(card=>card.id).sort().join('|');
    // An authoritative refresh may ask us to present the same pending choice again.
    // Keep the original waiter alive; renderFloor() will reapply its visual affordances.
    if(presentation.targetChoice?.key===key){syncTargetChoiceUi();return null;}
    cleanupTargetChoice();
    presentation.locked=true;
    showActionCue('human','choose a floor card');
    return new Promise(resolve=>{
      presentation.targetChoice={key,ids:new Set(matches.map(card=>card.id)),matches:[...matches],resolve};
      presentation.targetChoiceCleanup=()=>finishTargetChoice(null);
      syncTargetChoiceUi();
    });
  }
  function cleanupTargetChoice(){if(presentation.targetChoiceCleanup){const fn=presentation.targetChoiceCleanup;presentation.targetChoiceCleanup=null;fn();}else if(presentation.targetChoice)finishTargetChoice(null);}
  function targetChoiceCardId(event){
    const el=event.target?.closest?.('[data-card-id]');
    return el&&els.floor.contains(el)&&presentation.targetChoice?.ids.has(el.dataset.cardId)?el.dataset.cardId:null;
  }
  els.floor.addEventListener('click',event=>{const cardId=targetChoiceCardId(event);if(!cardId)return;event.preventDefault();event.stopPropagation();finishTargetChoice(cardId);});
  els.floor.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const cardId=targetChoiceCardId(event);if(!cardId)return;event.preventDefault();event.stopPropagation();finishTargetChoice(cardId);});
"""
replace_once(old,new)

replace_once(
"""  async function humanPlay(cardId, clickedEl){
    if(onlineMode){onlinePendingCardId=cardId;rememberOnlineHandSource(cardId,clickedEl);if(!onlineSubmit({type:'attemptPlayCard',cardId}))onlineHandSourceRects.delete(cardId);return;}""",
"""  async function humanPlay(cardId, clickedEl){
    if(onlineMode){
      if(presentation.targetChoice){
        if(onlinePendingCardId===cardId){syncTargetChoiceUi();return;}
        cleanupTargetChoice();onlineHandSourceRects.clear();
      }
      onlinePendingCardId=cardId;rememberOnlineHandSource(cardId,clickedEl);if(!onlineSubmit({type:'attemptPlayCard',cardId}))onlineHandSourceRects.delete(cardId);return;
    }"""
)

path.write_text(text)

test=Path('tests/target-choice-persistence.test.js')
test.write_text("""import test from 'node:test';
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
""")
