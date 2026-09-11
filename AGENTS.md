# Go-Stop Project Guidance

## Product source of truth

- This is an English-first, two-player Korean Matgo / Go-Stop browser game. Treat the existing implementation as the behavioral baseline: inspect the affected flow before changing it, and do not rewrite, simplify, rename, or rebalance working behavior unless the task requires it.
- Authentic Korean Matgo behavior is a core product requirement. Do not change rule interpretations or established terminology without asking first.
- Preserve every implemented special-rule path, including 흔들기 (Shake), 폭탄 (Bomb), 뻑/싸다 (Ppeok/Ssa-da), 자뻑 (Self-Ppeok), 따닥 (Ttadak), 쪽 (Jjok), 싹쓸이 (Sweep), 총통 (Chongtong), Go/Stop, Nagari carry, Pi transfer, and settlement multipliers (Go, Shake, Bomb, Pi-bak, Gwang-bak, Meong-bak, and Go-bak).

## Game and state invariants

- Keep the traditional 48-card Hwatu deck: four unique cards in each of twelve months. Preserve the current card types, ribbon sets, special flags, secure Web Crypto shuffle, deck-integrity checks, and two-pass 5/5/4 deal sequence.
- The current top-level game state owns the deck, floor, both players, floor stacks, turn, and winner. Per-player state includes the hand, captured cards, Go count, Shake/Bomb state, Bomb blank turns, Ppeok count, hidden/revealed triple-month state, and the score recorded at the last Go.
- Floor placement is persistent. `floorSlotByCard` and `floorSlotCount` are part of gameplay presentation state: captured cards leave holes, remaining floor cards never compact or shift, unmatched cards take a free slot, and three-card stacks share one physical slot. Keep slot reservations alive through in-flight animations and release them only after the corresponding cards leave the table.
- Preserve matching-month target selection. When the human can choose between floor cards, the interaction must remain keyboard accessible and switching to another hand card must safely cancel the pending choice. The AI may choose by capture value.
- Captured cards remain separated into the English-facing groups **Brights**, **Pictures**, **Stripes**, and **Singles**. Both the human and computer groups must remain visible and clickable/keyboard-operable for enlarged inspection.
- Scoring must continue to evaluate Gukjin in its more valuable mode (Picture or double-Single), apply Bright/Picture/Stripe/Single and set scoring, require a score increase to reopen Go/Stop, and show the real settlement formula rather than only category counts.

## Turn resolution and presentation

- Preserve the asynchronous turn pipeline: hand play and physical landing, deck lift/flip and landing, combined special-rule resolution, capture/transfer animation, scoring, then turn handoff. Guard against duplicate input and overlapping AI turns with the existing lock/pending/resolver mechanisms.
- Played and drawn cards should feel physical and tactile through lift, arc, flip, overlap, impact, and capture-slide choreography. Respect `prefers-reduced-motion`.
- Do not introduce animated hands or arms. Card-only choreography is intentional; legacy hand styles are disabled and must stay disabled.
- The card-hit “딱!” sound plays **only** when a played or drawn card actually matches/hits a floor card. An unmatched card landing in a free floor slot must be silent. Do not attach this sound to deck movement, generic landings, captures, or turn changes.
- Keep normal table play visually quiet. Animation communicates turns and actions; do not add persistent coaching, no-hit/capture banners, redundant counters, unnecessary instructional text, or other UI clutter.
- Preserve externally sourced card artwork/audio behavior and the embedded prototype event-audio globals. Before changing third-party assets or attribution, inspect `README.md` and verify licensing implications.

## Architecture

- The app is dependency-free static HTML/CSS/JavaScript and runs by opening `index.html`; there is no build system or package manifest.
- `index.html` defines the table, player/capture areas, controls, dialogs, accessibility labels, and script load order.
- `app.js` is a single strict-mode IIFE containing the deck model, mutable state machine, scoring/rules, AI heuristics, rendering, input/dialog coordination, Web Animations choreography, audio, and startup wiring. State mutation and DOM animation are deliberately coordinated; inspect both before editing either side of a flow.
- `styles.css` contains the responsive table/card presentation and historical override layers. Later rules intentionally supersede earlier prototypes (notably card-only choreography and the mirrored capture layout), so check the full cascade before removing or modifying apparently obsolete selectors.
- `audio-*.js` files are generated single-line base64 data-URI globals. Do not hand-format or casually edit them.

## Change workflow

1. Inspect the complete affected rule, state, rendering, animation, audio, and responsive-CSS flow before editing.
2. Make the smallest necessary change and preserve unrelated behavior. Add focused regression coverage when a test harness exists; do not perform opportunistic rewrites.
3. At minimum, run `node --check app.js` after JavaScript changes. Also run all repository tests and relevant syntax/programmatic checks available for the files changed. Manually exercise affected browser flows when automation cannot cover them.
4. For perceptible web UI changes, inspect the result in a browser at desktop and mobile widths and capture a screenshot when the environment supports it.
5. Keep Git history clean. Review `git diff` and `git status`, then use a concise, descriptive commit message. Do not commit generated or unrelated files.
