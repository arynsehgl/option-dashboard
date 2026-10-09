# Strikeview V2 Trade Zone — Production Setup

Trade Zone is a separate workspace beside the existing options Dashboard. The zone lobby and hanging rope switch move between them without changing Dashboard calculations or NSE/BSE proxy behavior.

## Production architecture

- **Firebase stays authoritative.** Reuse the production V1 Firebase project and its existing Authentication users plus Firestore `users/{uid}` profiles, trials, subscriptions, and access state. V2 must not migrate users to a new identity provider.
- **The browser uses Firebase only.** The frontend sends a Firebase ID token to the Trade Worker. It does not initialize Supabase Auth and must never receive a Supabase service-role key.
- **The worker verifies every identity.** Firebase Admin verifies the token, rejects revoked sessions, loads the matching Firestore profile, computes current access, and maps the Firebase UID to an internal Supabase profile UUID.
- **Supabase is server-only persistence.** It stores encrypted Kite connections, watchlists, paper accounts/orders/fills/positions, research runs, reports, audit events, OAuth state, and the Firebase-to-internal-profile mapping.
- **Live access is read-only.** V2 displays broker portfolio and market information but does not permit live order placement, modification, cancellation, GTT, or position conversion.
- **Manual execution is disabled.** The order ticket cannot submit either manual paper orders or live broker mutations in V2.
- **Automation is guarded and paper-only.** Users can save and preview Algo drafts, but cannot activate them. No strategy evaluator cron runs in V2. The 07:00 AI phase is plan-only; only the 09:15 revalidation can submit paper intents through deterministic risk controls, using a fresh real broker quote timestamp inside the weekday 09:15–15:19 IST window.

## Prerequisites

- Node.js 22.13 or newer
- The existing production V1 Firebase project
- Firebase Admin credentials through one service-account credential pair, or deliberately approved Application Default Credentials
- A Supabase project used only by the Trade Worker
- A paid Kite Connect app
- A GitHub token entitled to use the Copilot SDK when AI research is enabled
- A TLS-enabled persistent container host for the Trade Worker

## Environment configuration

Install dependencies and create untracked local environment files:

```bash
npm ci
npm --prefix services/trade-worker ci
cp .env.example .env.local
cp services/trade-worker/.env.example services/trade-worker/.env
```

### Frontend

Copy the existing V1 production Firebase web values unchanged into the matching `VITE_FIREBASE_*` variables. Set `VITE_TRADE_WORKER_URL` to the worker's public HTTPS origin for production. Do not add any `VITE_SUPABASE_*` variable.

Firebase Authentication must authorize the production Netlify domain. Authorize a deploy-preview domain only when that preview needs an interactive Firebase login, and remove obsolete preview domains after validation. Enable Firebase Authentication Email Enumeration Protection in the V1 production project and verify login, signup, and password-recovery responses do not disclose whether an account exists.

Administrator authority comes only from an authenticated Firebase email matching the explicit environment allowlist; browser authorization never trusts the Firestore `isSuperAdmin` profile field. Set `VITE_SUPERADMIN_EMAILS` and `FIREBASE_SUPERADMIN_EMAILS` to the same comma-separated list of exact email addresses. Values are trimmed, compared case-insensitively, and deduplicated; Gmail dot or `+` aliases are not rewritten. A non-empty plural setting is authoritative. The legacy singular `VITE_SUPERADMIN_EMAIL` and `FIREBASE_SUPERADMIN_EMAIL` settings are fallback-only when their corresponding plural value is absent or blank, so a stale singular value cannot silently preserve revoked access. Before deployment, confirm every listed Firebase Auth identity is enabled, email-verified, and has a readable `users/{uid}` Firestore profile. The code temporarily permits an existing V1 email/password administrator to match even when Firebase still reports that address as unverified, but that compatibility path is not the approved production posture. Omit both plural and singular settings when no configured-email administrator bypass is required.

### Trade Worker

Required production settings are documented in `services/trade-worker/.env.example`:

