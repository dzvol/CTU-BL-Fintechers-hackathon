# SemanticAuth: instructions for coding agents

SemanticAuth is a cloud authorization gateway between autonomous AI agents and money. An agent
proposes an intent, the user approves it in the web dashboard, and the gateway creates an active
task. From then on every `paid_fetch` goes through Normalizer → Policy → Screen → Judge →
decision before the gateway pays an x402 merchant from a shared sponsor EOA on Base Sepolia.

Before touching gateway logic, read `docs/architecture/overview.md`. It defines the glossary,
state machines and expected outcome of every scenario. Use its terms and state names exactly;
don't invent synonyms.

## You are one of five agents working in parallel

Five people work on this repo at the same time, each with their own agent. Other agents are
editing other folders right now. To avoid stepping on each other:

- Work only inside the area of the person you are working for (table below). If the user hasn't
  said which area they own, ask once at the start.
- If the task needs a change outside that area, do not make it. Stop and tell the user exactly
  what change is needed, where, and why, so they can ask the owner.
- Don't reformat, rename, move or "clean up" files you were not asked to touch.
- Don't add top-level directories, new workspace packages or new frameworks.
- `packages/contracts` is the shared interface between areas. Additive changes (new schema, new
  optional field) are fine. Breaking changes (rename, removal, new required field, changed
  meaning) need team agreement: describe them to the user before making them.
- Root config (`package.json`, `tsconfig.base.json`, `.github/`) changes only when unavoidable.
  Adding a new variable to `.env.example` is expected whenever you introduce one.
- Add dependencies only with `npm install <pkg> -w <workspace>`, never by editing
  `package-lock.json`. Prefer what is already installed (Hono, Zod, viem, better-sqlite3,
  `@modelcontextprotocol/sdk`, React, Vite, Vitest). Name every new dependency in your summary.

| Area                 | Paths                                                                                                           | Owner    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Harness plugin       | `packages/cli`, `packages/agent`, `harness-plugin/`                                                             | member 1 |
| Dashboard + pitch    | `apps/web`, `docs/` (presentation, roadmap)                                                                     | member 2 |
| Payments             | `apps/gateway/src/adapters/{x402,signer,chain-reader}`, `src/domain/{normalizer,ledger}`, reconciliation worker | member 3 |
| Gateway core + Jev   | everything else in `apps/gateway`, `packages/contracts`                                                         | member 4 |
| Test merchants + E2E | `tests/`                                                                                                        | member 5 |

Shared by everyone, append-only: `apps/gateway/src/db/migrations/` (see `apps/gateway/CLAUDE.md`).

## Commands

```bash
npm install
npm run dev:gateway      # http://localhost:8787
npm run dev:web          # http://localhost:5173
npm run dev:merchants    # http://localhost:4021
npm run typecheck
npm test                 # vitest in every workspace
npm run format           # prettier --write
npm test -w @semanticauth/gateway -- policy   # single workspace / filter
```

## Code conventions

- TypeScript strict, ESM. Code runs through `tsx` (gateway, cli, merchants) or Vite (web); there
  is no build step. Relative imports have no file extension. Import workspace packages by name
  (`@semanticauth/contracts`), never by relative path into another package.
- Validate every external input with Zod at the boundary: HTTP bodies, MCP arguments, merchant
  responses, Jev responses, env vars. Inside the boundary, trust the types.
- Types that cross package boundaries live in `packages/contracts`. Derive them with
  `z.infer<typeof XSchema>`; don't hand-write a parallel interface.
- No `any`. Use `unknown` and parse it.
- **Money:** USDC atomic units (6 decimals) as `bigint` in code and as a decimal-integer string in
  JSON (`"100000"` = 0.1 USDC). Never `number`, never floats. Convert to human form only for
  display.
