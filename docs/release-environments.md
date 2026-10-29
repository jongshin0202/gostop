# GoStop Live! development, admin, and production environments

## Isolation principles
- Production: `https://gostoplive.com`, Vercel **gostop**, Git production branch `main`. Never merge unverified changes or automatically promote from the development project.
- Development: a separate Vercel project (proposed name `gostop-dev`), with a **dedicated URL assigned by Vercel** and Git source branch `develop`. Do not reuse GoStopLive.com for development.
- Administration: a separate Vercel project (proposed name `gostop-admin`), with root directory `admin-portal` from the admin isolation change. Never expose `/admin`, `/admin.html`, or `/api/admin/*` on the public production domain.

## Backend data isolation
The game frontend uses Cloudflare Worker/Durable Objects for accounts, games, coins, rankings, and analytics. A different Vercel frontend URL **is not** sufficient backend isolation.
- Provision a separate development Worker and separate Durable Object namespaces/storage for game rooms, account store, lobby, and backup store.
- Set development's API rewrites and `GOSTOP_SERVER_URL` to the verified development Worker URL, not `gostop-authority.jwshin1.workers.dev`.
- Configure the development Worker `ALLOWED_ORIGINS` with only the verified development Vercel origin; keep production auth and payment/coin data out of dev.
- Keep admin `ADMIN_ORIGINS` to the verified standalone admin origin. Keep admin authorization mandatory. Use different administrative secrets for the dev and production backends.
- Do not deploy a development URL that points to production accounts or game state by default.

## Promotion workflow
1. Make changes on short-lived feature branches, with only the affected functionality edited.
2. Merge tested features into `develop` (or create a reviewed integration PR); CI and manual desktop + mobile checks run on the dev site.
3. Test card input, game resolution, ranked/online play, login, language switching, the seven Training translations, and current critical bug regressions. Verify the same build and backend environment used for review.
4. Open a separate PR from the verified `develop` commit into `main`. Require explicit approval and green CI before merge.
5. Only the reviewed `main` commit is eligible for production deployment. Confirm its production domain remains `gostoplive.com`.
6. Verify production smoke tests after release; roll back only using an explicitly reviewed prior production deployment.

## Setup blockers as of October 28, 2026
Creating the two Vercel projects requires authorization for the existing Vercel team. This document does not claim a URL exists or that any production deployment was modified.
