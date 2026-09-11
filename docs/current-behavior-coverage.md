# Current Solo Behavior Characterization

This is Migration Step 1 only. The tests execute the existing `app.js` rules through a test-only opt-in hook; they do not introduce the proposed engine, networking, or new gameplay behavior.

## Deterministic coverage added

`tests/current-behavior.test.js` now characterizes:

- the 48 unique-card deck and four-cards-per-month integrity checks, including duplicate rejection;
- month matching, ordinary multiple matches, and the effective top target/expansion behavior of a three-card floor stack;
- Bright scoring with and without Rain, Godori, ribbon sets, Singles, double Pi, and Gukjin's current best-of-Picture-or-double-Single optimization;
- the current settlement order for Go bonuses, third-and-later Go multiplication, Shake, Bomb, Meong-bak, Gwang-bak, Go-bak, and Nagari carry;
- hidden-triple gating for Shake and accumulated Shake settlement multiplication;
- Bomb capture, one-Pi transfer, multiplier count, two visible blank turns, and non-negative blank-turn consumption;
- Ppeok/Ssa-da stack creation, Ppeok counting, shared stack slots, and Self-Ppeok's current full-stack capture/two-Pi transfer;
- the current Ttadak and Jjok same-month combined-turn branches;
- Sweep's one-Pi transfer after the floor becomes empty while play remains;
- opening Chongtong detection and its current ten-point special win;
- the seven-point and strict-score-increase predicate that gates another Go/Stop decision;
- Pi transfer preference for an ordinary Pi before a double Pi;
- Nagari carry increment and its current cap of three doubling powers; and
- stable floor slots after capture, including reuse of the resulting hole without movement of surviving cards.

The suite supplies fixed cards and state instead of using the secure random shuffle, and test mode removes sleeps and DOM animation work. This makes rule outcomes deterministic while exercising the same rule and scoring functions used by production.

## Still difficult to characterize automatically

- The complete click-to-dialog-to-animation turn pipeline remains DOM- and timing-coupled. Target-choice cancellation/switching, dialog cancel behavior, input locks, duplicate clicks, and AI scheduling need a real browser integration harness or the later controller boundary.
- Physical animation ordering, overlap geometry, staged-card cleanup, sound timing, match-only “딱!” playback, reduced-motion visuals, and desktop/mobile layout require browser observation. The Node characterization suite intentionally bypasses those effects rather than simulating them inaccurately.
- Secure shuffle distribution and Web Crypto entropy are not deterministic. The suite validates deck structure and rejection behavior, but statistical shuffle testing and the exact two-pass deal require a controlled randomness seam that belongs after approval of the relevant migration step.
- AI selection contains `Math.random()` tie-breaking and is intertwined with delays and DOM target previews. It is not made deterministic in Step 1.
- Multi-turn combinations involving multiple Shakes/Bombs/Ppeoks, exhaustion immediately after a special capture, and every possible ordering of Go-bak with later score changes are not exhaustively enumerated.
- There is no online authority, revision, audience projection, replay, or viewer-relative client yet, so those approved design requirements cannot be executable tests until their later migration steps.

## Current behavior needing rule confirmation

These observations are recorded, not corrected:

- `app.js` represents Ppeok/Ssa-da with one `ppeok` stack source. The README separately names Ppeok/Ssa-da and Self-Ppeok, while the implementation distinguishes stack ownership only when calculating the Pi steal on capture. Confirm desired English/Korean labels before exposing semantic engine events.
- The project-specific initial three-card floor stack is one effective match target and awards one Pi when captured. This is explicitly documented as a project rule and must not be normalized to another table convention without approval.
- Jjok and Ttadak are inferred from the same-month combined-turn branches rather than recorded as named state/events. Their outcome is covered, but exact event naming and whether bonuses combine with Sweep need rule confirmation before extraction.
- A captured Ppeok stack transfers two Pi when captured by its owner and one Pi when captured by the opponent. The current code and test preserve this asymmetry; terminology around “Self-Ppeok” should be confirmed before changing it.
- Three Ppeoks in one hand trigger an immediate seven-point special win. This path is not renamed or rebalanced here.
- If both opening hands contain a four-card month, the human check runs first and wins. The likelihood is low, but server-era tie precedence should be explicitly confirmed rather than silently retained or changed.
- Nagari begins when the acting player's virtual hand reaches zero or the deck reaches zero, and its carry exponent caps at three. Confirm these settlement conventions before the engine makes them protocol-visible.
- Go/Stop is offered only when total score is at least seven and strictly higher than the score remembered after the actor's previous turn. The existing implementation updates that remembered score each turn, while `lastGoScore` is separately used for Go-bak.
- Bomb is attempted by the AI before its Shake decision. For the human, declining Shake can lead to the Bomb prompt when the fourth card is on the floor; declaring Shake skips that Bomb prompt for the selected play. No priority behavior is changed in Step 1.

