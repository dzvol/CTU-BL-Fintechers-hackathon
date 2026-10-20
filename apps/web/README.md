# SemanticAuth dashboard

The UI is adapted from [Semantic Gateway in Lovable](https://lovable.dev/projects/d7a127ca-42c1-4ede-bb57-92065412a778), pinned to source commit `27bf9191467dc7cbad4c7928f473f0a809f52d54` (19 October 2026), and redesigned on 20 October 2026: fewer pages, less copy, every gateway feature wired.

Imported source: the design tokens and responsive document styles in `src/styles.css`, the logo and public shell, and the used shadcn/Radix primitives in `src/components/ui`. Owner navigation, activity tables, task documents, review dialogs and agent setup retain the Lovable layout and are adapted to the repository's shared contracts. Unused primitives, the simulated backend, demo events, Lovable telemetry, TanStack Start server, and hosted build configuration are omitted. This is a standalone Vite SPA with code-based TanStack Router routes and pages in `src/pages`.

## Run locally

From the repository root, using Node.js 22.22.2+, 24.15+ or 26+ (the DOM-test dependencies require these supported Node versions):

```bash
npm install --include=dev
# Configure the gateway using .env.example; keep credentials out of Git.
npm run dev:gateway
npm run dev:web
```

Open [the dashboard](http://localhost:5173). Google OAuth must be configured on the gateway to sign in. Its development callback is `http://localhost:5173/auth/google/callback`. Without Google configuration, the gateway's login route returns 503. There is no authentication bypass or demo login in the shipped dashboard.

Vite proxies `/api` and `/auth` to `http://localhost:8787`. Requests use relative URLs and `credentials: 'include'` so cookies and CSRF origin checks work through the proxy. The Google callback stays under the proxy rather than a client route. No frontend environment variables or secrets are required. For production hosting, provide the same reverse-proxy paths and an SPA fallback for every route below.

All network access is in `src/api`. The adapter validates responses with `@semanticauth/contracts`, reads `{ items: [...] }` lists, and sends actions to the existing dashboard routes. It never uses the Lovable draft `/v1/session` or `/v1/purchases` endpoints. USDC stays in atomic-unit strings and uses the shared BigInt formatter. Expired sessions clear cached owner data; API-key secrets are transient, shown once and not persisted to browser storage.

## Screens

| Route                        | What the user does                                                                                | Gateway routes                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/`                          | Sign in with Google                                                                               | `/auth/google/login`, `/api/me`                                 |
| `/overview`                  | Approve or reject paused payments inline, open proposed tasks, watch the active task's budget     | `/api/reviews`, `/api/intents`, `/api/tasks`, `/api/operations` |
| `/activity`, `/activity/:id` | Every `paid_fetch` with its outcome, reason, recipient and Basescan link; decide a pending review | `/api/operations`, `/api/reviews/:id/{approve,reject}`          |
| `/tasks`, `/tasks/:intentId` | Read a proposal's request, rules and limits; approve, reject or stop it; see its purchases        | `/api/intents/:id/{approve,reject}`, `/api/tasks/:id/close`     |
| `/agent`                     | Create, replace or revoke the one API key (shown once), connect Claude Code or Codex via the CLI  | `/api/keys`                                                     |

`/contact` (team email and the CTU Blockchain Lab page) also opens without signing in.

The sidebar always shows what is left of the sponsored allowance (`/api/me` → `balance`). When it
reaches zero the dashboard says agent keys stopped working and refuses to create a key; the gateway
enforces both. Old URLs (`/mandates`, `/mandates/:id`, `/connect`) redirect.

## Display rules

- An operation counts as **Paid** only with a settlement (`settlement.explorerUrl` links to
  Basescan). Delivery alone is never shown as paid; `unknown` is shown as **Unconfirmed** and the
  ledger counts it as spent.
- Reason codes map to short labels in `src/lib/labels.ts`; the review card shows the gateway's
  `detail` next to them. Merchant text appears only on the operation page, collapsed and marked
  as unverified.
- Decisions go to the review or intent ID the user saw; the gateway checks state and ownership.
  Countdown timers disable buttons at the deadline without waiting for a poll.
- Data refreshes every 3 s while the tab is focused, so a paused payment appears without a reload.

## Not in the gateway yet

Multiple keys per user, wallets, paid plans and administration have no backend, so
the dashboard does not show them. [ADMIN-BACKEND.md](ADMIN-BACKEND.md) keeps the proposed admin
API for later.

## Verification

```bash
npm run typecheck -w @semanticauth/web
npm test -w @semanticauth/web
npm run build -w @semanticauth/web
npx prettier --check apps/web
```

Tests use synthetic contract responses: sign-in and session expiry, allowance and exhaustion,
intent approval/rejection/conflicts, confirmed task stop, inline review approval by review ID and
expiry, activity filters and Basescan links, one-time key display, confirmed key replacement and
revocation, onboarding for a new account and legacy redirects.