- Timestamps: ISO 8601 UTC strings in APIs and the DB.
- IDs: prefixed UUIDs: `usr_`, `key_`, `int_`, `task_`, `op_`, `rev_` + `crypto.randomUUID()`.
- State names are lowercase snake_case (`pending_approval`, `awaiting_review`). Verdicts are
  uppercase: `'ALLOW' | 'REVIEW' | 'BLOCK'`.
- Files are kebab-case (`payment-gateway.ts`). Named exports only (config files excepted).
- Expected negative outcomes are data, not exceptions: a BLOCK carries a machine-readable
  `reason` code. Throw only for bugs and infrastructure failures.
- English for code, comments, commit messages and docs inside the repo. Comments explain why, not
  what.

## Security invariants

These hold even if a task seems to require breaking them. If it does, stop and ask.

1. The agent and harness never receive the sponsor private key or a signed authorization. Only
   the Signer reads `SPONSOR_PRIVATE_KEY`, and only PaymentGateway calls the Signer.
2. **Fail closed.** A Jev timeout, error or invalid response, an unknown state before signing, or
   a missing input all lead to BLOCK. No code path reaches ALLOW unless Policy, Screen and Judge
   all completed.
3. Order is fixed: Normalizer → Policy → Screen → Judge → decision. A Policy BLOCK means Jev is
   never called.
4. Merchant text is untrusted data. Only Screen sees it. Judge never sees merchant text, only
   the mandate, the task, code-computed facts and Screen's structured output. Never interpolate
   merchant text into any other prompt, log line used as a prompt, or instruction.
5. Funds are reserved atomically (one SQLite transaction) before anything is signed.
6. The exact signed authorization is persisted as `issued` before it leaves the gateway. From
   `issued` on, the amount counts as spent until reconciliation proves otherwise. Never
   auto-retry a payment.
7. The merchant's payment response is not proof. Settlement is confirmed by ChainReader on chain
   (token, amount, payer, recipient).
8. Supported payment profile only: x402 `exact`, USDC, EIP-3009 signed via EIP-712, on the one
   network a deployment runs: Base Sepolia by default, Base mainnet (real USDC) only with an
   explicit `PAYMENT_NETWORK=base-mainnet`. Signer and ChainReader always use the same network.
   Anything else is BLOCK (`unsupported_offer`).
9. Users act only on their own keys, intents, tasks and operations; otherwise 403. Intent
   approval and REVIEW approval happen only through the dashboard session, never through an
   agent API key.
10. An approved intent is immutable. One API key has at most one active task, and a new intent
    never replaces it.
11. A repeated identical `paid_fetch` in the same task returns the existing operation and never
    pays twice.
12. Never read, print, log or commit secrets (`.env`, private keys, API keys, OAuth secrets).
    Read `.env.example` instead.

## Tests

- Vitest. Unit tests live next to the code as `*.test.ts`; cross-module gateway tests go in
  `apps/gateway/test/`.
- Pure domain code (normalizer, policy, ledger, facts, decision) must have unit tests covering the
  relevant scenarios from `docs/architecture/overview.md`.
- Unit tests never call real Jev, the chain or real merchants. Inject fakes through the adapter
  interfaces. Real-network checks belong in `tests/acceptance`.

## Git

- Branch from `main` as `<area>/<short-desc>`, e.g. `payments/x402-transport`,
  `core/intent-service`, `web/review-page`.
- Conventional Commits with the area as scope: `feat(payments): add EIP-3009 signer`.
- Keep `main` green. Before a commit run `npm run typecheck && npm test && npm run format:check`.
- Pull `main` often; small commits and PRs beat one big merge at the end.
- Commit, push or open PRs only when the user asks.

## Definition of done

- Typecheck, tests and format check pass.
- New env vars are in `.env.example` with a comment.
- Contract changes are in `packages/contracts`, and breaking ones were agreed with the team.
- Your summary to the user lists any changes outside their area (ideally none), new
  dependencies, contract changes and anything left unfinished.
