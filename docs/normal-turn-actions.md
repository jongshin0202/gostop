# Migration Step 5A: Normal Turn Actions

This step extracts only deterministic, non-special card resolution. Korean special-rule branches and end-of-turn decisions remain in `app.js`.

## Engine actions

`applyNormalTurnAction(state, action)` clones and validates the serializable authoritative state, then supports this ordered action sequence:

1. `playCard` validates neutral `actorId`/turn, card ownership, and an optional legal floor target; removes the owned card; and emits public `cardPlayed`.
2. `chooseFloorTarget` validates a selected floor card for the played or drawn card and emits public `floorTargetChosen`.
3. `drawNextCard` removes and publicly reveals the next ordered deck card through `deckCardRevealed`.
4. `resolveNormalCard` performs either a normal unmatched landing (`cardLanded`) or capture of one selected floor card (`cardsCaptured`). It rejects stack captures, more-than-two match branches, and same-month played/drawn combinations so special behavior cannot silently enter this path.
5. `completeTurn` verifies that available normal cards resolved, removes temporary pending-turn state, and emits `turnCompleted`. Existing `concludeTurn` still performs scoring, Go/Stop, Nagari, and scheduling.

All events currently emitted by this narrow path are explicitly `public`. The reducer has no DOM, animation, audio, timer, AI, or network access. It does not expose unrevealed deck cards or any hand other than through the returned authoritative state retained by the current Solo authority.

## Neutral action protocol and resumable phases

The public action field is `actorId`, whose only valid values are `playerA` and `playerB`. In Solo, the compatibility mapping remains `playerA` to `state.human` and `playerB` to `state.ai`; legacy `human` or `ai` actor values are rejected at the engine boundary. The internal `state.turn` and player storage remain legacy-shaped for this narrow migration.

While an extracted turn is active, serializable `state.pendingTurn` records its neutral `actorId`, played/drawn card data, legal matching card IDs, chosen target, reserved landing slot, and one of these phases:

- `awaitingFloorTarget` — only the recorded actor may choose one of the recorded legal target IDs;
- `awaitingDraw` — the next legal extracted action is the authoritative deck draw;
- `awaitingNormalResolution` — `nextResolution` identifies whether the played or drawn card resolves next; or
- `awaitingTurnCompletion` — both available cards resolved and the extracted turn may complete.

A player-private target decision includes its neutral addressee, card ID, source, phase, and complete legal target ID list. Because the pending state contains no callback, promise, DOM node, or animation data, each stable decision boundary survives `serializeGameState`, JSON transport, and `deserializeGameState` without losing the legal continuation.

## Browser boundary

The existing human/AI controllers still select cards and targets and preserve Shake/Bomb prompts and AI pacing. For eligible normal turns, they submit the play, draw, target, resolution, and completion actions to the engine. The browser uses returned `cardLanded` and `cardsCaptured` events to remove staged cards or run the existing capture-slide animation.

`classifyTurnOutcome(state, { actorId, cardId? })` now owns the deterministic normal-versus-special routing decision. Before play, it can identify `bombEligible`; during a pending turn it returns `awaitingDraw`, `floorTargetDecision`, `normal`, `jjokCandidate`, `ppeokSsaDaCandidate`, `ttadakCandidate`, `selfPpeokCandidate`, `floorStackInteraction`, `awaitingTurnCompletion`, or the conservative `legacySpecial` fallback. Normal results include per-card `unmatchedLanding`, `singleMatchCapture`, or `chosenMatchCapture` details. All results are JSON-safe and use neutral actor IDs.

The established browser animation order remains hand slap, deck lift/flip/slap, played-card resolution, drawn-card resolution, Sweep check, then `concludeTurn`. Durations, sleeps, hit-sound call sites, rendering, and Go/Stop flow are unchanged.

## Special-rule fallback retained in app.js

The browser deliberately calls `deferSpecialTurn` and uses the existing `resolveCombinedTurn`/`resolveSingleCard` code when the played and drawn cards share a month, a floor stack is involved, or a card has more than two effective matches. This retains:

- Shake and Bomb;
- Ppeok/Ssa-da and Self-Ppeok;
- Ttadak and Jjok;
- Sweep and Pi transfer;
- Chongtong;
- Go/Stop and Nagari; and
- all special scoring and settlement behavior.

Bomb blank/deck-only turns also remain on the legacy path in this step.

## Known boundary risks

- The temporary `pendingTurn` is authoritative and serializable while a normal action sequence is active, but exact restoration into an already-partially-played browser animation remains a later controller/event-replay concern.
- The reducer records unmatched landing slots at play/draw time so a capture resolved earlier in the same turn cannot move a later unmatched card into a newly opened hole. This preserves the existing in-flight reservation behavior.
- The engine now determines normal-versus-special routing, but mutations for classified special outcomes remain deliberately delegated to the legacy controller.
- Sweep remains a post-resolution condition because it depends on whether capture mutation actually empties the floor; normal classification marks it `postResolution` rather than predicting it prematurely.
- Player storage and `state.turn` still use legacy `human`/`ai` compatibility values because wholesale player-schema migration is outside Step 5B; public actions, events, decisions, and pending progress do not expose those identities.
