from pathlib import Path

app=Path('app.js')
source=app.read_text()
old="""    async function submitOnlineCardPlay(){
      const card=state.human.hand.find(item=>item.id===onlinePendingCardId),matches=card?matchesFor(card):[];
      // Two-match choices are authority-owned. Do not start a second local chooser here;
      // driveOnline presents the server's chooseFloorTarget decision and keeps it alive.
      if(matches.length>1){await driveOnline(latestOnlineSnapshot,onlineLastEvents);return;}
      const target=matches[0]||null;
      onlineSubmit({type:'playCard',cardId:onlinePendingCardId,targetId:target?.id||null});
    }
"""
new="""    async function submitOnlineCardPlay(){
      const cardId=onlinePendingCardId;
      if(!cardId)return;
      // Authority owns floor matching. Always submit the card first without a client-picked
      // target: zero/one-match plays resolve normally, while two matches make the server
      // enter awaitingFloorTarget and publish the authoritative chooseFloorTarget action.
      onlineSubmit({type:'playCard',cardId,targetId:null});
    }
"""
if old not in source:
    raise SystemExit('expected submitOnlineCardPlay block not found')
app.write_text(source.replace(old,new,1))

Path('tests/two-floor-click-pipeline.test.js').write_text("""'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=require('../game-engine.js');

const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const card=id=>structuredClone(engine.masterDeck.find(item=>item.id===id));

test('ranked client submits the hand card before waiting for an authoritative two-floor choice',()=>{
  assert.match(app,/async function submitOnlineCardPlay\(\)[\s\S]*?onlineSubmit\(\{type:'playCard',cardId,targetId:null\}\)/);
  assert.doesNotMatch(app,/if\(matches\.length>1\)\{await driveOnline\(latestOnlineSnapshot,onlineLastEvents\);return;\}/);
});

test('server engine turns a targetless play with two floor matches into chooseFloorTarget',()=>{
  const played=card('m1-1'),floorA=card('m1-2'),floorB=card('m1-3');
  const makePlayer=hand=>({hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0});
  const state={deck:[card('m2-1')],floor:[floorA,floorB],human:makePlayer([played]),ai:makePlayer([]),floorStacks:{},floorSlotByCard:{[floorA.id]:0,[floorB.id]:1},floorSlotCount:12,startingPlayerId:'playerA',turn:'playerA',winner:null,specialWinner:null,openingResolved:true,openingSpecialsComplete:true,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}};
  const attempted=engine.applyNormalTurnAction(state,{type:'attemptPlayCard',actorId:'playerA',cardId:played.id});
  const result=engine.applyNormalTurnAction(attempted.state,{type:'playCard',actorId:'playerA',cardId:played.id,targetId:null});
  assert.equal(result.state.pendingTurn.phase,'awaitingFloorTarget');
  assert.equal(result.pendingDecision.type,'chooseFloorTarget');
  assert.deepEqual(new Set(result.pendingDecision.legalTargetIds),new Set([floorA.id,floorB.id]));
});
""")

# Triggered intentionally after the one-time workflow is installed.
