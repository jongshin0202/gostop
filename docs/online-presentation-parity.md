# Online presentation parity audit

## Root cause and sequencing

The first Online adapter assigned every arriving snapshot directly to `state` and called `render()` before interpreting its events. That removed hand/floor DOM nodes before Web Animations could measure their source positions. It also sent the event list only to the Sweep-only semantic helper, bypassing card staging, deck flip, capture slides, Pi transfers, special sounds, terminal dialogs, and milestone waits.

Connected play now serializes transitions through `onlinePresentationQueue`. Each transition keeps the previous rendered state, maps authoritative actor seats into the viewer's bottom/top coordinates, awaits the canonical presentation functions, reconciles the new snapshot, renders, presents post-mutation overlays, and only then considers the next authority action. An eventless reconnect/sync snapshot reconciles immediately; half-finished animation state is not resumed.

## Behavior checklist

| Behavior | Shared Solo presentation used by Online |
| --- | --- |
| Initial entry/deal | `presentOpeningSequence`, `presentDealSequence` |
| Opening decisions | `showShakeChoice` plus the existing Shake dialog; server `nextAction` keeps play locked |
| Own normal play | `animateHandCardSlap` from the actual bottom-hand card rectangle |
| Opponent normal play | `animateHandCardSlap` from `approximateAiSource` (the canonical top-hand source) |
| Deck reveal/draw | `animateDeckLiftFlip`, then `animateStagedSlap` |
| Unmatched floor landing | staged card retained through `cardLanded`, then canonical render |
| One-match capture | `animateCaptureBatch` |
| Two-target choice | `chooseFloorTarget`; authority validates and emits `floorTargetChosen` |
| Ppeok / First Poop | `playPpeokSound`, `showSpecialTransient`, `showFirstPoopNotice` |
| Self-Ppeok / floor stacks | `animateCaptureBatch`, `presentPiTransferEvents` |
| Ttadak | `animateCaptureBatch`, `playTapTapSound`, `showSpecialTransient` |
| Jjok / Kiss | shared `presentKiss` |
| Sweep | `presentSemanticEvents`, which uses `playSweepSound`, `showSpecialTransient`, and the broom animation |
| Bomb | `animateBombSlap`, `animateCaptureBatch`, `presentPiTransferEvents` |
| Bomb blank | normal authoritative deck pipeline and the same deck presenters |
| Shake | `presentShakeDeclaration` and its existing sound/reveal UI |
| Pi transfer | `presentPiTransferEvents` |
| Go | `showGoCallout` |
| Stop | `presentStopResult` |
| Gukjin | `promptGukjinChoice` / existing Gukjin dialog |
| Nagari | existing grand-result components and copy, without invoking local mutation |
| Conquer / Triple Poop | `presentChongtong`, `presentThreePpeok` |
| Scoring milestones / Godori | `presentNewMilestones` |
| Terminal result | existing result dialog helpers driven by authoritative terminal events |
| Next hand | authority `newHand`, followed by the same opening/deal entry presenters |

`showShakeChoice` always derives evidence from the acting viewer's projected hand and the private decision's card IDs. The opponent projection contains neither the decision nor those hidden hand identities. A public `shakeDeclared` event then carries the revealed IDs to both viewers and invokes `presentShakeDeclaration`.

Online labels replace the top `Computer`/`AI` identity with the localized `opponent` label and its localized abbreviation when a network room starts. The checked-in Solo markup and localization attributes remain unchanged until that point.

## Normal-turn event ownership

The authority emits each event once; the observed duplication was overlapping browser responsibility, not a repeated server revision. A normal connected turn is: `attemptPlayCard` (no physical event), `cardPlayed`, optional `floorTargetChosen`, `deckCardRevealed`, optional drawn `floorTargetChosen`, one or two `cardLanded`/`cardsCaptured` resolution events, then `turnCompleted`. Each accepted action advances exactly one revision.

