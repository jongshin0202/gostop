# GoStop Live! development, admin, and production environments

## Isolation principles
- Production: `https://gostoplive.com`, Vercel **gostop**, Git production branch `main`. Never merge unverified changes or automatically promote from the development project.
- Development: a separate Vercel project `gostop-dev`, at **https://gostop-dev.vercel.app** and Git source branch `develop`. Do not reuse GoStopLive.com for development.
- Administration: a separate Vercel project `gostop-admin`, at **https://gostop-admin.vercel.app**, with root directory `admin-portal` from the admin isolation change. Never expose `/admin`, `/admin.html`, or `/api/admin/*` on the public production domain.

## Backend data isolation
The game frontend uses Cloudflare Worker/Durable Objects for accounts, games, coins, rankings, and analytics. A different Vercel frontend URL **is not** sufficient backend isolation.
- A separate Worker `gostop-authority-dev` is now deployed at `https://gostop-authority-dev.jwshin1.workers.dev` through `.github/workflows/deploy-cloudflare-development.yml` with `wrangler.dev.toml`. Durable Object storage is isolated by its distinct Worker deployment.
- The `gostop-dev` Vercel project's `GOSTOP_DEV_SERVER_URL` points to the verified dev Worker, never `gostop-authority.jwshin1.workers.dev`. The dev frontend `dev-site/build.mjs` rejects production origins.
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

## Deployment status
Both isolated Vercel projects exist with Vercel SSO protection and READY deployments. Development has its own READY Cloudflare Worker with separate storage.
The production website `gostoplive.com` has not been modified or redeployed. Admin API origin restrictions and removal of the public `/admin` route are in draft PR #203, not yet merged. The separate admin UI URL can load, but administrative backend operations require the Worker origin allowlist changes to be deployed after review. Do not merge PR #203 until the admin backend and game regression checks are approved.
