# Online Two-Player Engine Refactor Proposal

## Scope and constraints

This document proposes a migration for approval; it does not change gameplay or implement networking. The current solo game remains the source of truth throughout the migration. No sockets, rooms, backend, authentication, or online lobby UI belong in this work.

All implementation work must remain on `feature/online-2player`. Do not modify or merge into `main` until Solo vs AI parity has been verified; `main` remains the stable Vercel production branch.

The target architecture must support two authority adapters over one deterministic rules engine:

1. **Solo authority:** a local session owns complete state, performs the secure shuffle/deal, validates actions, and asks the existing AI policy for the computer's next action.
2. **Future online authority:** a server owns complete state and accepts player actions. Each client receives only its viewer-safe projection plus public events; it never receives the opponent hand's card identities or the undealt deck order.

## Current architecture map

The application is a dependency-free static page. `index.html` supplies fixed bottom-player and top-computer DOM regions plus dialogs. `styles.css` presents those regions and contains successive historical override layers. `app.js` is one strict-mode IIFE that currently combines all responsibilities below.

### Rules and authoritative state

- `defs`, `MASTER_DECK`, `freshState`, secure random helpers, deck validation, shuffle, and deal create the full game and currently name players `human` and `ai`.
- The mutable `state` contains `deck`, `floor`, `human`, `ai`, `floorStacks`, `turn`, and winner fields. Separate module globals hold round number, Nagari carry, prior scores, locks, pending choices, dialog resolvers, and animation staging.
- Floor helpers own both logical stacks and visual placement (`floorSlotByCard`, `floorSlotCount`, randomized stack angles). This mixes authoritative rules with presentation metadata.
- `score`/`scoreWithGukjinMode` calculate category and set scores. `calculateFinalScore`, `finishNagari`, `finishSpecial`, and `finishGame` mix settlement mutation with result-dialog rendering.
- `resolveCombinedTurn`, `resolveSingleCard`, `applySweepIfNeeded`, `stealPiAnimated`, `executeBombTurn`, `concludeTurn`, and opening-special processing encode rule transitions, but await DOM animations and sounds between mutations. The same-month branches implement Jjok, Ppeok/Ssa-da and Ttadak behavior even where those names are not used as function names.

### Human and AI coupling

- `humanPlay`, `humanUseBombBlank`, Shake/Bomb dialogs, floor-target selection, and Go/Stop buttons directly mutate `state.human` and then execute the turn pipeline.
- `aiTurn`, `bestAiCard`, `bestAiBombMonth`, `humanNeedValue`, and `aiShouldGo` combine policy, hidden authoritative information, delays, target preview, animation, and mutation of `state.ai`.
- Generic functions accept a `side`, but frequently branch on the literal values `human` and `ai` to select the opposing player, prompt only the human, schedule the AI, choose DOM anchors, and choose animation direction.
- Opening Chongtong and end-of-turn logic explicitly compare `state.human` and `state.ai`; previous-score tracking is also held in two side-specific globals.

### DOM and rendering coupling

- `render` reads full authoritative state directly. It permanently maps `human` to the face-up bottom hand and `ai` to top card backs, and directly binds bottom cards to `humanPlay`.
- Scores, multipliers, capture dialogs, source rectangles, capture destinations, Go callouts, and labels select `player*` versus `ai*` elements by actor type rather than by viewer-relative seat.
- `index.html` hard-codes “Computer” and “Computer Captured Cards” in the top region. The structural top/bottom regions themselves are reusable if their IDs and labels become seat-oriented.
- `styles.css` similarly uses semantic names such as `.cpu-*`, `.human-*`, `.player-*`, and `.ai-*`. The latest cascade already provides the desired visual top/bottom symmetry; initially only JavaScript mapping and dynamic labels need change. Broad CSS renaming is not required.

### Animation and audio coupling

- The physical choreography is sequenced inside rule execution. Staged DOM nodes temporarily represent cards before the matching state mutation is rendered.
- Animation helpers accept `side`, but use `human`/`ai` to determine source rack, target capture panel, curve direction, target preview, and Go callout position.
- `freeFloorLanding` reserves a slot by mutating the current game state, while capture animation later deletes slot reservations. This presentation lifecycle is therefore embedded in state mutation.
- Hit audio is correctly selected from whether a target exists when played/drawn cards land. That match-only condition must be carried explicitly in future engine events so redacted clients do not infer or recompute hidden logic.

