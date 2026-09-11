# Authoritative and Presentation State Boundary

This inventory records the Migration Step 4 boundary. It does not extract turn actions or change Matgo behavior.

## Authoritative gameplay state

The current per-hand `state` remains authoritative for rules and outcomes:

- `deck` and its ordered card identities;
- `floor` and its public card identities;
- `human` and `ai` player records (temporary compatibility names), each containing `hand`, `captured`, `go`, `shakes`, `bombs`, `bombFreeTurns`, `ppeoks`, `hiddenTripleMonths`, `shakenMonths`, and `lastGoScore`;
- `floorStacks`, whose entries contain `month`, ordered `cardIds`, rule-relevant `source`, and owning legacy side;
- `turn`, `winner`, and the retained `specialWinner` compatibility field; and
- canonical `floorSlotCount` and `floorSlotByCard` occupancy. Slots are public synchronized gameplay-presentation state: they do not change scoring, but they must be authoritative so both future viewers preserve identical holes, stack placement, and unmatched-card landings.

The separate `gameplayContext` contains state that affects outcomes across or during hands:

- `lastScoreBySide`, used by current Go/Stop score-increase gating; and
- `nagariCarryPower`, used by Nagari and settlement.

These values remain outside the per-hand object in Step 4 to avoid changing lifecycle/reset behavior while turn execution is still in `app.js`.

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

## Deferred serializability

Authoritative state contains no DOM references, callbacks, `Map` objects, animation objects, or presentation locks. Plain JSON serialization is intentionally not yet semantically complete because each legacy player record still contains two `Set` instances:

- `human.hiddenTripleMonths` and `human.shakenMonths`;
- `ai.hiddenTripleMonths` and `ai.shakenMonths`.

`JSON.stringify` does not throw for these sets, but serializes them as empty objects and loses their members. Converting them to arrays or plain maps belongs with the later authoritative state-schema migration; forcing that conversion now would touch Shake/Bomb turn behavior. The temporary `human`/`ai` keys, legacy stack-owner values, and separate `gameplayContext` also remain compatibility concerns, though their values are otherwise JSON-compatible.

## Remaining mixed boundaries and risks

- Stack creation and floor-slot commitment still happen inside mutable turn resolution in `app.js`; extracting them now would begin the prohibited action/turn-engine migration.
- `lastScoreBySide` and `nagariCarryPower` are authoritative but remain in a module-level gameplay container until their reset/hand lifecycle can be migrated with tests.
- Canonical floor slots are presentation-motivated but intentionally authoritative and public. Treating them as local would allow the two future clients to disagree about persistent positions.
- In-flight reservation cleanup is coupled to animation completion. Cancellation/reconciliation will need explicit handling when a future event queue exists; Step 4 preserves the existing awaited animation pipeline.
- Deterministic angles preserve the established angle ranges but replace per-stack randomness with stable decoration, so a given public stack now looks identical on repeated renders and on both viewers.
