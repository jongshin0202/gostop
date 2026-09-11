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

The public action field is `actorId`, whose only valid values are `playerA` and `playerB`. In Solo, the compatibility mapping remains `playerA` to `state.human` and `playerB` to `state.ai`; legacy `human` or `ai` actor values are rejected at the engine boundary. Authoritative `state.turn`, stack owners, player-valued result fields, pending decisions, and score-history keys are neutral. Only the player storage keys and controller-side aliases remain legacy-shaped.

While an extracted turn is active, serializable `state.pendingTurn` records its neutral `actorId`, played/drawn card data, legal matching card IDs, chosen target, reserved landing slot, and one of these phases:

- `awaitingFloorTarget` — only the recorded actor may choose one of the recorded legal target IDs;
- `awaitingDraw` — the next legal extracted action is the authoritative deck draw;
- `awaitingNormalResolution` — `nextResolution` identifies whether the played or drawn card resolves next; or
- `awaitingTurnCompletion` — both available cards resolved and the extracted turn may complete.

A player-private target decision includes its neutral addressee, card ID, source, phase, and complete legal target ID list. Because the pending state contains no callback, promise, DOM node, or animation data, each stable decision boundary survives `serializeGameState`, JSON transport, and `deserializeGameState` without losing the legal continuation.

## Browser boundary

The existing human/AI controllers still select cards and targets, display Shake/Bomb prompts, and preserve AI pacing. The engine initializes hidden triple eligibility and `attemptPlayCard` pauses an intended play with a serializable private `shakeDecision` only when that triple card is attempted. `declareShake` publicly increments Shake state and emits `shakeDeclared`; `keepShakeSecret` retains Bomb eligibility and emits nothing public. The browser submits either action, presents only accepted public declarations, and then continues the intended card without a second click.

`classifyTurnOutcome(state, { actorId, cardId? })` now owns the deterministic normal-versus-special routing decision. Before play, it can identify `bombEligible`; during a pending turn it returns `awaitingDraw`, `floorTargetDecision`, `normal`, `jjokCandidate`, `ppeokSsaDaCandidate`, `ttadakCandidate`, `selfPpeokCandidate`, `floorStackInteraction`, `awaitingTurnCompletion`, or the conservative `legacySpecial` fallback. Normal results include per-card `unmatchedLanding`, `singleMatchCapture`, or `chosenMatchCapture` details. All results are JSON-safe and use neutral actor IDs.

The established browser animation order remains hand slap, deck lift/flip/slap, played-card resolution, drawn-card resolution, Sweep check, then `concludeTurn`. Durations, sleeps, hit-sound call sites, rendering, and Go/Stop flow are unchanged.

## Special-rule fallback retained in app.js

`applySpecialTurnAction(state, { type: 'resolveSpecialTurn', actorId })` now mutates classified Ppeok/Ssa-da, Self-Ppeok, Jjok, and Ttadak outcomes and evaluates Sweep after the complete capture. It emits ordered public stack, capture, reason-tagged Pi-transfer, `sweepTriggered`, and completion events containing neutral IDs and card IDs only. The browser presents those events with the existing sound and animation choreography.

The browser still calls `deferSpecialTurn` and uses the legacy `resolveCombinedTurn`/`resolveSingleCard` fallback for unextracted cases. The duplicate implementations of the four extracted outcomes remain reachable only as conservative fallback/test characterization paths, not the classified production route. This retains:

- Bomb;
- Bomb-related and other unextracted Pi transfers;
- Chongtong;
- Go/Stop and Nagari; and
- all special scoring and settlement behavior.

Bomb blank/deck-only turns also remain on the legacy path in this step. Sweep detection and mutation are engine-owned: extracted specials evaluate it in the same transaction, normal turns evaluate it during completion, and an engine `resolveSweep` bridge supports unextracted legacy resolution without allowing `app.js` to mutate Pi.

## Known boundary risks

- `pendingTurn` and private `shakeDecision` are authoritative and serializable. Exact restoration into an already-partially-played browser animation remains a later controller/event-replay concern.
- The reducer records unmatched landing slots at play/draw time so a capture resolved earlier in the same turn cannot move a later unmatched card into a newly opened hole. This preserves the existing in-flight reservation behavior.
- The engine now mutates the four Step 6A outcomes; mutations for all other classified special outcomes remain deliberately delegated to the legacy controller.
- Sweep remains a post-resolution condition because it depends on whether capture mutation actually empties the live floor; the engine evaluates it only after the relevant capture and emits no Pi-transfer event when the opponent has no Pi.
- Player storage still uses `state.human`/`state.ai`, and browser functions retain matching local aliases because wholesale storage and DOM renaming is outside Step 5D. Explicit adapters prevent those aliases from becoming authoritative identity values.
- `projectStateForViewer` removes deck order, opponent hand identities, opponent hidden-triple metadata, and any private decision not addressed to the viewer. A declared Shake is public; KEEP SECRET produces no opponent-visible state or event. Bomb execution remains deferred.
