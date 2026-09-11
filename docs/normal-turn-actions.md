# Migration Step 5A: Normal Turn Actions

This step extracts only deterministic, non-special card resolution. Korean special-rule branches and end-of-turn decisions remain in `app.js`.

## Engine actions

`applyNormalTurnAction(state, action)` clones and validates the serializable authoritative state, then supports this ordered action sequence:

1. `playCard` validates actor/turn, card ownership, and an optional legal floor target; removes the owned card; and emits public `cardPlayed`.
2. `chooseFloorTarget` validates a selected floor card for the played or drawn card and emits public `floorTargetChosen`.
3. `drawNextCard` removes and publicly reveals the next ordered deck card through `deckCardRevealed`.
4. `resolveNormalCard` performs either a normal unmatched landing (`cardLanded`) or capture of one selected floor card (`cardsCaptured`). It rejects stack captures, more-than-two match branches, and same-month played/drawn combinations so special behavior cannot silently enter this path.
5. `completeTurn` verifies that available normal cards resolved, removes temporary pending-turn state, and emits `turnCompleted`. Existing `concludeTurn` still performs scoring, Go/Stop, Nagari, and scheduling.

All events currently emitted by this narrow path are explicitly `public`. The reducer has no DOM, animation, audio, timer, AI, or network access. It does not expose unrevealed deck cards or any hand other than through the returned authoritative state retained by the current Solo authority.

## Browser boundary

The existing human/AI controllers still select cards and targets and preserve Shake/Bomb prompts and AI pacing. For eligible normal turns, they submit the play, draw, target, resolution, and completion actions to the engine. The browser uses returned `cardLanded` and `cardsCaptured` events to remove staged cards or run the existing capture-slide animation.

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

- The temporary `pendingNormalTurn` is authoritative and serializable while a normal action sequence is active, but exact restoration into browser animation remains a later controller/event-replay concern.
- The reducer records unmatched landing slots at play/draw time so a capture resolved earlier in the same turn cannot move a later unmatched card into a newly opened hole. This preserves the existing in-flight reservation behavior.
- The controller still detects whether the turn qualifies for the normal path. The engine independently rejects special resolution, but a future step should make action legality and special phases entirely authority-owned.
- The normal reducer still uses legacy `human`/`ai` actor values because wholesale player-schema migration is outside Step 5A.
