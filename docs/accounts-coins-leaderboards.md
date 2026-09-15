# Accounts, Coins, Ranked Play, and Leaderboards

This document is the product/server contract for the ranked GoStop Live system.

## Terms

- **Wallet Coins**: the player's current spendable balance. Signup/daily rewards and ranked-game wins/losses change this balance. It may be negative.
- **Total Coins** on a leaderboard: cumulative Coins **won** in ranked games in that leaderboard period. Losses do not subtract from this number. Signup/daily/promotional grants never count.
- **Games Played**: completed ranked games plus ranked games lost by abandonment/force quit.
- **Score**: `Total Coins Won / Games Played`.
- **Provisional**: fewer than 10 ranked games in the applicable leaderboard period. Provisional players are visible but marked provisional.

## Leaderboards

Two views use identical columns: Rank, Nickname, Score, Total Coins, Games Played.

- **Global Leaderboard**: all ranked games to date.
- **Monthly Leaderboard**: ranked games recorded in the current UTC calendar month.

Ranking order is Score descending, Games Played descending, Total Coins descending, then Nickname for deterministic display. A future revision may use earliest achievement timestamp as the final tie-break.

## Account rewards

- Registration award: +100 Wallet Coins once.
- First authenticated use each UTC day: +100 Wallet Coins once.
- Registration automatically creates a persistent authenticated session, therefore a brand-new account receives both awards on its first day (+200 total Wallet Coins).
- Rewards never affect leaderboard Total Coins or Score.

Passwords are salted and hashed on the server using PBKDF2-SHA-256. Authentication uses random bearer tokens; the password is not stored on the device. The current server data model includes `emailVerified`; outbound email verification will be enabled when an email delivery provider is connected.

## Main menu

1. Practice Game — local computer game, no account/Coins/ranking.
2. Solo Play — ranked computer game; account required; gold treatment.
3. Online Play — ranked friend game; account required; gold treatment.
4. Global Leaderboard — Global/Monthly rotating views.
5. How to Play — moved from in-game header to main menu.

The top-right account box shows Nickname and Wallet Coins when authenticated. When anonymous it shows Create ID plus an explanation that an ID enables friend games and leaderboard competition.

## Ranked game settlement

- One game point equals one Coin.
- Online: winner receives the winner's final point total from the loser; the same amount is removed from the loser's Wallet. This is zero-sum between the two users.
- Solo: the computer has a session bank. Computer #1 starts with 100 Coins. When bankrupted, the next computer begins with 200 Coins, then 300, etc. The number of computer players bankrupted is recorded in the session/account analytics.
- Wallet balances may be negative.
- Each completed ranked game is committed immediately and idempotently to the server. Session summaries are additional records; they are not the only persistence point.

## Sessions and game analytics

A session begins when ranked Solo/Online begins. Selecting New Game closes the current session and starts a new one. Quit Game closes the session after the agreed/allowed exit behavior.

Each game stores at least: mode, players/opponent, winner/loser, points, wallet deltas, leaderboard Coins won, timestamps, force-quit/abandonment state, and milestone counts/events.

Milestones include every special event currently supported and future additions, including Shake, Bomb, POOPED, FIRST POOP, KISS, FLUSH, CLEAN SWEEP, CONQUER, 5-BIRDIES, 3-STRIPES, and 5-BRIGHTS.

Session summaries include games played, opponent, total Coins won/lost/net, computer bankruptcies for Solo, force quits, and milestone totals.

## Online presence, abandonment, and pause

- If a player has not acted for 15 seconds, send a dialog/sound/vibration nudge.
- If still inactive 15 seconds after the nudge, show a 30-second abandonment warning including the pending Coin penalty.
- If the warning expires without an action/reconnect/pause, end the game as abandonment, apply the force-quit penalty, and increment force-quit count.
- Network disconnects receive a reconnect grace period rather than immediate punishment.
- Each player gets two 1-minute pause requests per game. During a pause both players see a Pause dialog, a 60-second countdown, and the requesting player's remaining pauses.
- Pause, nudge, disconnect, warning, reconnect, quit request, and quit disposition are communicated to the opponent in real time.

## Online quitting

- A mid-session Quit request is sent to the opponent.
- If both players agree, the session ends immediately without abandonment penalty.
- If the opponent declines, quitting is scheduled for the end of the current game.
- Deliberately leaving before the allowed exit point is treated as abandonment and penalized.

## Invite paths

Target Online Play entry paths:

1. Invite by email with signed expiring link.
2. Shareable invite link.
3. Room code.

An authenticated invite recipient joins directly. A new recipient registers, receives signup/daily awards, and is returned to the pending invite after authentication. Email delivery requires a provider integration; signed invite tokens and server-side room binding should be implemented independently of the provider.

## Leaderboard display / attract mode

Normal leaderboard view rotates Global → Monthly every 5 seconds. Left/right arrows switch manually; tapping/clicking the page advances; Return exits to the main menu.

After 10 seconds of main-menu inactivity, attract mode begins and rotates Global/Monthly every 5 seconds. Any interaction exits attract mode back to the main menu. Layout reserves space for future ads without making ads part of ranking logic.

## Trust boundary

Practice may remain client-local. Any mode that changes Wallet Coins, leaderboard stats, force-quit counts, or session/game records must be server-authoritative. The browser/Android client submits player intent; the server decides game state and settlement. Wallet and leaderboard mutations are never accepted directly from an untrusted client.