## Minimum safe target design

Do not begin with a broad rewrite or many small modules. Introduce one deterministic engine, one privacy projection boundary, one solo authority/controller, and keep the established renderer/animation code mostly together until engine parity is proven.

### Player identity and seats

- Authoritative player IDs are stable opaque values (`playerA`, `playerB`), never screen positions and never `human`/`ai` roles.
- Presentation derives two seats for a viewer:
  - `localPlayerId = viewerId`
  - `opponentPlayerId = otherPlayerId(state, viewerId)`
  - `bottom = localPlayerId`
  - `top = opponentPlayerId`
- Solo mode uses the same mapping: the local player is `playerA` and the AI controls `playerB`. “Computer” is session metadata, not an engine identity.
- All animation events carry an authoritative `actorId`. The client maps `actorId` to `bottom` or `top` before choosing source/destination geometry. Thus Player B's browser mirrors Player A's browser without mirroring authoritative state.

### Deterministic command engine

The engine API should be synchronous and free of DOM, timers, Web Animations, audio, dialogs, `window`, and `document`:

```js
createGame({ playerIds, shuffledDeck }) -> state
getLegalActions(state, playerId) -> action[]
applyAction(state, action) -> { state, events, pendingDecision }
scoreCaptured(cards) -> score
calculateSettlement(state, winnerId) -> settlement
```

- Randomness is outside transitions. Solo authority securely shuffles and passes a validated deck to `createGame`; a future server does the same. AI tie-breaking receives an injected random source or deterministic seed in the policy layer, never inside rule transitions.
- Actions describe intent, for example `playCard`, `chooseFloorTarget`, `declareShake`, `declareBomb`, `useBombBlank`, `chooseGo`, and `chooseStop`. The engine validates actor, turn, ownership, legal target, and pending-decision phase before returning new state.
- Engine state is serializable plain data. Replace `Set` fields with arrays or explicit maps at the boundary. Move transient DOM locks, resolver functions, staged elements, and random card tilt/stack angles out of authoritative state.
- Transitions return ordered semantic events sufficient to replay existing choreography: card played, card drawn/revealed, card hit or landed unmatched, capture batch, Pi transfer, Ppeok stack formed/captured, Shake/Bomb/Chongtong/Go/Stop/Sweep events, score changed, turn changed, and hand ended. Events include public card identities only when those cards become public.
- Every event has an explicit audience: `public`, `player-private` with an intended player ID, or `authority-only`. Played cards, revealed deck cards, captures, score changes, and Go declarations are public; Shake eligibility and other private decisions are player-private; unrevealed deck data and hand identities are authority-only. Audience is authoritative metadata, not a UI display hint.
- State and submitted actions carry a monotonically increasing match `revision`. An accepted state transition increments it; actions name the revision they intend to change. This creates the contract needed for later stale-action rejection, idempotency keys, reconnect snapshots, and ordered event replay without implementing transport yet.
- Preserve stable floor positions as authoritative public data (`floorSlots` or a card-to-slot map), because both browsers must render identical floor occupancy. Visual tilt and stack angles should be deterministic from public card/stack IDs or client-only decoration; they must not consume rules randomness.

### Privacy projection

The authoritative state must never be serialized directly to an online client. A projection function runs inside the authority boundary and strips unauthorized state and event fields before returning data:

```js
projectStateForViewer(state, viewerId) -> {
  viewerId,
  players: {
    [viewerId]: { hand: Card[], handCount, captured, score, ...publicState },
    [opponentId]: { handCount, captured, score, ...publicState }
  },
  floor,
  floorSlots,
  deckCount,
  turn,
  winner,
  pendingDecisionForViewer
}
```

The opponent entry has no `hand` property containing cards—not masked card objects, IDs, months, types, filenames, or placeholders derived from the cards. The deck is represented only by `deckCount`. Private prompts such as Shake eligibility are sent only to the acting viewer. Event projection must apply the same rule: a play may reveal the played card, and a draw may reveal a card only at the public reveal step, but private hand/deck identities cannot leak through event payloads, logs, audit output, errors, DOM attributes, or animation queues.

