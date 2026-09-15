# Phase 1 Implementation Notes

Ranked Solo and Online both use the server-owned session authority. The browser submits intent and presents authoritative snapshots; it does not calculate Wallet or leaderboard mutations.

Practice Game continues to use the existing local Solo path and never writes ranked economy/statistics.

AccountStore is the serialized global authority for account balances, leaderboard aggregates, game/session records, and the Coin ledger. Game settlement uses stable game IDs to prevent duplicate credits on retries.

Online presence/recommendations are ephemeral in the Lobby Durable Object. Emails are never exposed in lobby profiles.

Force-quit penalty currently uses `20 + max(7, 2 × opponent current score)` Coins, with a minimum penalty of 27. The formula is server-owned and can be tuned later without changing leaderboard semantics.
