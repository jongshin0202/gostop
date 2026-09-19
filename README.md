# GoStop Online

English-first playable **GoStop Online** prototype.

Current baseline: **V1.10.2**

## Run locally

Open `index.html` in a modern desktop browser.

The optional authoritative two-player backend is a separate Cloudflare Worker/Durable Object project. See [`docs/cloudflare-server.md`](docs/cloudflare-server.md) for its room API, protocol, persistence model, local setup, and deployment steps.

The GoStop Card artwork and several CC0 sound effects are loaded from public web sources, so an internet connection is recommended.

## Test

Run the deterministic current-behavior characterization suite with Node.js:

```sh
npm test
```

## Current gameplay

- 48-card GoStop Card deck
- 2-player GoStop Online: Player vs Computer AI
- 10 cards per player, 8 cards on the floor
- Persistent floor positions: captured cards leave blank spaces; new unmatched cards fill blank spaces
- Matching-month target choice when more than one floor card is available
- Card lift / flip / slap / capture-slide animation flow
- Captured-card groups: **Brights / Pictures / Stripes / Singles**
- Captured groups are clickable for enlarged inspection
- Go / Stop flow and settlement formula

## Special-rule support currently implemented

- CONQUER! / four-of-a-month opening win
- Shake / Keep for Bomb
- Bomb
- Two visible blank/pass cards after Bomb
- Pooped piles (internal rule ID: Ppeok / ssa-da)
- recapturing your own Pooped pile
- FLUSH!
- KISS!
- CLEAN SWEEP!
- Initial three-card same-month floor stack rule used by this project
- Singles transfer
- Go multipliers
- Single Penalty
- Bright Penalty
- Picture Penalty
- Go Penalty
- NO WINNER carry
- explicit Sake Cup Picture / Double-Single choice

## Shuffle

- Uses `crypto.getRandomValues()`
- Unbiased rejection sampling + Fisher-Yates
- No anti-streak logic or hand shaping
- Validates a 48-card deck with four unique cards per month before dealing
- Uses a two-pass deal sequence: 5/5/4, then 5/5/4

## Scoring display

Decision and result screens show the actual settlement formula rather than only card-category counts, for example:

`Base 7 → Shake ×2 → Single Penalty ×2 → Final 28`

## Planned

- Complete rule verification against Korean expert rule sources
- Stronger AI / simulation-based AI
- AI Player Intelligence: decision-level play telemetry, Playing Style Summary, personalized Advice Mode, and “Play with Yourself” Mirror AI modeled on the player's own learned play patterns
- 3-player GoStop Online
- 4–6 player rooms with 3 active players and Gwang selling
- Online multiplayer
- Additional sound/animation polish
- Mobile packaging

## Third-party assets

This repository does not claim ownership of third-party GoStop Card artwork or sound assets.

- GoStop Card card SVGs are loaded from Wikimedia Commons.
- Normal card-contact sound is loaded from the public `itsent-lab/hwatu` project; its attribution file identifies the source as a CC0 Freesound recording.
- Explosion and evil-laugh samples are loaded from `gynura/to_you`, whose repository is released under CC0.
- Three prototype event sounds are stored as base64 data URIs in `audio-*.js` so the current browser build works without binary asset commits.

Before commercial release, do a final asset/license audit and replace prototype-only audio with production-quality licensed recordings.

## Development workflow

This GitHub repository is the source-of-truth baseline for future changes.
