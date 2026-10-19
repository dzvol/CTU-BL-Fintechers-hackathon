# SemanticAuth dashboard

The UI is adapted from [Semantic Gateway in Lovable](https://lovable.dev/projects/d7a127ca-42c1-4ede-bb57-92065412a778), pinned to source commit `27bf9191467dc7cbad4c7928f473f0a809f52d54` (19 October 2026).

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

Vite proxies `/api` and `/auth` to `http://localhost:8787`. Requests use relative URLs and `credentials: 'include'` so cookies and CSRF origin checks work through the proxy. The Google callback stays under the proxy rather than a client route. No frontend environment variables or secrets are required. For production hosting, provide the same reverse-proxy paths and SPA fallback for `/overview`, `/mandates/*`, `/activity/*`, and `/connect`.

All network access is in `src/api`. The adapter validates responses with `@semanticauth/contracts`, reads `{ items: [...] }` lists, and sends actions to the existing dashboard routes. It never uses the Lovable draft `/v1/session` or `/v1/purchases` endpoints. USDC stays in atomic-unit strings and uses the shared BigInt formatter. Expired sessions clear cached owner data; API-key secrets are transient, shown once and not persisted to browser storage.

## Supported flows and backend gaps

| UI capability                              | Gateway route / current behavior                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google login, profile, logout              | `/auth/google/login`, `/api/me`, `POST /auth/logout`; Google credentials required locally                                                                                                                                                                                                                                                |
| List, create, revoke agent API keys        | `/api/keys`, `DELETE /api/keys/:id`; uses `apiKey` and one-time `key` response fields; no invented last-four or expiry                                                                                                                                                                                                                   |
| Review and approve/reject intents          | `/api/intents`, `/api/intents/:id`, `POST /api/intents/:id/{approve,reject}`                                                                                                                                                                                                                                                             |
| List tasks, stop an active task            | `/api/tasks`, `POST /api/tasks/:id/close`; intent IDs remain in `/mandates/:id` URLs, task IDs are used for closure                                                                                                                                                                                                                      |
| Activity and operation details             | `/api/operations`, `/api/operations/:id`; payment and delivery shown separately; unknown outcomes count as spent                                                                                                                                                                                                                         |
| Purchase reviews                           | Adapter and dialog use `/api/reviews` and `POST /api/reviews/:reviewId/{approve,reject}`. **ReviewService currently returns 501**, including listing. The UI displays an explicit unavailable state and does not pretend the queue is empty. These routes return the shared `Review` shape and must be implemented by the gateway owner. |
| Available/spent/reserved allocation totals | `/api/me` exposes only assigned `allocation`. Task `spent` and `reserved` are backend placeholders. The dashboard labels allocation as assigned, omits fabricated balance totals, and flags the limitation. An authoritative aggregate ledger summary is needed.                                                                         |
| Paid execution                             | Offer selection and payment execution are incomplete in PaymentGateway; paid requests currently fail closed. The UI displays the returned reason/state. No live payment success was verified.                                                                                                                                            |
| Editable intent terms / amendments         | No update endpoint. Intents are immutable; users reject incorrect proposals and ask their agent to resubmit. Interpretation confidence, disclosure controls, versions and content hashes from the Lovable model are omitted.                                                                                                             |
| Magic links and admission codes            | No gateway support. Sign-in explains the limitation and offers Google only. Magic-link initiation, callback/session behavior and security contract need backend agreement before wiring.                                                                                                                                                 |
| Administration and roles                   | No backend role, user/agent administration, grant-admin or agent-revocation APIs. `/admin` explicitly reports unavailable; no fabricated admin privileges or link in owner navigation.                                                                                                                                                   |
| Contact form                               | No contact endpoint; `/contact` explicitly explains that no message can be submitted.                                                                                                                                                                                                                                                    |
| Detailed evidence                          | `Operation` exposes current state, timestamps, offer, reason/message and optional settlement only. Returned content, full event timelines, disclosed inputs, request/offer hashes and detailed Jev traces require additive shared-contract/backend work. Missing evidence is labeled rather than fabricated.                             |

Changes to backend services and shared contracts belong to their owners; this integration changes neither. Missing features do not fall back to mock account, role, balance or transaction data.

## Verification

```bash
npm run typecheck -w @semanticauth/web
npm test -w @semanticauth/web
npm run build -w @semanticauth/web
npx prettier --check apps/web
```

The dashboard tests cover shared response shapes, session cookies, mutation URLs (especially review ID versus operation ID), malformed responses, 204 logout, offline/401/501 handling, exact money precision, intent approval/rejection/conflicts, confirmed task closure, key creation/hiding/revocation, activity filtering, logout and session expiry. Tests use synthetic contract responses; no external providers or transactions are contacted.

Manual local browser verification used the real gateway app with its existing in-memory test configuration and injected synthetic Google/merchant adapters. The temporary launcher was outside the repository; no production authentication bypass was added. Verified the Vite proxy and cookie login, intent approval, API-key creation/hiding/revocation, free and fail-closed operations, filters, details, desktop layout and mobile cards/details at 390px without page overflow. Live Google OAuth, signing, chain settlement and review decisions remain unverified/unavailable.

Repository-wide typecheck passes. The full test run has an existing failure in `apps/gateway/src/adapters/x402/x402-transport.test.ts`: the repeatable-payment-body test expects content directly but the normalizer receives `{ data: content }`. Payment-area source/tests are unchanged. Root `README.md` also has a pre-existing Prettier warning; web formatting passes.

## Added dependencies

Runtime: `@tanstack/react-router`, `@tanstack/react-query`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `tw-animate-css`.

Development: `tailwindcss`, `@tailwindcss/vite`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`.

Outside `apps/web`, only the npm-generated root `package-lock.json` changes. No shared contract, gateway, deployment, repository remote or environment configuration changes are included.
