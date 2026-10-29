# GoStop Live! v1 launch gates — October 29, 2026

The working main game is frozen. Changes are confined to isolated Training Mode recommendation modules and the How-To tutorial/video code. No modifications, merges or deployments to the live game without explicit approval.

## Development vs. production: apples-to-apples acceptance
- The **game source, card rules, multiplayer behaviors, visuals, input controls, mobile layout, and scoring** must match the eventual production build byte-for-byte except the isolated new Training and How-To features being tested.
- Development site: `https://gostop-dev.vercel.app`; development Worker: `https://gostop-authority-dev.jwshin1.workers.dev`. Production game: `https://gostoplive.com`; production Worker remains independent.
- Development must **never share write access** to live accounts, sessions, rooms, coins, leaderboards, or the admin data store. Database contents may legitimately differ. Empty development rankings reflect zero qualified development accounts, not a game UI difference. Don't add separate development-only visible game UI or fake live player data.
- Match production configuration (timeouts, pause logic, email verification, login, locale, and account rules) with development equivalents before release testing. Explicit current known gap: `wrangler.dev.toml` has `EMAIL_VERIFICATION_REQUIRED=false`; production requires verification. It needs a separately configured verified development email sender before changing that flag. Do not disable verification in production.
- Test both desktop and mobile against the **isolated Worker**, including free and ranked solo, online connection, matchmaking, login and verification, leaderboards (both populated and empty test accounts), suspension/resume, and admin APIs from their proper dedicated sites.
- Do not seed development from production accounts without separate explicit permission. Generate test-only accounts by authorized development workflows if populated leaderboard tests are needed.

## Launch gate 1: Training Mode recommendations
- Do not touch `app.js`, `game-engine.js`, or any protected gameplay files. At present the old Training decision evaluator is embedded inside `app.js`; it must **not** be edited to optimize training. Develop and benchmark a standalone Training-only strategy module first.
- Correctly distinguish hand cards, table cards, captured cards, and opponent cards. Never confuse cards in hand with cards on the table.
- Prioritize genuinely achievable sets, based on reachability, not generic hierarchy displayed verbatim: Bright, useful Stripe sets, valuable Singles, and 5-BIRDIES where viable. Account for reserved cards and threatened opponent sets.
- When two matching hand cards can capture the same table card, prefer the higher-value hand card. Prefer a 2x Single over a regular Single, and Single over an ordinary Picture unless a viable 5-BIRDIES strategic exception changes the ranking.
- Don't say “lower-value card” when only one card is available, or “also denies the computer” unless blocking an imminent high-value set materially changes the decision.
- Recommend **what to play and why**, with at most one relevant primary explanation. Show relevant card highlights. Support en, ko, es, fr, de, ja, zh.
- Evaluate with photographed real positions and reproducible state fixtures, including equal-month multi-target cases, no-capture moves, Godori, Bright, Red/Blue/Plain Stripes, Gukjin, and GO/STOP.
- Integration gate: because no supported runtime training-decision hook currently exists outside `app.js`, do not claim the new engine is live until a safe, explicit integration approach is approved that respects the frozen core.

## Launch gate 2: How-To
- Provide two independently playable filmed tutorials in the existing **How-To feature only**: **How to Use GoStop Live!** (main menu, training, friend invite, competitive solo/online, leaderboards, PC mouse controls, Android touch/flick, crossing PC ↔ mobile) and **How to Play GoStop** (48 cards/12 families, matching, capture/draw, Bright/Picture/Stripe/Single, Godori, 2x Singles, Gukjin, GO/STOP, Shake, Bomb, special events, scoring).
- Existing `tutorial-video.js` now has two selectable film tracks. Validate that the live, real UI footage is accurate and the phone/desktop interactions are demonstrably reproducible; do not claim a connected PC-vs-phone session was recorded if it wasn't.
- Export or record **two usable video files** for distribution, with narration and legible captions, plus an embedded in-app experience. These files are **not complete** just because script-driven tutorials exist.
- Test user interactions, close/restart, Full Rules, Training Mode transition, desktop, S22 Ultra and Galaxy A17, portrait/landscape where supported. Verify all chapters against current rules.
- Restrict implementation files to `tutorial-video.js`, additional tutorial-only assets and dedicated tests. No edits to main input, menu, game state or scoring code.

## Production release
Both gates must pass and a broad regression suite must be green. Only then request explicit permission to merge to `main` and release at `gostoplive.com`. Never auto-promote a development deployment. The admin-console migration is a separate draft and remains blocked until its own release gate is met.
