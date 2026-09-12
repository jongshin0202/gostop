# Authoritative match/session layer

`session-authority.js` is the server-ready owner of a Go-Stop match. It wraps
the DOM-free `GoStopEngine`; it does not contain animation, audio, networking,
timers, or browser controls.

## API

- `createSessionAuthority({ crypto, now, trustedRuntime })` creates an isolated
  authority store. Production callers must provide Web Crypto (or run where
  `globalThis.crypto` supplies it).
- `createMatch({ matchId, playerIds, gameMode, startingPlayerId })` creates one
  two-seat match, securely shuffles and deals it, applies the floor-four retry,
  and leaves initial opening resolution to the first submitted
  `resolveOpening` action so it is revisioned and its events are replayable.
- `submitAction({ matchId, playerId, actionId, expectedRevision, action })`
  validates membership, revision, turn/decision ownership, and engine legality.
- `getSnapshot({ matchId, viewerId })` returns a viewer projection, never the
  draw order, opposing hand identities, or another player's decision.
- `getEventsSince({ matchId, viewerId, revision })` returns visible semantic
  events after the supplied revision in `(revision, eventIndex)` order.
- `createNewHand({ matchId, startingPlayerId })` preserves the match and Nagari
  carry while constructing a new secure hand.

The optional `readTrustedState()` capability is disabled unless the authority
is explicitly created with `trustedRuntime: true`. It exists for the process
hosting the authority—not for a player or future network transport. Milestone
1's local Solo host uses it to drive its existing presentation choreography.

## Revision and idempotency contract

Revision starts at zero. Every accepted submitted action increments it exactly
once, including valid actions that emit no semantic event. Rejections never
increment it. A successful `actionId` is scoped to a player and cached. An exact
retry returns the original response and cannot mutate the match again; reuse of
that ID with different action data fails with `ACTION_ID_CONFLICT`. Revision is
checked before dispatch for a new action ID, so stale submissions fail with
`STALE_REVISION`.

Events emitted by one action all carry its new revision and a zero-based
`eventIndex`. Public events are visible to both seats. `player-private` events
are returned only to their addressed seat, and transport projections remove the
internal audience marker. Animation state is never recorded.

## Results and future seats

Once the engine produces a terminal result, snapshots expose an authority-built
record containing `matchId`, `gameMode`, participant IDs, winner, final engine
result/settlement, `status: "completed"`, and the authority clock's completion
time. No client action accepts a claimed score or winner.

Milestone 1 enforces two participants because current Matgo rules are two-seat.
The session model nevertheless stores ordered player collections plus explicit
player-to-seat maps rather than treating account IDs as `human`/`ai`. A later
rules milestone can add seats without changing match identity, idempotency,
revision, snapshot, event, or terminal-result contracts.
