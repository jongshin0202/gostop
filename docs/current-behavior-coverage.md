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