No ambiguous behavior above should be corrected without explicit product/rules approval.

## Migration Step 2 boundary coverage

The suite also proves both viewer orientations and the temporary Solo compatibility map:

- viewing as `playerA` places `playerA`/the existing human state at the bottom and `playerB`/the existing AI state at the top;
- viewing as `playerB` reverses the seats without changing authoritative state;
- `otherPlayerId` is symmetric for the two stable IDs; and
- Solo remains `playerA` as the local human and `playerB` as the AI, with the existing `human`/`ai` state keys retained behind compatibility helpers.

The production renderer now obtains bottom/top players through this seat map. Capture inspection, capture animation destinations, card motion direction, Bomb source geometry, and Go callout placement also resolve legacy actors through the same viewer-relative boundary. Existing DOM IDs, CSS classes, labels, rules, turn scheduling, AI policy, scoring, and authoritative `human`/`ai` schema intentionally remain unchanged.

The chief Step 2 risk is that presentation still receives legacy `human`/`ai` actor values from the rule pipeline. Centralizing their conversion prevents new boundary branching, but full removal must wait for later migration steps so rule execution is not rewritten prematurely. “Computer” also intentionally remains Solo presentation metadata.

## Migration Step 3 extraction coverage

`game-engine.js` now owns the immutable month/card definitions and master deck plus the pure `assertDeckIntegrity`, `countsByMonth`, `tripleMonths`, `fourMonths`, `hasFourOfMonth`, `matchingCards`, `score`, `scoreWithGukjinMode`, and parameterized `calculateSettlement` functions. `app.js` consumes that frozen API and retains only a thin state-to-settlement wrapper for its current `human`/`ai` state.

The tests load the engine both as a classic script before `app.js` and directly through CommonJS. Added assertions cover the frozen API, matching and triple/four-month helpers, and isolated settlement results for Go bonus, Shake, Bomb, Pi-bak, Gwang-bak, Meong-bak, Go-bak, and Nagari in addition to the existing combined settlement fixture.

Secure shuffle and audit logging intentionally remain in `app.js` because randomness belongs to the current local authority. Stack-aware floor matching, initial-stack creation, floor-slot management, Gukjin presentation, all mutable captures/turns/special rules, AI, DOM, animations, dialogs, and audio also remain there because they depend on mutable state or presentation sequencing.

No new rule ambiguity was introduced. The extracted settlement preserves the existing multiplier order and the previously documented conventions; in particular, it does not decide any unresolved terminology or special-rule policy.

## Migration Step 4 state-boundary coverage

Local locks, selection callbacks, dialog resolvers, staged DOM cards, highlights, AI scheduling protection, audio preference, and in-flight floor reservations now live in one `presentation` container. Canonical per-hand state and synchronized floor-slot occupancy remain authoritative; Go/Stop score history and Nagari carry now reside in its serializable `matchContext`.

Added tests prove that in-flight reservations choose distinct slots without entering authoritative state, deterministic tilt/stack decoration cannot mutate an outcome, and the authoritative object contains no presentation objects. The existing stable-hole and shared-stack-slot tests continue to cover canonical placement.

## Serialization normalization coverage

The four authoritative triple-month `Set` fields are now unique month arrays accessed through representation helpers. Go/Stop score history and Nagari carry moved into `state.matchContext`. The suite verifies a complete state through serialize → JSON stringify/parse → deserialize, including ordered deck, private hands, captures, floor slots/stacks, all player counters and declarations, result fields, cross-hand context, and identical settlement before and after restoration.