Projection enforces event audience as well as state privacy: public events may be sent to both players, player-private events only to their named audience, and authority-only events to neither client. Unauthorized payload fields are removed at this boundary. Client UI code must never receive sensitive data and must not be treated as a security boundary.

For solo mode, use the same projection before rendering even though the local authority possesses full state. This makes privacy behavior continuously exercised rather than an online-only code path.

## Proposed file/module structure

The first approved implementation should keep the module count small:

```text
index.html
app.js                         # Browser bootstrap, viewer-relative renderer, dialogs,
                               # event-to-animation playback, and action submission
game-engine.js                 # Pure deck model, state creation, legal actions,
                               # deterministic transitions, rules, and scoring
game-view.js                   # Viewer-safe state/event projection and seat mapping
solo-session.js                # Local authority: secure shuffle, full state ownership,
                               # command validation/application, projected snapshots/events
ai-player.js                   # Existing AI heuristics expressed as legal action selection
styles.css                     # Existing appearance; only narrowly add seat-oriented aliases
audio-*.js                     # Unchanged
tests/
  game-engine.test.js          # Rule/scoring transition fixtures
  game-view.test.js            # Player A/B perspective and non-disclosure assertions
  solo-session.test.js         # Solo authority/AI integration and event ordering
```

Because the site currently opens directly from `file://`, preserve classic script loading during the refactor rather than requiring a development server or bundler. Each new file can expose a small frozen namespace on `globalThis` for the browser and conditionally export the same API for Node tests. If a build/tooling decision is approved later, this boundary can move to ES modules without changing engine semantics.

## How Solo AI uses the same engine

`SoloSession` is the sole local authority. It creates the authoritative `playerA`/`playerB` state, projects a viewer-safe snapshot for `playerA`, and accepts the same action objects a future transport would carry. After an accepted Player A action and completion of required choices, it asks `ai-player.js` to select from `getLegalActions(state, 'playerB')`, submits that action back through the same engine validation path, and emits projected state/events.

The AI policy may read full Player B hand and public table state because it runs inside the solo authority boundary. It should not mutate state, touch DOM, sleep, or animate. Human interaction and AI decisions therefore differ only in who chooses an action; the engine and renderer paths are shared.

## Viewer-relative rendering

The browser controller receives `{ snapshot, events }` plus its `viewerId`, then constructs a view model with `bottomPlayer` and `topPlayer`:

- Render `bottomPlayer.hand` face-up and actionable only when `snapshot.turn === viewerId` and the current decision permits an action.
- Render exactly `topPlayer.handCount` card backs. Do not expect or retain opponent card identities.
- Render both scores, multipliers, capture groups, names, and result labels through the seat map. The bottom label is always “You”; the top label comes from public session metadata (“Computer” in solo, opponent display name in online mode).
- Render floor cards, slots, deck count, and public rule state directly because these are common to both viewers.
- Convert every event's `actorId`/`ownerId` to a seat immediately before animation. Bottom actors use the current bottom-hand source and bottom capture target; top actors use card backs/approximate top source and top capture target.
- Only the acting viewer sees choice controls for matching targets, Shake/Bomb, or Go/Stop. Both viewers receive public declaration/result events and play the corresponding animation/audio after the authority accepts the action.

Initially retain existing DOM nodes and CSS layout, but treat their current IDs as seat anchors behind an element map. A later cleanup may rename `playerHand`/`aiHand` and `.cpu-*` classes to `bottomHand`/`topHand` after behavior is stable; renaming them during engine extraction would add avoidable regression risk.

## Migration sequence

Each step must leave Solo vs AI playable and should be committed/tested independently.