- `NODE_ENV=production`
- `PUBLIC_WORKER_URL=https://<worker-host>`
- `FRONTEND_ORIGIN=https://<primary-netlify-host>`
- `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY`
- A base64-encoded 32-byte `APP_ENCRYPTION_KEY`
- `FIREBASE_PROJECT_ID` for the same V1 Firebase project
- Both `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, unless Application Default Credentials are deliberately enabled with `FIREBASE_ALLOW_APPLICATION_DEFAULT=true`
- Optional server-only `FIREBASE_SUPERADMIN_EMAILS`, containing the same exact allowlist as `VITE_SUPERADMIN_EMAILS`; the singular variables are legacy fallback only
- Optional `GITHUB_TOKEN` and `COPILOT_MODEL` for AI research
- `LIVE_ORDERING_ENABLED=false`

Production service URLs and browser origins must use HTTPS. `FRONTEND_ORIGIN` and every comma-separated entry in `FRONTEND_ORIGINS` must be an exact origin: scheme, host, and optional port only, with no path, query, or credentials.

Production defaults to explicit Firebase credentials. Set `FIREBASE_ALLOW_APPLICATION_DEFAULT=true` only when the container host has an intentionally configured workload identity or other approved ADC source; the flag is an explicit production opt-in, not a fallback. Without that opt-in, both credential fields are required. Before binding its HTTP listener, the worker verifies Firebase Auth, Firestore Admin, and the required Supabase schema and exits if any readiness check fails. Public health checks share short success and sanitized failure caches so normal polling and dependency outages do not repeatedly issue remote probes.

To permit Netlify PR previews, set `NETLIFY_PREVIEW_SITE_NAME` to the Netlify site name only, for example `myoptiontrade`. The worker then accepts exactly this numeric pattern in addition to configured exact origins:

```text
https://deploy-preview-<number>--myoptiontrade.netlify.app
```

Do not add a wildcard origin. WebSocket upgrades use the same origin policy. Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops and retain the bounded `MAX_STREAM_CLIENTS_PER_USER` setting.

`LIVE_ORDERING_ENABLED` is intentionally validated as the literal string `false`. Setting it to `true` prevents the worker from starting; live mutations are outside the V2 release contract.

## Firebase rules

`firestore.rules` must be deployed to the same V1 Firebase project during the controlled frontend cutover, not while the tagged V1 frontend is still serving traffic. Before the release, capture and review the exact currently deployed V1 rules plus their revision so rollback has a known-good rules artifact. The strict V2 create contract uses Firestore timestamps, while tagged V1 signup writes the legacy date representation; deploying V2 rules early would break new V1 signups.

During the maintenance window, deploy the V2 frontend first while public traffic remains blocked, then immediately deploy the strict V2 rules before reopening traffic:

```bash
firebase use <v1-production-project-id>
firebase deploy --only firestore:rules
```

Rules deployment is mandatory. The supplied rules allow users to read only their own profile, create only a bounded three-day trial profile, and update only `name` and `phone`. Client writes cannot grant admin access or alter trial/subscription entitlements. Review the active project shown by the Firebase CLI before deployment so rules are never sent to a different Firebase project.

## Supabase migrations

Back up the target database, verify the target project, and apply every migration in filename order:

1. `supabase/migrations/202609080001_trade_zone.sql` — Trade Zone schema, internal Firebase UID profiles, paper trading, reporting, and audit foundation.
2. `supabase/migrations/202609090001_playground_accounting.sql` — persistent ₹10,00,000 paper accounts and transactional accounting hardening.
3. `supabase/migrations/202609100001_firebase_identity.sql` — removes legacy Supabase Auth coupling, locks browser roles out, and adds the server-only Firebase profile resolver.
4. `supabase/migrations/202609110001_oauth_state_and_release_guards.sql` — one-time Kite OAuth state plus draft/paper-first release guards.
5. `supabase/migrations/202609120001_worker_runtime_guards.sql` — enforces one active leased AI run per user, atomically fences AI plans/risk decisions/fills, limits the unleased system source to exact position flattening during the separate 15:20–15:29 close runway, requires fresh quote timestamps, and creates the service-only runtime readiness marker.

With the Supabase CLI linked to the verified project:

```bash
supabase db push
```

Do not expose `anon` or `authenticated` access as an alternative frontend integration. The worker alone uses the service role. Existing database rows from an earlier V2 experiment must be reconciled before validating the Firebase UID constraint; do not invent or overwrite Firebase UIDs.

## Kite connection

Configure the Kite app redirect URL exactly as:

```text
https://<worker-host>/api/v1/kite/callback
```

Each user enters their own Kite API key and secret through the authenticated worker endpoint. Secrets are encrypted with AES-256-GCM and never returned to the browser.

The login request uses a cryptographically random, ten-minute OAuth state. Only its SHA-256 hash is stored. The callback atomically consumes the state once and returns only to the bound, allowed frontend origin, so an expired, replayed, or foreign-origin callback is rejected.

The global instrument master refresh uses only connected, unexpired Kite sessions. A just-completed callback user is tried first; the scheduled refresh deterministically fails over across other connected candidates. Callback and cron requests share one process-wide refresh, a five-minute success cooldown, and a thirty-second failure cooldown. Before any upsert or stale-row update, the worker requires a complete, unique, well-formed catalogue of at least 10,000 instruments, so an empty, truncated, or malformed upstream response cannot deactivate the existing master.

The worker request logger strips the complete query string before recording any URL. Configure the TLS reverse proxy and every upstream access-log layer to omit or redact query strings for `/api/v1/kite/callback`; neither `request_token` nor `state` may appear in proxy, platform, APM, or worker logs.

For a public multi-user product, obtain Zerodha compliance approval rather than redistributing one personal Kite feed.

## Runtime schedule

All jobs run on weekdays in `Asia/Kolkata`:

| Time | Job |
| --- | --- |
| 07:00 | Build a provisional, plan-only Copilot paper research hypothesis from user-scoped evidence |
| 08:30 | Refresh the Kite instrument master |
| 08:45 | Record a Kite-login reminder when today's feed is disconnected |
| 09:15 | Revalidate the paper plan; stale ideas become `no_trade`, while qualifying ideas may submit guarded paper intents |
| 15:00 | Generate the pre-close daily paper report |
| 15:20–15:29 | Retry exact system-only flattening of remaining intraday paper positions once per minute with fresh quotes |
| 15:40 | Finalize the close-of-day paper report and delivery queue |

There is no minute-level Algo evaluator cron. Saved Algo strategies are drafts/previews only. Scheduled user work rechecks Firebase identity and entitlement instead of trusting a stale Supabase profile snapshot; disabled Firebase accounts are excluded.

Morning Copilot sessions can only read user-scoped evidence and create a provisional plan; they never receive the paper-intent tool. Only open revalidation may submit an intent, and only during the weekday 09:15–15:19 IST window. Every run receives a worker-memory-only random lease whose hash is stored in Supabase. Plan finalization, rejected decisions, and approved decision/fill accounting lock and verify that exact active lease in their database transaction, so stale recovery revokes a zombie before it can persist later side effects. The worker replaces the proposed entry with a fresh, timestamped Kite quote before deterministic quote-age, stop-direction, per-trade risk, daily-loss, position-count, capital-utilization, and duplicate checks. A separate database-verified `system` source can only close an existing full position and receives a non-overlapping 15:20–15:29 retry runway; these risk-reducing closes bypass the opening-capital ceiling, while AI and generic fills cannot use that grace period. Each position is isolated so one failed close remains open for the next minute without blocking later positions. Shell, filesystem, arbitrary network, direct broker mutation, and live execution capabilities remain rejected.

## Deployment

Keep the static frontend and Netlify Functions on Netlify. Run `services/trade-worker` as one persistent Node.js container because schedules and WebSockets cannot run reliably in a short-lived function.

1. Schedule a controlled maintenance window, block public writes/traffic, back up Supabase, and record the currently deployed frontend and worker revisions.
2. Confirm the target Firebase project is the existing V1 production project. Capture and review its exact currently deployed V1 Firestore rules and revision for rollback; do not deploy the strict V2 rules yet.
3. Apply all five Supabase migrations in order and verify browser roles retain no Trade Zone table/function access.
4. Build the worker image:

   ```bash
   docker build -t stride-trade-worker services/trade-worker
   ```

5. Store worker values in the host's encrypted secret facility, including the complete `FIREBASE_SUPERADMIN_EMAILS` allowlist. Keep the existing singular administrator value during the rollback window; new code ignores it while the plural setting is populated, but an old worker/frontend rollback still requires it. Never bake `.env` into the image.
6. Put the worker behind TLS, proxy HTTP and WebSocket upgrades to port 3002, configure the exact `TRUST_PROXY_HOPS` value, and disable or redact callback query strings in every proxy/access-log format.
7. Deploy one worker replica and verify it completes Firebase Auth, Firestore, and required Supabase-schema readiness checks before it listens. Multiple replicas can duplicate scheduled jobs because distributed schedule locking is not implemented; V2 supports exactly one scheduler-bearing replica.
8. Set Netlify's `VITE_TRADE_WORKER_URL` to the same public worker origin, retain the V1 Firebase values, set `VITE_SUPERADMIN_EMAILS` to the same allowlist already deployed as `FIREBASE_SUPERADMIN_EMAILS`, and deploy the V2 frontend/functions while maintenance traffic remains blocked. Vite embeds this value at build time, so changing it always requires a new frontend deployment.
9. Immediately deploy `firestore.rules` to the verified V1 Firebase project, then run the release smoke checks before reopening traffic. Do not leave the V2 frontend on legacy rules or the tagged V1 frontend on strict V2 create rules.
10. Confirm the Kite callback URL and all allowed frontend origins match the deployed hosts exactly, then reopen traffic only after every identity and safety check passes.

## Release validation

Run the local gates before deployment:

```bash
npm test
npm run test:firestore-rules
npm run build
npm run worker:test
npm run worker:build
node --check netlify/functions/fetchBSEData.js
```

Then complete this production smoke checklist:

- Run the Firestore rules suite against the local Firebase emulator; verify bounded V2 trial creation, legacy V1 profile reads/display edits, cross-user denial, field-size limits, and entitlement/admin mutation denial.
- Verify `/health` over HTTPS. Confirm the worker refuses to bind if `LIVE_ORDERING_ENABLED` is anything except `false`, or if Firebase Auth, Firestore, Supabase connectivity, or the required Supabase schema readiness fails.
- Sign in with an existing V1 Firebase email account and Google account; verify the same Firestore profile, trial, and subscription are used. When administrators are configured, confirm the browser and worker plural allowlists match, every listed enabled and verified Firebase identity has its own readable profile and receives access, an allowlisted identity without a profile is rejected, an unlisted expired account is sent to Pricing, and a stale legacy singular value cannot add another administrator.
- Confirm Email Enumeration Protection is enabled and signup/password-recovery behavior does not reveal whether an account exists.
- Disable a test Firebase account and confirm both authenticated APIs and scheduled work reject it. Confirm expired users are also denied and scheduled work rechecks Firebase entitlement.
- Confirm no Supabase key is present in the browser bundle, network requests, or Netlify public variables.
- Verify an untrusted HTTP/WebSocket origin is rejected and an allowed numeric Netlify deploy-preview origin works only when configured.
- Open concurrent WebSocket connections for one user and verify hub creation is coalesced, client limits hold, each socket accepts only one bounded 100-token subscription, slow consumers are closed before buffers grow without bound, broker-disconnected heartbeats never appear live, reconnects resubscribe every desired token, disconnects release resources, the five-minute session expiry reconnects through a newly Firebase-authorized stream ticket, and unknown upgrade paths close cleanly.
- Connect Kite, complete the callback once, and verify replaying or expiring the OAuth state fails safely. Search the worker, TLS proxy, platform, and APM logs for the test callback values and confirm neither its `request_token` nor `state` appears anywhere.
- Verify holdings, positions, orders, trades, candles, quotes, and streams are read-only; no broker mutation control is available.
- Confirm manual paper entry and every live broker mutation stay disabled. Run the 07:00 phase and verify it produces a plan without an intent; run guarded 09:15 revalidation with a fresh real Kite quote and verify qualifying paper accounting. Confirm AI/generic fills fail outside weekday 09:15–15:19 IST, while only exact system position closes can retry from 15:20 through 15:29 and all paths still reject stale/fabricated quote timestamps.
- Trigger concurrent AI-run creation for one user and verify one active run plus a safe conflict response. Recover a queued/running run older than 30 minutes, then resume its old process and verify its revoked lease cannot add a plan, risk decision, audit-backed fill, or terminal update while the replacement proceeds.
- Reconcile guarded paper fills, cash, positions, charges, India-date daily P&L rollover, reports, and audit events against expected values.
- Save and preview an Algo draft; verify activation is rejected and no evaluator cron runs.
- Verify NSE/BSE option chains, BSE expiry recovery, Demo Tour labelling, stream heartbeat/reconnect, logs, monitoring, and backups.

## Rollback

1. Enter maintenance mode and stop new traffic to the V2 frontend and worker if identity, database, or broker validation fails. Keep `LIVE_ORDERING_ENABLED=false`.
2. Restore the captured, reviewed V1 Firestore rules before redeploying the tagged V1 frontend/functions. This order is mandatory so V1 signup never meets the strict V2 timestamp create contract. Never switch to a different Firebase project as a shortcut.
3. Redeploy the recorded previous frontend/functions revision and previous worker image; keep the legacy singular administrator values available until the rollback window closes because old revisions do not understand the plural allowlists. Do not delete user data as part of an application rollback.
4. Database migrations are forward security/data changes. Do not manually reverse them in production. Restore the pre-release Supabase backup only after assessing data written since deployment and approving the resulting data loss window.
5. Revoke or rotate worker secrets if exposure is suspected, then validate Firebase token rejection, Supabase access, Kite sessions, and origin controls before reopening traffic.

## V2 operating contract

- A new user begins with ₹10,00,000 virtual opening capital; it is unrelated to broker funds.
- Paper capital and lifetime performance persist across days while daily P&L resets by India trading date.
- Only guarded AI open-revalidation intents can originate new paper fills in V2; manual paper entry is disabled and Algo remains non-executing.
- Live broker portfolio and market data remain read-only.
- Algo definitions remain draft/preview-only and cannot be activated.
- The optional Demo Tour never substitutes fixed values for live data.
- Every live broker mutation and all manual order execution are outside V2.
