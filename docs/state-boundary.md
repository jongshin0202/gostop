# Authoritative and Presentation State Boundary

This inventory records the Migration Step 4 boundary. It does not extract turn actions or change Matgo behavior.

## Authoritative gameplay state

The current per-hand `state` remains authoritative for rules and outcomes:

- `deck` and its ordered card identities;
- `floor` and its public card identities;
- `human` and `ai` player records (temporary compatibility names), each containing `hand`, `captured`, `go`, `shakes`, `bombs`, `bombFreeTurns`, `ppeoks`, array-backed `hiddenTripleMonths`, array-backed `shakenMonths`, and `lastGoScore`;
- `floorStacks`, whose entries contain `month`, ordered `cardIds`, rule-relevant `source`, and a neutral `playerA`/`playerB` owner (or `null` for an opening stack);
- neutral `turn` and player-valued `winner`/`specialWinner` fields, plus the non-player terminal sentinels currently used by the game;
- neutral-keyed `matchContext.lastScoreBySide`, used by current Go/Stop score-increase gating, and `matchContext.nagariCarryPower`, used by Nagari and settlement; and
- canonical `floorSlotCount` and `floorSlotByCard` occupancy. Slots are public synchronized gameplay-presentation state: they do not change scoring, but they must be authoritative so both future viewers preserve identical holes, stack placement, and unmatched-card landings.

Triple-month array access is encapsulated by membership, unique-add, and delete helpers so rules do not depend on array operations directly. New hands reset score history while carrying forward Nagari power exactly as before.

## Public synchronized presentation state

- Canonical floor slot occupancy (`floorSlotCount` and `floorSlotByCard`) stays on authoritative state because persistent physical positions are a shared public requirement.
- Floor stack order, source, and owner stay authoritative because they determine effective matching and Pi transfer as well as public layout.
- The displayed round number is currently `presentation.roundNo`. It is local metadata in Solo, but a future session protocol may need to synchronize an equivalent hand/round identifier; the present value does not affect rules.

## Local-only presentation and transient state

The `presentation` container now owns:

- `locked`, the transient input/animation lock;
- `hintCardId`, the local highlight;
- `soundEnabled`, a local preference;
- `targetChoiceCleanup`, `pendingHumanCardId`, and `queuedHumanCardSwitch`, which coordinate DOM selection;
- `shakeResolver` and `bombResolver`, which are local dialog callbacks;
- `aiTurnInProgress`, which prevents duplicate local AI scheduling;
- `stagedCards`, a `Map` of temporary DOM animation objects;
- `floorSlotReservations`, a `Map` of in-flight card IDs to locally reserved landing slots; and
- `roundNo`, current Solo presentation/session metadata.

The module-level `els` object is also local-only DOM state. Audio element caches, animation timers, Web Animation objects, computed rectangles, and temporary elements remain local implementation details and never enter authoritative state.

## Floor placement boundary

`reserveFloorSlot` now records an in-flight landing only in `presentation.floorSlotReservations`. `occupiedFloorSlots` considers canonical occupancy plus those reservations, preventing two cards animated in the same turn from selecting one hole. `commitFloorSlot` moves the selected slot into canonical `floorSlotByCard` only when the card is added to `state.floor`. Captures clear local reservations through animation cleanup and clear canonical occupancy through `removeFloorCards`.

Canonical surviving card slots never change. New unmatched cards still choose the first available hole, three-card stacks still commit all cards to one slot, and the visible grid temporarily includes locally reserved overflow slots without changing canonical capacity until commit.

## Visual decoration

`floorStacks` no longer stores random `angles`. Stack angles and ordinary floor tilt are deterministic functions of public stack/card identifiers. They remain local render decoration, consume no `Math.random()`, and cannot affect shuffle, legal matching, capture, scoring, or settlement.

## Lossless serialization

Authoritative state contains no DOM references, callbacks, `Set`/`Map` objects, animation objects, presentation locks, undefined values, non-finite numbers, or circular references. `serializeGameState` validates that boundary and returns detached plain data; `deserializeGameState` clones and validates the wire data and normalizes unique month arrays.

The complete match now round-trips losslessly through JSON, including deck order, hands, captures, floor and slots, stacks, turn/result fields, player rule counters, hidden and shaken months, Go history, and Nagari carry.

The temporary `human`/`ai` player-storage keys remain a compatibility concern, but they are aliases for `playerA`/`playerB`, not authoritative identity values. New serialization strictly rejects legacy values in `turn`, stack `owner`, winner fields, and score-history identity keys rather than silently normalizing ambiguous snapshots.

Persistence is exact at stable engine turn boundaries and at Shake, Bomb, and Go/Stop decision boundaries. The current asynchronous controller still keeps animation continuations and unextracted dialog promises in local call-stack/presentation state, so snapshots in the middle of those browser-only flows cannot resume at the exact await point without later event replay support.