## Migration Step 5A normal-turn coverage

Normal unmatched landings, ordinary single captures, and player-selected two-target captures now run through deterministic `playCard`, `chooseFloorTarget`, `drawNextCard`, `resolveNormalCard`, and `completeTurn` engine actions. Parity fixtures compare their final authoritative state against the retained legacy resolver, including the subtle case where a pre-reserved unmatched landing must not move into a hole opened by the preceding capture.

Validation tests cover actor/turn, card ownership, target legality, player-private target decisions, public ordered events, and explicit rejection of same-month and floor-stack special resolution. All earlier special-rule characterization tests remain on and continue to exercise the existing `app.js` branches.

## Migration Step 5B protocol coverage

The extracted action boundary now accepts only neutral `actorId` values (`playerA` or `playerB`); events and private decisions use the same IDs. Solo adapts its local human to `playerA` and AI to `playerB`, while the authoritative player keys and `state.turn` remain legacy-shaped behind that compatibility boundary.

Serializable `state.pendingTurn` phases make target choice, deck draw, ordered played/drawn resolution, and completion explicit. Tests round-trip both awaiting-target and awaiting-draw states through JSON, verify the preserved legal continuation, exercise a complete `playerB` turn, reject legacy and wrong-player actors, and verify neutral actor IDs on all normal-turn events.

## Migration Step 5C classification coverage

The pure `classifyTurnOutcome` API distinguishes Bomb eligibility, pending floor-target decisions, normal unmatched/single/chosen captures, Jjok, Ppeok/Ssa-da, Ttadak, Self-Ppeok, other floor-stack interactions, completion, and conservative legacy-special fallback. Step 5C moved routing first; Steps 6A/6B subsequently moved the first classified special family and Sweep mutations into the engine.

Fixtures cover both neutral actors, JSON round-trip stability, neutral-only classifier output, and parity between a classified Ppeok/Ssa-da candidate and the existing legacy resolver's resulting stack. Sweep is documented as post-resolution because its applicability depends on the floor after capture mutation.

## Migration Step 5D identity coverage

Authoritative `turn`, floor-stack `owner`, player-valued result fields, and score-history keys now use `playerA`/`playerB`. Deserialization strictly rejects legacy identity values rather than guessing how an old snapshot should map. The `state.human`/`state.ai` storage keys and browser-side aliases remain as the intentional Solo compatibility boundary.

Tests exercise both neutral turns, wrong-player rejection, neutral Ppeok ownership and Self-Ppeok classification, lossless identity round trips, strict legacy rejection, and a recursive known-identity-field scan.

## Migration Step 6A special-mutation coverage

The deterministic `resolveSpecialTurn` action now performs Ppeok/Ssa-da formation, own-stack Self-Ppeok capture, Jjok, and Ttadak mutations for both neutral players. It owns canonical stack slots and cleanup, neutral ownership, Ppeok counts, capture ordering, and ordinary-Pi-first transfers with double-Pi and insufficient-Pi fallback.

Tests assert event order/audience/neutral IDs, absence of hand data, exact stack and capture ordering, shared/free slot behavior, Ttadak decision precedence, legacy Ppeok presentation parity, and JSON round trips after every extracted family.

## Migration Step 6B Sweep coverage

Sweep is now detected and mutated after the engine completes the applicable capture. Jjok, Ttadak, and Self-Ppeok fixtures cover live-floor emptying, no-Sweep when a card remains, ordinary-Pi-first and double-Pi fallback, no-op transfer when no Pi exists, both neutral actors, stable freed slots, serialization, and protection against a second Sweep during turn completion. The browser only animates reason-tagged `piTransferred` events; its retained Sweep helper is an engine-backed bridge for unextracted legacy resolvers.

## Migration Step 6C Shake coverage

The engine initializes hidden three-card-month eligibility without opening a prompt. `attemptPlayCard` creates a JSON-safe player-private Shake decision only when an eligible triple card is selected; `declareShake` mutates Shake count/month state and emits public `shakeDeclared`, while `keepShakeSecret` emits nothing and preserves immediate Bomb eligibility. Both responses return the attempted card ID so Solo continues the same play.