1. **Characterize current behavior.** Add deterministic fixtures around deck integrity, scoring/Gukjin, settlement multipliers, matching, initial stacks, Jjok/Ppeok/Ttadak branches, Ppeok capture stealing, Sweep, Bomb blanks, Chongtong, Go/Stop score-increase gating, and Nagari. Record expected ordered animation semantics without changing runtime behavior.
2. **Introduce neutral IDs at boundaries.** Add `playerA`/`playerB` constants and `otherPlayerId`; adapt existing state access through a temporary mapping while preserving current `human`/`ai` storage internally. Add a seat map so animation and rendering helpers stop branching directly on role names.
3. **Extract pure scoring and deck definitions.** Move card definitions, deck validation, matching/count helpers, scoring, and settlement calculations into `game-engine.js` with parity tests. Keep secure shuffle in `solo-session.js`, outside deterministic transitions.
4. **Separate authoritative and presentation state.** Move floor tilt/stack angles, staged cards, locks, dialog resolvers, and pending DOM selections to the browser controller. Keep stable floor slot occupancy in engine state and test that captures never compact remaining slots.
5. **Extract one action at a time.** Port normal play/draw/capture first, then target choices and each special rule. For each transition, compare old outcomes to fixtures before replacing the old branch. Do not rewrite all rules at once.
6. **Add ordered engine events.** Change the browser pipeline to animate accepted events and render projected snapshots rather than mutating state between awaits. Preserve physical timing, capture slides, match-only “딱!” sound, and reduced-motion behavior.
7. **Add viewer-safe projection.** Route Solo rendering through `projectStateForViewer`; assert recursively that the opponent has only a hand count and that deck order/private prompts never appear. Run the same rendering tests with viewer `playerA` and viewer `playerB` to prove bottom/top inversion.
8. **Move AI behind SoloSession.** Convert existing heuristics into a pure legal-action chooser. Remove AI-specific mutation and DOM access from the controller while retaining current pacing and target-preview presentation as optional client effects.
9. **Rename UI semantics only if useful.** Once parity is established, optionally migrate hard-coded “Computer” text and role-oriented IDs/classes to dynamic metadata and seat-oriented aliases. Avoid broad CSS cleanup.
10. **Approve a transport contract separately.** Only after engine, projection, and Solo parity are complete should a later task define server persistence, action sequencing/idempotency, reconnect snapshots, rooms, authentication, or sockets.

All ten stages remain isolated to `feature/online-2player`. A merge to the stable Vercel production branch requires explicit Solo vs AI parity verification and approval.

## Primary regression risks and mitigations

- **Rule-order changes:** current rules interleave mutation and awaited animation. Extracting them may accidentally change whether the played card is considered on the floor when resolving the deck draw. Preserve explicit ordered phases and fixture every same-month branch.
- **Special-rule loss:** several named Korean outcomes share generalized code rather than named functions. Treat existing combined-turn behavior as the oracle and migrate branch-by-branch.
- **Floor movement:** removing slot mutations from animation code can compact cards or reuse a slot too early. Keep stable slot occupancy authoritative and use a separate client reservation for not-yet-applied animation events.
- **Hidden-information leaks:** a full-state client store, masked card objects, shuffle audits, event queues, error messages, or AI code shipped with authoritative state could expose hands/deck. Projection must occur before transport and should have structural non-disclosure tests.
- **Animation desynchronization:** online snapshots can arrive while animation is running. The future controller needs a serialized event queue, sequence numbers, cancellation/reconciliation on a newer snapshot, and idempotent rendering; no transport implementation is needed now.
- **Choice races and duplicate actions:** current `locked` and resolver globals are local protections only. The engine must validate phase/actor/action, while a future authority assigns monotonically increasing revisions and rejects stale actions.
- **Sound regression:** clients must use the authoritative public `cardHit`/matched event, not guess from a possibly redacted snapshot. Unmatched landings remain silent.
- **Perspective errors:** result names, Go callouts, capture destinations, Pi transfer direction, source geometry, and dialogs currently branch on `human`/`ai`. Centralize seat mapping and test every event from both viewer identities.
- **Randomness drift:** stack angles and AI tie-breaking currently consume `Math.random`. Keep presentation randomness and policy randomness outside the deterministic rules engine; secure shuffle remains authority-owned.
- **Static-launch regression:** converting immediately to browser ES modules can break the documented open-`index.html` workflow due to `file://` restrictions. Preserve classic scripts until tooling is deliberately changed.

## Approval boundary

Approval of this proposal would authorize only the staged extraction above. It would not authorize networking, gameplay/rule changes, UI redesign, terminology changes, backend work, or exposing any opponent hand identities to a client.
## READY FOR ONLINE AUTHORITY

- [x] no production in-hand mutation in `app.js`
- [x] all reachable classifications engine-resolved
- [x] state JSON-safe
- [x] events JSON-safe
- [x] viewer projection redacts hidden data
- [x] Player A/B parity
- [x] terminal states authoritative
- [x] Solo behavior parity
- [x] secure random shuffle remains outside transitions
- [x] tests green
