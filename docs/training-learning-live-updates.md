# Training learning: automatic live model update contract

The Training learning service operates independently of the frozen GoStop rules, game engine,
and player economy. Only confirmed feedback ("My move was better" or "Recommendation was
better") updates the shadow learner after a completed Training game. "Not sure" is recorded
without training. A disagreement means a valid played move differs from the recommended move,
regardless of which feedback choice the player selects.

## Update eligibility

Evaluate after each **completed** Training game, never after a partial/abandoned session:

1. Every **20 completed games** since the last successful live model update, OR
2. At least one disagreement occurred before the most recent **10 consecutive completed
   games with no recommendation disagreement** (the last disagreement was game 11 or earlier).

The counters are per expert training stream, durable on the Cloudflare server, and idempotent
per game ID. The 10-game condition is not met by ten clean games without any prior
disagreement. A new disagreement resets the clean streak. The 20-game counter resets
only after a successfully acknowledged live update, not after preparing a candidate.

## Required promotion sequence

* Train the candidate **server-side** and retain all original game-rule invariants.
* Require changed, valid numeric weights, a versioned snapshot, evaluation against
  a holdout set, and explicit fail-closed regression gates. Archive prior weights
  so rollback is possible.
* Publish **only model weights/metadata**, never source code or game-state data,
  through a separately authenticated production-model channel. A candidate on
  the development Cloudflare Worker is NOT a live update.
* Confirm that the production model endpoint both persisted **and activated** the
  new version before returning `publishedToLive: true`. A timeout, rejection,
  validation failure, or staging-only result must return false.
* The Training client displays a translated **"Update was made"** modal with an
  **OK** button only after that explicit server acknowledgement.
* The recommendation selection and its displayed reason must derive from the same
  active model version and visible game-state features. Maintain higher-value card
  preferences, 5-birdies/Godori exceptions, relevant concise explanations,
  correct target-specific advice, and all seven existing localizations.

## Current implementation boundary

As of this branch, the development service persistently counts completed games
and produces an isolated pending candidate when eligible and new learning exists.
It intentionally returns `publishedToLive: false`. The production-model
publisher, activation acknowledgement, live recommendation integration,
holdout gate and rollback workflow are **not yet connected**. This branch must
not be merged as though live automatic updates were working. The development
worker never receives production account/game/coin data.

See `training-learning/update-cadence.mjs`,
`tests/training-update-cadence.test.mjs`, and
`tests/training-learning-server.test.mjs` for the current verified boundary.
