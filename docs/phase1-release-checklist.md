# Phase 1 — Accounts, Coins, Ranked Play, and Leaderboards

Release gate for the first ranked GoStop Live platform phase.

## Account and identity
- [x] Email/password registration and login
- [x] Unique nickname
- [x] Secure password hashing and persistent bearer session
- [x] +100 signup Wallet Coins
- [x] +100 first authenticated use of the day Wallet Coins
- [x] Coarse country + state/region only (no stored IP/city/GPS coordinates)
- [x] Main-menu account box with nickname, Wallet Coins, and Global rank

## Game modes
- [x] Practice Game remains local and does not affect Wallet/leaderboards
- [x] Ranked Solo requires an account and uses server-owned game authority
- [x] Ranked Online requires an account and uses server-owned game authority
- [x] Solo computer bankroll ladder starts at 100 Coins and increases by 100 after each bankruptcy
- [x] Computer bankruptcies recorded on account/session analytics

## Economy and leaderboards
- [x] One final point = one Wallet Coin transferred in ranked play
- [x] Wallet Coins may be negative
- [x] Leaderboard Total Coins is cumulative Coins won only
- [x] Score = Total Coins Won / Games Played
- [x] Global and current-month leaderboards
- [x] Provisional status until 10 ranked games in the applicable period
- [x] Global rank displayed beside player names in main menu and ranked games
- [x] Opponent nickname, rank, and Wallet displayed during ranked Online Play
- [x] Immediate idempotent per-game settlement plus immutable Coin ledger entries

## Online lobby
- [x] Search available online players by nickname
- [x] Recommend five closest online players using Score, Games Played, and Wallet Coins
- [x] Real-time challenge / accept / decline
- [x] Accepted challenges hand off through the existing proven room create/join flow
- [x] Existing room-code/share flow retained
- [ ] Transactional outbound email provider credentials are deployment configuration; UI/server integration is provider-gated

## Online session behavior
- [x] 15-second inactivity nudge
- [x] 15 seconds later, 30-second abandonment warning with pending penalty
- [x] Reconnect grace period and automatic browser WebSocket reconnect
- [x] Two one-minute pauses per player per game
- [x] Pause countdown and remaining-pause UI
- [x] Mutual immediate Quit request
- [x] Declined Quit schedules requester exit after current game
- [x] Explicit Solo Quit closes the session without force-quit punishment
- [x] Force quit/abandonment counts a loss/game and increments force-quit count
- [x] Online abandonment transfers the penalty to the opponent

## Analytics
- [x] Per-game records
- [x] Per-session summaries
- [x] Wallet win/loss aggregates
- [x] Opponent/session identity
- [x] Force quits
- [x] Computer bankruptcies
- [x] SHAKE, BOMB, POOPED, FIRST POOP, KISS, FLUSH, CLEAN SWEEP, CONQUER, THREE PPEOK
- [x] 5-BIRDIES, 3-STRIPES, and 5-BRIGHTS

## UI
- [x] Main menu: Practice Game / Solo Play / Online Play / Global Leaderboard / How to Play
- [x] Solo and Online grouped in gold Coin Games treatment
- [x] How to Play moved to the main menu
- [x] Global/Monthly leaderboard rotation every five seconds
- [x] Manual left/right/tap navigation and Return button
- [x] Main-menu attract mode after ten seconds, rotating leaderboards every five seconds

## Release validation
- [ ] GitHub regression workflow passes
- [ ] Deployment preview passes
- [ ] Merge to main
- [ ] Production deployment passes
- [ ] User device validation (S22/A17/browser) — must not be claimed until performed by user