Viewer-projection tests prove only the acting viewer receives the decision, while opponent hand identities, hidden months, triple card IDs, and deck order are absent. Tests also cover both neutral actors, unrelated cards, serialization, wrong/stale/duplicate responses, declaration-driven bell presentation, and continuation after either choice. Step 6D subsequently moved Bomb execution into the engine.

## Migration Step 6D Bomb coverage

KEEP SECRET now creates a private Bomb decision when the established three-in-hand/fourth-on-floor condition holds. `declareBomb` atomically removes and publicly reveals the three cards, captures the ordered four-card month, frees the floor slot, increments Bomb state, grants exactly two optional blanks, transfers ordinary Pi before double-Pi fallback, and enters `awaitingDraw`; decline is silent and resumes the selected card.

Tests cover both neutral actors, decision and event privacy, stale/wrong/duplicate responses, exact event order, accepted-event-driven sound, no-Pi fallback, serialization at decision/mutation/blank boundaries, optional real-card play, two blank consumptions, third-use rejection, hand preservation, direct deck draw, and Shake preventing later Bomb eligibility.

## Migration Step 6E Chongtong coverage

`resolveOpeningState` now owns initial Chongtong detection and terminal mutation. It first preserves the established hidden-triple initialization order, records an opening resolution, and either continues without an event or sets neutral `winner`/`specialWinner`, records the ten-point Chongtong result, and emits one public `chongtongDeclared` event. The browser no longer checks four-card months or writes the winner; it presents the accepted event and retains the established Solo fanfare behavior.

Fixtures cover no-win openings, Player A and Player B wins, exact month and ten-point metadata, JSON round trips before and after resolution, viewer-safe terminal projection, absence of Shake/Bomb/normal legal actions after a win, and event payload privacy. A deliberately representable simultaneous fixture locks in the current Player A-first precedence rather than inventing a new tie rule. Nagari/deck-exhaustion conclusion remains outside this extraction.

## Migration Step 6F Go/Stop coverage

`evaluateGoStop` now runs after the complete authoritative capture/Sweep pipeline. It creates a player-private decision only at seven or more points and only when the score strictly exceeds the actor's last accepted GO score. Ineligible continuing turns and accepted GO declarations perform neutral turn handoff; exhausted hands/decks return a Nagari-required signal without extracting that deferred conclusion.

`declareGo` atomically increments GO, records the accepted score, and emits public neutral events. `declareStop` sets the ordinary neutral winner without changing `specialWinner`, stores the existing `calculateSettlement` structure as `terminalResult`, respects and consumes an already-recorded Nagari multiplier, and emits public terminal events. Tests cover both players, viewer redaction, invalid/stale/duplicate decisions, serialization at decision/GO/STOP boundaries, Bomb-blank completion, Chongtong exclusion, multiple-GO strict improvement, and every existing settlement multiplier including opponent Go-bak. AI choice strategy remains browser-local.

## Migration Step 6G Nagari coverage

`resolveNagari` now owns the established exhausted-hand/deck terminal transition. It accepts only the neutral actor whose turn just completed, rejects unresolved decisions/turns and premature or duplicate declarations, retains the `"nagari"` no-winner sentinel, emits public card-free terminal events, and stores a serializable result. Carry increments by one to a cap of three, yielding next-hand multipliers ×2, ×4, and ×8.

Fixtures preserve Go/Stop-before-Nagari ordering, final-turn STOP, GO followed by exhaustion, equal/lower post-GO exhaustion, both players, projection privacy, and JSON round trips. They also characterize the existing Bomb difference: when the deck is already empty before a Bomb-required draw or Bomb blank, the direct empty-draw branch proceeds to Nagari without a new Go/Stop check; consuming the final available deck card completes through the ordinary post-turn Go/Stop evaluation. STOP and Chongtong both consume prior carry authoritatively. The terminal hand supplies its carry to the next controller-created shuffled hand; secure randomness remains outside the deterministic engine.
