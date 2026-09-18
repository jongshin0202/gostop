# Ranked Identity and Leaderboard UI Contract

- Main-menu account box: `Nickname`, current Wallet Coins, and current Global leaderboard rank. Provisional users show `Provisional #N`.
- Ranked game local label: `You (Nickname) · Rank #N` (or provisional/unranked equivalent) plus current Wallet Coins.
- Ranked Online opponent label: opponent nickname + Global rank plus current opponent Wallet Coins.
- Ranked Solo opponent label: current computer number and current computer bankroll.
- Global and Monthly leaderboard columns: Rank, Nickname, Score, Total Coins, Games Played.
- Leaderboard `Total Coins` means Coins won in ranked games only; Wallet balance is never substituted for it.
- Score is Total Coins Won divided by Games Played.
- Global and Monthly leaderboards are public: viewing them never requires authentication. Manual Return always goes to the main menu.
- A valid saved browser session restores automatically on page load.
- Main-menu attract mode cycle is Main Menu 10 seconds → Global 5 seconds → Monthly 5 seconds → Main Menu, repeating until user interaction. Any interaction returns control to the main menu.
