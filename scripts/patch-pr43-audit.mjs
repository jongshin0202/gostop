import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  const i=text.indexOf(from);
  if(i<0) throw new Error(`Missing patch anchor: ${label}`);
  if(text.indexOf(from,i+1)>=0) throw new Error(`Patch anchor is ambiguous: ${label}`);
  return text.slice(0,i)+to+text.slice(i+from.length);
}

let app=fs.readFileSync('app.js','utf8');
const humanStart=app.indexOf('async function humanPlay');
if(humanStart<0) throw new Error('humanPlay not found');
const humanEnd=app.indexOf('\n    async function',humanStart+10);
const sliceEnd=humanEnd>humanStart?humanEnd:Math.min(app.length,humanStart+12000);
let human=app.slice(humanStart,sliceEnd);
if(!human.includes('if(onlineMode){')) throw new Error('ranked humanPlay branch not found');
if(!human.includes('if(onlineActions.size>0)return;')) {
  human=human.replace('if(onlineMode){','if(onlineMode){\n      // Exactly one ranked action may be in flight. Rapid/repeated taps must not create\n      // competing revisions or duplicate card plays before the authority responds.\n      if(onlineActions.size>0)return;');
  app=app.slice(0,humanStart)+human+app.slice(sliceEnd);
}
fs.writeFileSync('app.js',app);

let current=fs.readFileSync('tests/current-behavior.test.js','utf8');
const stale="  assert.match(submit,/matches=card\\?matchesFor\\(card\\):\\[\\]/);\n  assert.doesNotMatch(submit,/state\\.floor\\.filter\\(item=>item\\.month===card\\.month\\)/);";
const updated="  // Ranked authority, not the browser, owns floor matching. The client must send the\n  // card targetless so zero/one/two-match resolution uses the same authoritative path.\n  assert.match(submit,/onlineSubmit\\(\\{type:'playCard',cardId,targetId:null\\}\\)/);\n  assert.doesNotMatch(submit,/matchesFor\\(/);\n  assert.doesNotMatch(submit,/state\\.floor\\.filter\\(item=>item\\.month===card\\.month\\)/);";
if(current.includes(stale)) current=replaceOnce(current,stale,updated,'stale client-side floor-match assertion');
else if(!current.includes("assert.doesNotMatch(submit,/matchesFor\\(/);")) throw new Error('current-behavior target-choice assertion is neither old nor patched');
fs.writeFileSync('tests/current-behavior.test.js',current);

let test=fs.readFileSync('tests/two-floor-click-pipeline.test.js','utf8');
const marker="test('ranked card input serializes rapid/repeated taps until the authority responds'";
if(!test.includes(marker)) {
  test += `\n\ntest('ranked card input serializes rapid/repeated taps until the authority responds',()=>{\n  const humanPlay=app.slice(app.indexOf('async function humanPlay'),app.indexOf('async function aiTurn'));\n  assert.match(humanPlay,/if\\(onlineMode\\)\\{[\\s\\S]*?if\\(onlineActions\\.size>0\\)return;/);\n});\n\ntest('ranked targetless play leaves zero/one floor matches to authority without opening a false chooser',()=>{\n  const makePlayer=hand=>({hand,captured:[],go:0,shakes:0,shakeMultiplier:1,bombs:0,bombFreeTurns:0,ppeoks:0,hiddenTripleMonths:[],shakenMonths:[],resolvedOpeningTripleMonths:[],revealedShakeSets:[],armedBombMonths:[],turnsTaken:0,firstPpeokPoints:0,gukjinMode:'animal',lastGoScore:0});\n  const makeState=floor=>({deck:[card('m2-1')],floor,human:makePlayer([card('m1-1')]),ai:makePlayer([]),floorStacks:{},floorSlotByCard:Object.fromEntries(floor.map((item,index)=>[item.id,index])),floorSlotCount:12,startingPlayerId:'playerA',turn:'playerA',winner:null,specialWinner:null,openingResolved:true,openingSpecialsComplete:true,matchContext:{lastScoreBySide:{playerA:0,playerB:0},nagariCarryPower:0}});\n  for(const floor of [[],[card('m1-2')]]){\n    const state=makeState(floor);\n    const result=engine.applyNormalTurnAction(state,{type:'playCard',actorId:'playerA',cardId:'m1-1',targetId:null});\n    assert.notEqual(result.pendingDecision?.type,'chooseFloorTarget');\n    assert.notEqual(result.state.pendingTurn?.phase,'awaitingFloorTarget');\n  }\n});\n\ntest('ranked click pipeline keeps special pre-decisions and clears rejected pending-card ownership',()=>{\n  assert.match(app,/needsPrePlayDecision=state\\.human\\.armedBombMonths\\?\\.includes\\(card\\.month\\)\\|\\|state\\.human\\.hiddenTripleMonths\\?\\.includes\\(card\\.month\\)/);\n  assert.match(app,/actionRejected[\\s\\S]*?if\\(onlinePendingCardId===action\\.cardId\\)onlinePendingCardId=null/);\n});\n`;
}
fs.writeFileSync('tests/two-floor-click-pipeline.test.js',test);
