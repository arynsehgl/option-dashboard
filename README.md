# Strikeview V2 — Dashboard and Trade Zone

Strikeview V2 keeps the existing NSE/BSE options Dashboard and adds a guarded Kite-powered Trade Zone for read-only portfolio visibility, charts, draft strategies, and paper AI research.

The production V1 Firebase project remains the only browser identity, user-profile, trial, subscription, and entitlement source of truth. Existing users keep the same accounts and access state in V2. The persistent Trade Worker verifies Firebase ID tokens with Firebase Admin before it maps each Firebase UID to an internal Supabase profile UUID. Supabase is server-only storage for Trade Zone state; it is not a browser authentication provider.

Without a configured Trade Worker and today's Kite login, Trade Zone shows a disconnected state or an explicitly selected Demo Tour—never fake live movement. Live broker data is read-only in V2, manual paper entry and every live mutation are disabled, and Algo strategies can only be saved as drafts or previews. The 07:00 AI phase is plan-only; only the guarded 09:15 revalidation may submit paper intents, and each accepted intent requires a fresh timestamped Kite quote inside the weekday 09:15–15:19 IST window.

See [TRADE_ZONE_SETUP.md](TRADE_ZONE_SETUP.md) for the production environment, database migrations, Firebase rules, Kite callback, schedules, deployment, rollback, and release checklist.

## Tech stack

- **Frontend:** React 18, Vite 8, Tailwind CSS, Chart.js, and Lightweight Charts
- **Identity and access:** Existing V1 Firebase Authentication and Firestore user documents
- **Options data:** Netlify Functions proxying NSE and BSE option-chain APIs
- **Trade Worker:** Node.js 22, TypeScript, Express, Firebase Admin, Kite Connect, and the GitHub Copilot SDK
- **Persistence:** Server-only Supabase PostgreSQL with transactional paper accounting and Firebase UID mapping
- **Deployment:** Netlify for the frontend/functions and one persistent container for the Trade Worker

## Project structure

```text
.
├── firestore.rules                # V2 client access restrictions for V1 Firebase data
├── firebase.json                  # Firestore rules deployment configuration
├── netlify/functions/             # NSE and BSE serverless data proxies
├── services/trade-worker/         # Persistent Kite, paper trading, reporting, and AI service
├── src/
│   ├── components/                # Shared dashboard and navigation components
│   ├── features/trade-zone/       # Trade Zone UI, data clients, and tests
│   ├── pages/                     # Public, dashboard, lobby, and Trade Zone routes
│   └── utils/                     # Option-chain clients and transformers
├── supabase/migrations/           # Server-only Trade Zone schema and release guards
├── .env.example                   # Public frontend configuration template
├── TRADE_ZONE_SETUP.md            # Production setup and release guide
└── netlify.toml                   # Netlify build and function configuration
```

## Local development

V2 requires Node.js 22.13 or newer.

```bash
npm ci
npm --prefix services/trade-worker ci
cp .env.example .env.local
cp services/trade-worker/.env.example services/trade-worker/.env
npm run worker:dev
npm run dev
```

Use `npm run dev:netlify` instead of `npm run dev` when the local frontend must call the Netlify Functions. Reuse the V1 Firebase web configuration in `.env.local`; do not create a second Firebase user store for V2.

## Validation

```bash
npm test
npm run test:firestore-rules
npm run build
npm run worker:test
npm run worker:build
node --check netlify/functions/fetchBSEData.js
```

## Options data endpoints

- `/.netlify/functions/fetchNSEData?symbol=NIFTY`
- `/.netlify/functions/fetchNSEData?symbol=BANKNIFTY`
- `/.netlify/functions/fetchBSEData?symbol=SENSEX`
- `/.netlify/functions/fetchBSEData?symbol=SENSEX&expiry=15%20Oct%202026`

The SENSEX proxy returns BSE's active expiry catalogue, reconciles stale selections, and performs one bounded official-page warm-up/retry after an upstream HTTP 403 or HTML denial.

## V2 safety contract

- Firebase remains authoritative for identity and access; the worker revalidates it for API requests and scheduled user work.
- Browser code never receives the Supabase service-role key or uses Supabase Auth.
- Paper accounting uses an isolated ₹10,00,000 virtual account and never calls Kite order APIs; manual paper entry is disabled in V2.
- Live holdings, positions, orders, trades, and market data are read-only views.
- `LIVE_ORDERING_ENABLED` must remain `false`; any other value fails worker configuration validation.
- Algo definitions remain draft/preview-only, and no strategy evaluator cron is registered.
- Morning AI research is plan-only. Only 09:15 open revalidation can submit paper intents, with fresh Kite quote timestamps and database-enforced weekday 09:15–15:19 IST AI fill boundaries; an exact-close-only system job gets a separate 15:20–15:29 retry runway.
- Kite OAuth state is random, short-lived, origin-bound, stored as a hash, and atomically consumed once.
- Demo Tour data is explicitly labelled and never presented as live market data.
