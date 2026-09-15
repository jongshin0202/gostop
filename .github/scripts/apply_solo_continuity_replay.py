from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f"expected source not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))

# Never remove a landed physical card before its authoritative DOM replacement exists.
replace_once(
    'app.js',
    """    if(event.type==='cardLanded'){
      presentation.floorSlotReservations.delete(event.card.id);
      removeStage(event.card.id);
      render();
      await presentationPause('cardLandCleanup');
      return;
    }""",
    """    if(event.type==='cardLanded'){
      presentation.floorSlotReservations.delete(event.card.id);
      render();
      removeStage(event.card.id);
      await presentationPause('cardLandCleanup');
      return;
    }""",
)

replace_once(
    'app.js',
    """        const pendingStageIds=new Set(globalThis.GoStopPresentationPlan.pendingOnlineStageIds(incomingMapped.state));
        for(const cardId of [...presentation.stagedCards.keys()])if(!pendingStageIds.has(cardId))cleanupStagedCard(cardId);
        onlineStageState=Object.fromEntries(Object.entries(onlineStageState).filter(([cardId])=>pendingStageIds.has(cardId)));
        state=incomingMapped.state;onlineLastEvents=[];render();await driveOnline(snapshot,[]);return;""",
    """        const pendingStageIds=new Set(globalThis.GoStopPresentationPlan.pendingOnlineStageIds(incomingMapped.state));
        const staleStageIds=[...presentation.stagedCards.keys()].filter(cardId=>!pendingStageIds.has(cardId));
        onlineStageState=Object.fromEntries(Object.entries(onlineStageState).filter(([cardId])=>pendingStageIds.has(cardId)));
        state=incomingMapped.state;onlineLastEvents=[];render();
        staleStageIds.forEach(cleanupStagedCard);
        await driveOnline(snapshot,[]);return;""",
)

replace_once(
    'app.js',
    """        else if(step.kind==='landedCleanup')cleanupStagedCard(step.cardId);""",
    """        else if(step.kind==='landedCleanup'){ /* DOM cleanup is deferred until after the authoritative floor render below. */ }""",
)

# In Solo, the computer is implicitly ready for Play Again. Keep the existing two-human handshake for Online.
replace_once(
    'server/room-core.mjs',
    """          flow.replayReady[participant.seatId]=true;
          if(flow.replayReady.playerA&&flow.replayReady.playerB){const next=this.authority.createNewHand({matchId:this.room.matchId});""",
    """          flow.replayReady[participant.seatId]=true;
          if(this.isSolo?.()){const bot=this.room.participants.find(item=>item.bot);if(bot)flow.replayReady[bot.seatId]=true;}
          if(flow.replayReady.playerA&&flow.replayReady.playerB){const next=this.authority.createNewHand({matchId:this.room.matchId});""",
)

# Regression coverage: Solo Play Again starts immediately and stays in the same session.
ranked_test = Path('tests/ranked-room.test.js')
ranked = ranked_test.read_text()
anchor = """test('ranked Solo is server-owned, starts Computer #1 at 100 Coins, New Game starts a new session, and Quit ends immediately',async()=>{"""
if anchor not in ranked:
    raise RuntimeError('ranked Solo test anchor not found')
insert = """test('ranked Solo Play Again immediately creates the next hand without waiting for the computer seat',async()=>{
  const {core,user,socket}=await soloRoom(),oldSession=core.room.sessionId,oldSequence=core.room.gameSequence;
  const state=core.authority.readTrustedState(core.room.matchId);state.terminalResult={type:'stop',winnerId:user.playerId,finalPoints:7};state.winner=user.playerId;core.authority.restoreMatch({...core.authority.exportMatch(core.room.matchId),state});core.room.terminalResult=structuredClone(state.terminalResult);core.room.status='completed';await core.persist();
  const before=core.authority.getSnapshot({matchId:core.room.matchId,viewerId:user.playerId}),result=await core.handle(socket,flow('solo-replay',before.revision,{type:'playAgainReady'}));
  assert.equal(result.type,'actionAccepted');assert.equal(core.room.sessionId,oldSession);assert.equal(core.room.gameSequence,oldSequence+1);assert.equal(core.room.sessionFlow.replayReady.playerA,false);assert.equal(core.room.sessionFlow.replayReady.playerB,false);assert.equal(core.room.terminalResult,null);assert.equal(socket.last('snapshot').snapshot.terminalResult,null);assert.equal(socket.last('snapshot').snapshot.sessionFlow.replayReady.you,false);
});

"""
ranked_test.write_text(ranked.replace(anchor, insert + anchor, 1))

# Source-level invariant: staged landing cleanup must happen after render, not before.
continuity = Path('tests/card-continuity.test.js')
continuity.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('normal landed cards render their authoritative replacement before removing the physical stage',()=>{
  assert.match(source,/presentation\.floorSlotReservations\.delete\(event\.card\.id\);\s*render\(\);\s*removeStage\(event\.card\.id\)/);
});

test('eventless authoritative sync renders before stale staged-card cleanup',()=>{
  assert.match(source,/const staleStageIds=.*?state=incomingMapped\.state;onlineLastEvents=\[\];render\(\);\s*staleStageIds\.forEach\(cleanupStagedCard\)/s);
});

test('online cardLanded planning never removes the physical stage before authoritative render',()=>{
  assert.doesNotMatch(source,/step\.kind==='landedCleanup'\)cleanupStagedCard/);
  assert.match(source,/state=incomingMapped\.state;onlineLastEvents=presentationEvents;render\(\);\s*for\(const cardId of \[\.\.\.presentation\.stagedCards\.keys\(\)\]\)if\(!Object\.hasOwn\(onlineStageState,cardId\)\)cleanupStagedCard\(cardId\)/);
});
""")
