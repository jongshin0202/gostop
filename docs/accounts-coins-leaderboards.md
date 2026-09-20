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

Each authenticated account may own only **one active ranked Coin game** at a time across all devices. The authoritative account record stores the active session ID, mode, room code, and start time. A second device may reclaim the same account seat in that same room and continue the exact authoritative game state. The other ranked Coin mode is disabled while that session is active. Practice is device-local/non-ranked and may run independently on another device. Only one device controls the ranked seat at a time; connecting the same account from a second device deliberately hands the live socket to the new device instead of allowing competing input streams. If a Worker/runtime restart leaves an account pointing at a room with no live controlling socket and no normal reconnect deadline, the server gives that room a short recovery window and then clears the orphaned Coin-game lock without an abandonment penalty; the main menu rechecks automatically.

Each game stores at least: Game ID, Session ID, mode, players/opponent (including Solo computer identity), winner/loser, final settlement points, score formula/reasons, wallet deltas, leaderboard Coins won, timestamps, force-quit/abandonment state, and milestone counts/events.

The Admin Sessions view is a derived audit/reporting hierarchy over these authoritative records: **Session → Player → Game → Full Game History**. Session summaries show player names, start/end, games played, wins and Coins won by player. Player drill-downs show wins/losses, Coins won/lost/net, points, and milestone counts including 5-Brights, 5-Birdies, 3-Stripes, Shake, 3-Go, Ttadak/FLUSH, Clean Sweep, KISS, Pooped/First Poop, Bomb, Conquer, and Three-Ppeok. Game rows expose the same metrics for both participants and link to the full stored settlement/events/state for auditability.

Milestones include every special event currently supported and future additions, including Shake, Bomb, POOPED, FIRST POOP, KISS, FLUSH, CLEAN SWEEP, CONQUER, 5-BIRDIES, 3-STRIPES, and 5-BRIGHTS.

Session summaries include games played, opponent, total Coins won/lost/net, computer bankruptcies for Solo, force quits, and milestone totals.

## Online presence, disconnect recovery, abandonment, and pause

- Unexpected network/browser/device disconnects get a **60-second reconnect window**.
- During that minute the game is frozen for both players. The connected opponent sees a technical-issue dialog with a live countdown and a **Quit Game** button.
- If the opponent presses **Quit Game** during the reconnect window, the game is cancelled immediately. Neither player gains or loses Coins and no disconnect allowance is consumed.
- If the disconnected player returns within 60 seconds, the saved ranked-room credential automatically rejoins the active room on that device and the player is returned directly to the game. Play resumes from the authoritative state with no Coin change or disconnect allowance used.
- If the disconnected player does not return in time, the server resolves the deadline authoritatively; the connected client also requests a sync at 0:00 so the reconnect dialog cannot remain stuck indefinitely. The session then reaches the normal **Session Ended** / **OK** flow:
  - If the disconnected player is tied or ahead on current GoStop score, the game is **nagari**. No Coins change hands.
  - If the connected opponent is ahead, the server settles from the **current game state only**. The opponent's current score is evaluated with multipliers and bak conditions already active at the time of disconnect, including Go, Shake, Nagari carry, Meong-bak, Pi-bak, Gwang-bak, and Go-bak. No future cards or hypothetical future captures are simulated.
  - The connected opponent receives that settled Point total as Coins.
- Each account receives **one protected forced disconnect per UTC calendar month**. On that first timed-out disconnect, the opponent still receives the current-state settlement if ahead, but the disconnected player's Wallet is not charged. The allowance is consumed even when the timed-out hand becomes nagari, and resets with the next UTC month.
- On the second and later timed-out disconnects in the same month, if the opponent was ahead, the same Coin amount awarded to the opponent is deducted from the disconnected player's Wallet and the interrupted game counts against the disconnected player's ranked record.
- After a protected first disconnect in which the opponent was ahead, the disconnected player receives a friendly informational notice the next time they enter Solo Play or Online Play. It is not shown as a main-menu interruption.
- New accounts must acknowledge this disconnect-protection rule before registration completes.
- Connected-player inactivity timing is server-configurable in three phases: after **3 minutes** of inactivity (`INACTIVITY_NUDGE_SECONDS=180`), show the first Your Turn / Waiting for Opponent dialog; keep that nudge phase active for **1 minute** (`INACTIVITY_NUDGE_PHASE_SECONDS=60`); then start a **30-second** abandonment warning countdown (`ABANDONMENT_COUNTDOWN_SECONDS=30`). If the countdown reaches zero without a valid play/reconnect/pause, apply the abandonment settlement. Dismissing either dialog keeps that dialog closed for its current phase while the authoritative server timing continues.
- Each player gets two pause requests per game. A pause lasts **3 minutes** by default and is server-configurable with `PAUSE_DURATION_SECONDS=180`.
- During the 3-minute pause countdown, both players see the same countdown. The player who requested the pause sees **Cancel**, which resumes the game immediately and starts fresh inactivity timing for the player whose turn it is. The opponent sees **Quit Game**.
- If the opponent selects Quit Game **before the pause expires**, a Yes/No confirmation is required. **No** returns to the live Pause countdown. **Yes** ends both the current game and session as a **draw**: no winner, no points, no Coin transfer, and no abandonment record.
- When the 3-minute pause reaches zero, the game does **not** enter abandonment. The pause becomes an indefinite expired-pause decision. The paused player sees **Waiting On You**, the message **Opponent can end the session with a win for the current game**, and **Cancel**. The opponent sees **Waiting for Opponent**, the message **You can end the session with a win for the current game**, and **Quit Game**.
- The paused player may still press **Cancel** until the opponent claims the win; Cancel immediately resumes the game with fresh inactivity timing.
- If the opponent selects **Quit Game after the pause expires**, the opponent wins the current game and the session ends. If the opponent has already declared Go, settlement uses the opponent's current score and all applicable multipliers. Otherwise the forced win starts from **7 points** in a two-player game and applies the opponent's normal multipliers. If the paused player has declared Go, **Go-bak ×2** applies. The final point total is transferred 1:1 in Coins from the paused player to the winner.
- Pause, expired-pause state, nudge, disconnect, warning, reconnect, quit request, and quit disposition are communicated to the opponent in real time.

