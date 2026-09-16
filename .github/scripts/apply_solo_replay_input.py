from pathlib import Path

# online-client: derive turn readiness from authoritative projected state, not the convenience legalActions list alone.
p=Path('online-client.js')
s=p.read_text()
old="""  function viewerCanStartTurn(snapshot){
    const state=snapshot?.state;
    return !!state&&state.turn===snapshot.seatId&&!state.pendingDecision&&Array.isArray(state.legalActions)&&state.legalActions.includes('attemptPlayCard');
  }
"""
new="""  function viewerCanStartTurn(snapshot){
    const state=snapshot?.state,seatId=snapshot?.seatId;
    if(!state||!['playerA','playerB'].includes(seatId)||state.turn!==seatId||state.winner||state.pendingTurn||state.pendingDecision||state.openingSpecialsComplete!==true)return false;
    const viewer=seatId==='playerA'?state.human:state.ai;
    return Array.isArray(viewer?.hand)&&viewer.hand.length>0;
  }
"""
if old not in s: raise SystemExit('viewerCanStartTurn anchor not found')
p.write_text(s.replace(old,new,1))

# app: a new hand in the same match must clear previous-hand network/presentation selection state.
p=Path('app.js')
s=p.read_text()
old="""      if(presentationEvents.some(event=>event.type==='newHandCreated')){presentation.roundNo++;resetHandPresentationState();await presentDealSequence();}
"""
new="""      if(presentationEvents.some(event=>event.type==='newHandCreated')){
        presentation.roundNo++;
        resetHandPresentationState();
        onlinePendingCardId=null;
        onlineStageState={};
        presentation.recordedTerminal=null;
        await presentDealSequence();
      }
"""
if old not in s: raise SystemExit('newHandCreated anchor not found')
p.write_text(s.replace(old,new,1))

# Tests: raw projected state is the authority for replay input; stale/empty legalActions cannot keep a valid fresh hand locked.
p=Path('tests/online-client.test.js')
s=p.read_text()
append=r'''

test('fresh Solo replay turn unlocks from authoritative state even when derived legalActions is stale',()=>{
  const base={seatId:'playerB',state:{turn:'playerB',winner:null,pendingTurn:null,pendingDecision:null,openingSpecialsComplete:true,human:{},ai:{hand:[{id:'m1-1'}]},legalActions:[]}};
  assert.equal(viewerCanStartTurn(base),true);
  assert.equal(viewerCanInteract(base,{connected:true,pendingActionId:null,blocked:false}),true);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,openingSpecialsComplete:false}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,pendingTurn:{phase:'awaitingDraw'}}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,pendingDecision:{type:'goStopDecision'}}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,ai:{hand:[]}}}),false);
});
'''
if 'fresh Solo replay turn unlocks from authoritative state' not in s:s+=append
p.write_text(s)

# Source invariant for same-match new-hand cleanup.
Path('tests/solo-replay-input.test.js').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('same-match new hand clears previous hand selection and staging state',()=>{
  assert.match(source,/newHandCreated'[\s\S]*?resetHandPresentationState\(\);\s*onlinePendingCardId=null;\s*onlineStageState=\{\};\s*presentation\.recordedTerminal=null;\s*await presentDealSequence\(\)/);
});
''')
