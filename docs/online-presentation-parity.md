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
