# Gateway (`@semanticauth/gateway`)

Hono backend with the Dashboard API, MCP server, services, decision pipeline, payments and
SQLite. Owners: member 4 (core, auth, services, Jev, workers) and member 3 (`adapters/x402`,
`adapters/signer`, `adapters/chain-reader`, `domain/normalizer`, `domain/ledger`, reconciliation
worker). Stay in your owner's folders.

States, verdicts and scenario outcomes are defined in `docs/architecture/overview.md`.

## Layers and dependency direction

```
api/dashboard, mcp      input adapters: parse with Zod → call a service → map result to response
        ↓
auth                    session / API key → RequestContext { userId, apiKeyId?, activeTaskId? }
        ↓
services/*              use cases; orchestrate domain + output adapters
        ↓          ↘
domain/*            adapters/*   output adapters behind interfaces
```

- **Input adapters** (`api/`, `mcp/`) contain no business logic, no SQL, no Jev or payment
  calls.
- **`domain/`** is pure. It never imports from `services/`, `adapters/` or `db/`. No I/O, no
  `Date.now()`, no randomness: pass `now` and IDs in as arguments. All its branches are unit
  tested.
- **`services/`** depend on adapter interfaces, not implementations. Each adapter folder exports
  an interface plus a factory, e.g. `adapters/jev/jev-client.ts` exports `interface JevClient`
  and `createHttpJevClient(config)`.
- Wiring happens in one place (`src/app.ts`, or `src/container.ts` once it grows). Pass
  dependencies to service factories as arguments. No module-level singletons except parsed
  config.
- Workers (`workers/`) call services. They don't touch the DB directly.

## Database

- `better-sqlite3`, one file at `DATABASE_PATH`. Only `adapters/store` runs SQL; services use
  repository functions it exposes.
- Migrations live in `src/db/migrations/` and are **append-only**: name them
  `YYYYMMDDHHMM_description.sql`, never edit or renumber an existing one. Timestamps avoid
  collisions between people working in parallel. Tell the team when you add one.
- snake_case tables and columns; amounts as TEXT holding integer atomic units; timestamps as
  ISO 8601 TEXT.
- Reservations and state transitions run in a single transaction with an expected-state check
  (`UPDATE … WHERE id = ? AND state = ?`, then check `changes`).

## Payments path

- Only `services/payment-gateway` calls the Signer. The Signer never returns the private key, and
  the signed payload never goes into an MCP or Dashboard response.
- Persist `issued` before the transport sends the payment header.
- Jev adapter: timeout from `JEV_TIMEOUT_MS`; output validated with Zod; any failure maps to
  BLOCK with reason `jev_unavailable`.
- Merchant text goes only into the Screen request. Don't log it at info level, and never into a
  Judge request.

## Errors and responses

- HTTP errors use one JSON shape: `{ "error": { "code": "snake_case_code", "message": "…" } }`.
- 401 for a missing or invalid credential, 403 for someone else's resource, 404 for unknown IDs,
  409 for an invalid state transition.
- BLOCK and REVIEW are normal results (200 with operation state and `reason`), not HTTP errors.