## Online quitting

- A mid-session Quit request is sent to the opponent.
- If both players agree, the session ends immediately without abandonment penalty.
- If the opponent declines, quitting is scheduled for the end of the current game.
- Deliberately leaving before the allowed exit point is treated as abandonment and penalized.

## Online Play entry paths

Competitive Online Play has exactly three visible sections:

1. **Matchmaking Lobby** — Auto Match requests the closest available skill match. Browse Top 10 shows the ten closest available players and the total number of other signed-in players currently online, including players who are online but unavailable.
2. **Search Player** — Nickname search covers the registered-player directory, so a player can be found whether available, busy in another two-player game, or offline.
3. **Share Link** — Create Room creates an authenticated Competitive room and displays its direct URL with Copy URL. Competitive Online Play does not expose the legacy Room Code / Join Game controls. Direct room URLs still contain the internal room identifier and continue to join the exact authoritative room.

Browse and Search use the same player profile card. It displays current Coins, overall Wins / Losses, leaderboard Score, **Global Rank**, **Monthly Rank**, the viewer's historical **Wins / Losses** against that player, Coins won/lost against that player, and the last-played date. Presence has four user-facing states: **Online - Available** (green), **Online - Away** (orange), **Online - Not Available** (orange), and **Not Online** (red).

**Online - Available** requires at least one authenticated GoStop Live browser tab for the account to be in the foreground and to have received real user input within the previous **5 minutes**. A background/hidden tab or five minutes without user activity becomes **Online - Away** even though the login session remains valid. Returning to the tab and interacting with it makes the player Available again. An active two-player game is **Online - Not Available** regardless of other tabs. Closing/disconnecting the remaining lobby tabs makes the account **Not Online**.

Play-request notifications are opt-in. On browsers that grant notification permission, the app registers a service worker and can display an operating-system notification when an incoming play request reaches a still-running background tab. An Away player receives a Play button only while that notification-capable tab is still sending a fresh presence heartbeat; if the browser suspends the page, the heartbeat expires and the Away player is no longer challengeable. This intentionally avoids advertising a forgotten/suspended tab as reachable. Fully reliable alerts after the browser has suspended or terminated the page require a later Web Push subscription/VAPID implementation.

Matchup history is derived from authoritative stored Online game and abandonment records. Protected monthly disconnects can waive the disconnected player's Coin deduction, but a non-nagari settled disconnect is still a ranked loss for the quitter and a win for the opponent. A one-time server repair reconciles previously stored outcome history so older protected disconnect losses omitted by the prior counter logic are restored where authoritative game records exist.

Online-lobby presence is ephemeral. Browse recommendations include only challengeable accounts; Search can show any registered account. A matchmaking request and accepted-room handoff are bound to the exact requesting and accepting browser tabs so additional tabs signed into either account cannot join the same Coin seat or cause a false device takeover. Email addresses are never exposed in the public lobby or player profiles.

## Leaderboard display / attract mode

Normal leaderboard view rotates Global → Monthly every 5 seconds. Left/right arrows switch manually; tapping/clicking the page advances; Return exits to the main menu.

After 10 seconds of main-menu inactivity, attract mode shows Global for 5 seconds, Monthly for 5 seconds, then returns to the main menu for 10 seconds and repeats. Any interaction exits attract mode back to the main menu. Layout reserves space for future ads without making ads part of ranking logic.

## Trust boundary

Practice may remain client-local. Any mode that changes Wallet Coins, leaderboard stats, force-quit counts, or session/game records must be server-authoritative. The browser/Android client submits player intent; the server decides game state and settlement. Wallet and leaderboard mutations are never accepted directly from an untrusted client.
