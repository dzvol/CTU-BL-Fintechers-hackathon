# Web dashboard (`@semanticauth/web`)

React + Vite dashboard for the **user** (never the agent). Owner: member 2.

Screens: Google login, profile with allocation and balance, API keys (create/revoke, show the key
once), pending intents (approve/reject), pending REVIEWs (approve/reject with offer details,
price and the reason for the REVIEW), and history of tasks, operations, payments (Basescan links)
and Jev decisions.

## Rules

- Talk only to the gateway Dashboard API under `/api` (Vite proxies `/api` and `/auth` to
  `localhost:8787`). Send `credentials: 'include'`; auth is a session cookie.
- All API calls go through functions in `src/api/`. Components never call `fetch` directly.
- Use request and response types from `@semanticauth/contracts`. Never import from
  `apps/gateway`.
- No business logic in the UI. The dashboard displays state and sends approve/reject; the gateway
  decides and enforces everything. Hiding a button is not access control.
- If an endpoint you need doesn't exist yet, don't implement it in the gateway. Add a temporary
  fake inside the matching `src/api/` function (clearly marked `// TODO: fake until <endpoint>`)
  and tell the user which endpoint and shape you need from member 4.
- Amounts arrive as integer atomic-unit strings (USDC, 6 decimals). Format them for display in
  one helper and never do float math on them.
- Pages in `src/pages/`, reusable pieces in `src/components/`.
