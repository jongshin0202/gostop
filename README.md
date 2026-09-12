# Go-Stop / Matgo

English-first playable Korean **Matgo / Go-Stop** prototype.

Current baseline: **V1.10.2**

## Run locally

Open `index.html` in a modern desktop browser.

The Hwatu card artwork and several CC0 sound effects are loaded from public web sources, so an internet connection is recommended.

## Test

Run the deterministic current-behavior characterization suite with Node.js:

```sh
node --test tests/current-behavior.test.js
```

## Current gameplay

- 48-card Hwatu deck
- 2-player Matgo: Player vs Computer AI
- 10 cards per player, 8 cards on the floor
- Persistent floor positions: captured cards leave blank spaces; new unmatched cards fill blank spaces
- Matching-month target choice when more than one floor card is available
- Card lift / flip / slap / capture-slide animation flow
- Captured-card groups: **Brights / Pictures / Stripes / Singles**
- Captured groups are clickable for enlarged inspection
- Go / Stop flow and settlement formula

## Korean rule support currently implemented

- Chongtong / four-of-a-month opening win
- Shake / keep secret
- Bomb
- Two visible blank/pass cards after Bomb
- Pooped piles (internal rule ID: Ppeok / ssa-da)
- recapturing your own Pooped pile
- Ttadak
- Jjok
- Sweep
- Initial three-card same-month floor stack rule used by this project
- Singles/Pi transfer
- Go multipliers
- Pi-bak
- Gwang-bak
- Meong-bak
- Go-bak
- Nagari carry
- explicit Gukjin Picture / Double-Pi choice

## Shuffle

- Uses `crypto.getRandomValues()`
- Unbiased rejection sampling + Fisher-Yates
- No anti-streak logic or hand shaping
- Validates a 48-card deck with four unique cards per month before dealing
- Uses a two-pass Matgo deal sequence: 5/5/4, then 5/5/4

## Scoring display

Decision and result screens show the actual settlement formula rather than only card-category counts, for example:

`Base 7 → Shake ×2 → Single Penalty ×2 → Final 28`

## Planned

- Complete rule verification against Korean expert rule sources
- Stronger AI / simulation-based AI
- 3-player Go-Stop
- 4–6 player rooms with 3 active players and Gwang selling
- Online multiplayer
- Additional sound/animation polish
- Mobile packaging

## Third-party assets

This repository does not claim ownership of third-party Hwatu artwork or sound assets.

- Hwatu card SVGs are loaded from Wikimedia Commons.
- Normal card-contact sound is loaded from the public `itsent-lab/hwatu` project; its attribution file identifies the source as a CC0 Freesound recording.
- Explosion and evil-laugh samples are loaded from `gynura/to_you`, whose repository is released under CC0.
- Three prototype event sounds are stored as base64 data URIs in `audio-*.js` so the current browser build works without binary asset commits.

Before commercial release, do a final asset/license audit and replace prototype-only audio with production-quality licensed recordings.

## Development workflow

This GitHub repository is the source-of-truth baseline for future changes.
