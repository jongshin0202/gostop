# GoStop Live! Admin Dashboard

## Purpose

The admin dashboard is an unlinked, administrator-only control plane for GoStop Live!. The public game does not link to it. The dashboard UI is served at `/admin.html`, while every admin data/control API is protected by the Cloudflare Worker.

## Required secret

Set a strong Cloudflare Worker secret before using the dashboard:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Never commit the token. The browser admin UI keeps the entered token in `sessionStorage` only, so closing the browser session clears it.

Admin API requests are accepted only from:
- `https://gostoplive.com`
- `https://www.gostoplive.com`
- `https://admin.gostoplive.com`
- localhost / 127.0.0.1 for development
- origins explicitly listed in `ADMIN_ORIGINS`

Normal Vercel preview domains are intentionally not accepted for admin APIs by default.

## Data captured

### Players
The authoritative AccountStore retains:
- account ID, email, nickname and account status
- Wallet Coins
- global/monthly stats
- disconnect/forced-abandon counts and monthly protection usage
- daily-login award date, timestamp and timezone
- last known coarse location
- connection history

### Connection / IP history
For authenticated account activity, trusted Cloudflare request metadata is retained when available:
- raw IP address
- city
- state/province/region name and code
- country code
- postal code
- timezone
- event type and timestamp

Raw IP addresses are not returned through normal player-facing APIs. They are available only through protected admin APIs.

### Games
All authoritative ranked settlements remain stored under the AccountStore. New games recorded after this dashboard ships also persist an admin-only authoritative history snapshot containing:
- room code / match ID / game sequence
- seat/player mapping
- per-action authoritative records
- engine events for the hand
- final trusted game state
- settlement data and formula
- participant Wallet results
- settlement-time connection/location snapshot

Games recorded before the authoritative-history addition remain visible but are labeled as legacy and may contain only settlement-level information.

### Forcefully abandoned games
Forced disconnect / abandonment records retain:
- quitter/opponent
- mode
- score at disconnect and frozen settlement value
- settlement type and active formula/reasons
- monthly protection state
- Coins deducted/rewarded
- disconnect reason
- player connection/location snapshots
- authoritative hand history when available

## Dashboard areas

- Overview
- All Players
- All Games
- Forcefully Abandoned Games
- Player Rankings
- Global / Monthly Leaderboards
- Ranked Sessions
- Geography / IP
- Fraud / Abuse Signals
- System Health
- Immutable Admin Audit Log

Global date filtering supports custom ranges plus Today, This Month, This Year and All Time.

Ranking metrics include games, wins, win rate, points, Coins won/lost, net Coins, forced abandons and abandon rate. Rankings can also be filtered by game mode and current country/state/city.

## Admin controls

Mutating operations require an explicit reason and create an immutable audit entry containing the administrator connection metadata, target, before/after state or correction details, timestamp and reason.

Supported controls:
- Wallet Coin adjustment
- nickname/email correction
- suspend / unsuspend account
- monthly disconnect-protection reset
- reset one player's Global leaderboard stats
- reset one player's selected Monthly leaderboard stats
- reset Global leaderboard stats
- reset a selected monthly leaderboard
- rebuild Global or selected monthly leaderboard from authoritative game records
- correct supported game settlement fields and participant results
- apply audited Wallet corrections associated with a game

Leaderboard reset archives the affected pre-reset stats and never deletes game history.

## Fraud / abuse analytics

The dashboard surfaces diagnostic signals only. It does not automatically punish players.

Initial signals:
- forced-abandon count/rate
- Coins lost through forced abandonment
- accounts sharing an IP address
- connection/geography drill-down

Shared IPs can be legitimate because of NAT, mobile carriers, households, VPNs and public networks.

## Scaling note

The first admin version scans the global AccountStore for flexible investigation and reporting. This is appropriate for the current product stage. If player/game volume grows substantially, add secondary indexes or a dedicated analytics store without changing the authoritative game/account records.
