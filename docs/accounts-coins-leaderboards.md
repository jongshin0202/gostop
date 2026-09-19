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
- First authenticated use each player-local calendar day: +100 Wallet Coins once. The server determines the day from trusted edge timezone context.
- Registration automatically creates a persistent authenticated session, therefore a brand-new account receives both awards on its first day (+200 total Wallet Coins).
- Rewards never affect leaderboard Total Coins or Score.
- Daily Coins are committed server-side before the notice is acknowledged. Every signed-in device displays the authoritative Wallet immediately; the notice explains the award but never hides or re-applies it.

Passwords are salted and hashed on the server using PBKDF2-SHA-256. Authentication uses random bearer tokens; the password is not stored on the device. A valid saved browser session is restored automatically when GoStop Live opens; only an invalid or expired session requires login again. The current server data model includes `emailVerified`; outbound email verification will be enabled when an email delivery provider is connected.

## Main menu

1. Practice Game — local computer game, no account/Coins/ranking.
2. Solo Play — ranked computer game; account required; gold treatment.
3. Online Play — ranked friend game; account required; gold treatment.
4. Global Leaderboard — public; no account is required to view it; Global/Monthly rotating views.
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

Each game stores at least: Game ID, Session ID, mode, players/opponent (including Solo computer identity), winner/loser, final settlement points, score formula/reasons, wallet deltas, leaderboard Coins won, timestamps, force-quit/abandonment state, and milestone counts/events.

Milestones include every special event currently supported and future additions, including Shake, Bomb, POOPED, FIRST POOP, KISS, FLUSH, CLEAN SWEEP, CONQUER, 5-BIRDIES, 3-STRIPES, and 5-BRIGHTS.

Session summaries include games played, opponent, total Coins won/lost/net, computer bankruptcies for Solo, force quits, and milestone totals.

## Online presence, disconnect recovery, abandonment, and pause

- Unexpected network/browser/device disconnects get a **60-second reconnect window**.
- During that minute the game is frozen for both players. The connected opponent sees a technical-issue dialog with a live countdown and a **Quit Game** button.
- If the opponent presses **Quit Game** during the reconnect window, the game is cancelled immediately. Neither player gains or loses Coins and no disconnect allowance is consumed.
- If the disconnected player returns within 60 seconds, the saved ranked-room credential automatically rejoins the active room on that device and the player is returned directly to the game. Play resumes from the authoritative state with no Coin change or disconnect allowance used.
- If the disconnected player does not return in time:
  - If the disconnected player is tied or ahead on current GoStop score, the game is **nagari**. No Coins change hands.
  - If the connected opponent is ahead, the server settles from the **current game state only**. The opponent's current score is evaluated with multipliers and bak conditions already active at the time of disconnect, including Go, Shake, Nagari carry, Meong-bak, Pi-bak, Gwang-bak, and Go-bak. No future cards or hypothetical future captures are simulated.
  - The connected opponent receives that settled Point total as Coins.
- Each account receives **one protected forced disconnect per UTC calendar month**. On that first timed-out disconnect, the opponent still receives the current-state settlement if ahead, but the disconnected player's Wallet is not charged. The allowance is consumed even when the timed-out hand becomes nagari, and resets with the next UTC month.
- On the second and later timed-out disconnects in the same month, if the opponent was ahead, the same Coin amount awarded to the opponent is deducted from the disconnected player's Wallet and the interrupted game counts against the disconnected player's ranked record.
- After a protected first disconnect in which the opponent was ahead, the disconnected player receives a friendly informational notice the next time they enter Solo Play or Online Play. It is not shown as a main-menu interruption.
- New accounts must acknowledge this disconnect-protection rule before registration completes.
- If a player has not acted for 15 seconds while still connected, send a dialog/sound/vibration nudge.
- If still inactive 15 seconds after the nudge, show the existing 30-second inactivity warning. Inactivity is distinct from the 60-second technical-disconnect recovery window.
- Each player gets two 1-minute pause requests per game. During a pause both players see a Pause dialog, a 60-second countdown, and the requesting player's remaining pauses.
- Pause, nudge, disconnect, warning, reconnect, quit request, and quit disposition are communicated to the opponent in real time.

## Online quitting

- A mid-session Quit request is sent to the opponent.
- If both players agree, the session ends immediately without abandonment penalty.
- If the opponent declines, quitting is scheduled for the end of the current game.
- Deliberately leaving before the allowed exit point is treated as abandonment and penalized.

## Online Play entry paths

1. **Invite by email** — enter the opponent's email and send a signed, expiring game link. An authenticated recipient enters the game flow directly; a new recipient completes account creation first, receives signup/daily awards, then returns to the invitation.
2. **Find an online player** — search by Nickname or choose from five recommended players who are online and available now. Each recommendation displays Nickname, Score, Games Played, and current Wallet Coins. Recommendations are ordered by closest normalized similarity using Score, Games Played, and Wallet Coins with equal weighting. Clicking a player sends a real-time play request. The recipient receives an accept/decline dialog; acceptance creates the authoritative ranked room for both players. Requests expire after 60 seconds and are rate-limited to reduce spam.
3. **Room code / share link** — retain the existing direct room-entry path for players who already have a code/link.

Online-lobby presence is ephemeral: a user is recommended only while actively connected to the authenticated lobby and marked available. Starting a game marks both participants unavailable so they cannot be recommended/challenged again until they return to the lobby. Email addresses are never exposed in the public lobby or recommendations.

## Leaderboard display / attract mode

Normal leaderboard view rotates Global → Monthly every 5 seconds. Left/right arrows switch manually; tapping/clicking the page advances; Return exits to the main menu.

After 10 seconds of main-menu inactivity, attract mode shows Global for 5 seconds, Monthly for 5 seconds, then returns to the main menu for 10 seconds and repeats. Any interaction exits attract mode back to the main menu. Layout reserves space for future ads without making ads part of ranking logic.

## Trust boundary

Practice may remain client-local. Any mode that changes Wallet Coins, leaderboard stats, force-quit counts, or session/game records must be server-authoritative. The browser/Android client submits player intent; the server decides game state and settlement. Wallet and leaderboard mutations are never accepted directly from an untrusted client.