`planOnlinePresentation` makes physical ownership explicit: `cardPlayed` owns hand departure (or a single held stage when a target is pending); `deckCardRevealed` owns the one deck lift/flip; `floorTargetChosen` continues the already-existing stage and never repeats departure; `cardsCaptured` owns the capture slide and deletes staging ownership; and `cardLanded` deletes staging ownership as the canonical floor node takes over. Semantic overlays never create another physical card flight.

The phantom matching draw was a stale fixed-position staged DOM clone: the authoritative drawn card existed only in captured cards and never remained on the floor. Explicit capture/landing cleanup now removes both the `presentation.stagedCards` entry and its detached DOM element before the reconciled floor/capture view settles. Authority-level conservation validation independently proves all 48 IDs exist exactly once after every accepted mutation, treating an unresolved pending played/drawn card as an owning location only while it is absent from the canonical zones.

## Motion continuity

The remaining choppiness came from `onlineSubmit` calling `render()` before every continuation revision, in addition to the safe-boundary render performed by `presentOnlineTransition`. Those redundant canonical renders forced layout and hand/deck queries between physical phases. Submission now only locks and sends; the queued transition is the sole reconciliation owner.

A hand or deck card is created once in `presentation.stagedCards`. Target choice retains that element, and the continuation calls the same `animateStagedSlap` used by Solo. The deck lift, outer-card position, inner-face flip, reveal pause, slap, and capture therefore retain one element identity. The existing animation helpers still own their established `normalizeFixed`/cancel handoffs, durations, offsets, and easing; Online adds no intermediate cancellation or alternate easing.

Physical presenter calls are wrapped by `runPhysicalMotion`. `render()` records any attempt made while motion is active, providing a regression-visible interruption counter. Reconciliation occurs after the planned physical loop, while reconnect/eventless sync intentionally clears in-flight stages and renders immediately. For Jjok, the planner explicitly targets the staged same-month played card, so the one revealed deck element travels from flip to that card and then both elements enter the single capture/Kiss path.

## Transport delivery and authoritative handoff

`OnlineSessionAdapter.receive` treats `snapshot` as a terminal dispatch branch: it updates the revision, emits one normalized snapshot event, and returns rather than falling through to the generic type dispatch. Accepted and rejected action envelopes clear the one pending action and are each dispatched once. Consequently, one public Jjok capture reaches the presentation queue once and produces one Kiss presenter invocation per browser.

Online `completeTurn` is composite at the session authority boundary. In the same accepted revision, the authority appends `turnCompleted`, evaluates the actor's score, and either creates the private Go/Stop decision, appends `turnHandedOff`, performs automatic terminal Stop, or resolves exhausted-hand Nagari. The Worker rejects client attempts to submit `evaluateGoStop` or `resolveNagari`; the browser only presents this result. A rejected browser action recomputes its lock from the latest viewer snapshot rather than assuming rejection grants permission to play.

## Same-month special targeting and shared pacing

Jjok, Ppeok/Ssa-da, and Ttadak now share the same same-month visual rule in Online presentation: when the authority identifies the pending played/drawn pair as a same-month special, the revealed deck card impacts the already-staged played card rather than an ordinary floor target. This preserves the Solo choreography and prevents Ttadak or Ppeok from exposing an irrelevant drawn-card target choice.

The authoritative snapshot chooses `resolveSpecialTurn` before `chooseFloorTarget` for these unresolved same-month special states. Once the special has resolved and the pending turn advances to turn completion, the authority no longer advertises `resolveSpecialTurn`, preventing the same Jjok, Ppeok, or Ttadak capture from being applied twice.

Solo and Online also share one presentation pacing contract for the physical turn sequence:

- hand play to deck action: 330 ms
- deck reveal pause: 180 ms
- landed-card cleanup: 180 ms
- post-capture pause: 190 ms

These values are centralized in `PRESENTATION_PACING` and used by both presentation paths so Online does not compress or accelerate the established Solo rhythm.
