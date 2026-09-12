# GoStop Online canonical rules

This document is the product source of truth for the deterministic two-player engine. HanGame's Korean duel GoStop guides are the professional reference baseline; the explicit variations below take precedence. The application uses one shared reducer for Solo and future online play.

## Cards and finish threshold

A hand uses the traditional 48 unique cards, four per month. The two-player finish threshold is 7 points. Secure Fisher–Yates shuffle and the physical two-pass deal are retained: starter 5, opponent 5, floor 4, then repeat. A floor dealt all four cards of a month is the sole redeal condition; player triples are never suppressed.

## Base scoring

- **Brights:** three score 3, except a three-card group containing Rain Bright scores 2; four score 4; all five score 15.
- **Pictures:** five score 1 and each additional Picture adds 1. The exact February, April, and August birds add 5 (**3-BIRDIES!**).
- **Stripes:** five score 1 and each additional Stripe adds 1. Each exact red, blue, or grass three-card set adds 3; December Rain Stripe is not a grass-set card.
- **Singles:** effective value 10 scores 1 and each additional value adds 1. November Paulownia and December Rain Double-Singles always count 2. September Sake Cup is an explicit Picture or 2-Singles choice.
- **First Poop:** a player's first-turn Pooped pile adds 7 side-reward points and play continues.

## Go, Shake, Bomb, and settlement

- One Go adds 1 point; two Go adds 2. Three Go doubles the final score, and every later Go doubles again.
- Each accepted public Shake doubles the final score. Keep for Bomb remains private and silent.
- Bomb plays the three matching hand cards against the fourth floor card, steals exactly one Single where available, and grants two optional blank turns. **Bomb deliberately has no score multiplier.** This is a GoStop Online house-rule choice and differs from commercial variants that multiply Bomb.
- Single Penalty requires the winner to have at least 10 effective Singles and the loser to have 1–7; zero is excluded. Bright, Picture, and Go Penalties retain the engine's selected behavior.
- Each NO WINNER carry level doubles the next completed hand and is consumed by that completed terminal result.

## Initial and terminal rules

- **CONQUER!** is an initial hand containing all four cards of a month. Its minimum is 7 points in two-player GoStop; the future 3+ player helper uses 3.
- An opening Bomb declaration only arms its month. It moves no cards and consumes no turn. The Bomb executes only when one of its three marked cards is played during that player's actual turn.
- Opening declarations never alter `startingPlayerId` or hand off a turn.
- **TRIPLE POOP!** remains an immediate 7-point-minimum terminal win when the actor reaches three Pooped piles.
- **NO WINNER!** is legal only when both hands and Bomb blank opportunities are exhausted and no turn or decision is pending.

## Capture specials

KISS, TAP-TAP, CLEAN SWEEP, an initial three-card floor stack capture, and capture of an opponent's Pooped pile each steal one Single. Recapturing one's own Pooped pile retains its established two-Single behavior. These transfers prefer an ordinary Single, then a Double-Single, and never fabricate cards.

## Authority and privacy

The engine owns card movement, captures, stack metadata, transfers, decisions, turn ownership, scores, settlement, winners, and terminal results. Browser code owns policy, dialog acknowledgment, audio, animation, and session display. State and events are JSON-safe. Viewer projection redacts opponent hand identities and deck order; only accepted Shake card sets become public.