Shake and Bomb decisions are authoritative and player-private. `projectStateForViewer` exposes either record only to its player; the opponent receives neither the decision nor hidden month/card data, and receives only `handCount` and `deckCount` rather than opponent-hand or deck identities. `shakeDeclared` and `bombDeclared` are public only after acceptance. KEEP SECRET and Bomb decline emit nothing public. Bomb capture, multiplier count, Pi transfer, and its two optional blank opportunities are engine-owned; a blank creates an `awaitingDraw` turn without consuming a hand card.

Opening Chongtong resolution is also authority-owned. `resolveOpeningState` initializes hidden-triple eligibility in the established order and then records `openingResolved`; a four-of-a-month sets neutral `winner` and `specialWinner`, records the public ten-point `openingOutcome`, consumes any prior Nagari carry into a structured `terminalResult`, and emits `chongtongDeclared` before any normal turn interaction. The projected terminal state exposes that public result and no legal actions, while continuing to redact the opponent's unrelated hand. Fanfare and result-dialog work remain presentation-only.

Post-turn Go/Stop eligibility is authority-owned and runs only after capture, Pi transfer, and Sweep resolution. The seven-point threshold and strict improvement over `matchContext.lastScoreBySide[playerId]` create a player-private `goStopDecision`. Accepted GO updates the player's count and both last-GO score representations before neutral handoff; accepted STOP stores a JSON-safe `terminalResult` containing the existing structured settlement and clears consumed Nagari carry. GO/STOP declarations and the final result are public, while the unresolved choice is visible only to its addressee. AI choice policy and all presentation remain local.

Nagari/deck exhaustion is authority-owned through `resolveNagari`. Continuation is impossible when the actor's real hand plus Bomb blanks is zero or the deck is empty. The engine preserves Go/Stop-first ordering, then records the existing `winner: "nagari"` no-winner sentinel, increments carry by one up to three, stores the ×2/×4/×8 next-hand result, and emits public terminal events. The terminal hand owns that carry; the session passes it into the next freshly shuffled hand's `matchContext`. Secure shuffle/deal remains controller-owned and outside deterministic transitions.

Three-Ppeok is authority-owned as part of Ppeok/Ssa-da resolution. After stack creation and count increment, the existing `ppeoks >= 3` threshold creates a seven-point `threePpeok` terminal result, consumes accumulated Nagari carry, sets the neutral winner, and deliberately leaves `specialWinner` unchanged. Public terminal events follow `ppeokFormed` and `specialResolved`; the browser retains only Ppeok sound, the existing delay, and WIN-result presentation.

## Remaining mixed boundaries and risks

- Legacy mutation helpers remain in `app.js` solely as `TEST_MODE` characterization oracles and throw if called in production. All production classifications now resolve through engine actions; unexpected `legacySpecial` states fail loudly rather than entering a browser mutation fallback.
- Controller functions may still use local `human`/`ai` aliases to select the compatibility storage objects and existing DOM paths. Explicit adapters translate those aliases at every authoritative identity boundary.
- Sweep detection and Pi mutation are authoritative engine operations. Presentation consumes `sweepTriggered` and reason-tagged `piTransferred` events; the browser does not infer an empty-floor bonus or edit captured piles.
- Canonical floor slots are presentation-motivated but intentionally authoritative and public. Treating them as local would allow the two future clients to disagree about persistent positions.
- In-flight reservation cleanup is coupled to animation completion. Cancellation/reconciliation will need explicit handling when a future event queue exists; Step 4 preserves the existing awaited animation pipeline.
- Deterministic angles preserve the established angle ranges but replace per-stack randomness with stable decoration, so a given public stack now looks identical on repeated renders and on both viewers.

## Final authority table

| Gameplay concern | Authority owner | Presentation owner |
| --- | --- | --- |
| Deck, hands, floor, captures | Engine after hand creation | Browser renders projected cards/counts |
| Matching and target legality | Engine | Browser collects an addressed choice |
| Initial/Ppeok stack interactions | Engine | Browser animates full-stack capture/laugh |
| Pi transfers | Engine selects and moves the card | Browser animates `piTransferred` |
| Shake / KEEP SECRET | Engine and private projection | Browser dialog, bells, reveal choreography |
| Bomb and Bomb blanks | Engine | Browser choice and Bomb choreography |
| Ppeok, Jjok, Ttadak, Self-Ppeok, Sweep | Engine | Browser card/audio choreography |
| Three-Ppeok | Engine | Browser WIN result after Ppeok presentation |
| Go/Stop | Engine | Browser decision UI/callouts; local AI policy |
| Chongtong | Engine | Browser fanfare/result dialog |
| Nagari and carry | Engine | Browser no-winner/result dialog |
| Settlement and winner | Engine | Browser formats structured result |
| Canonical floor slots | Engine | Browser keeps local in-flight reservations |
| Pending decisions | Engine; viewer projection redacts | Browser resolver/dialog only |
| AI policy | Solo browser controller | Browser pacing/cues |
| Animations and audio | — | Browser |
| Secure shuffle/deal/new-hand construction | Solo session/controller boundary | Browser deal presentation |
