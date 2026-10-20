# SemanticAuth

**An authorization gateway between AI agents and money.** Agents never hold funds or keys. Before
any x402 payment, SemanticAuth checks that the purchase fits what the user actually approved, and
that the merchant is not trying to manipulate the agent.

> Built at **$ hackathon\_** by The FinTechers (Prague, 19–20 October 2026).
> Team **CTU Blockchain Lab** · Community category · **Track 1 · Agentic payments & money movement**
> (challenge: fraud-aware agentic checkout).

## The problem

AI agents can now pay for APIs and content on their own (x402, USDC). An agent that holds a
wallet will pay whatever a convincing merchant asks: a prompt injection hidden in an offer, a
"new" payment address, a subscription disguised as a one-off purchase, or something that has
nothing to do with the user's task. Valid JSON and a valid signature do not make a payment safe.

## How it works

1. The agent proposes an **intent** (purpose, allowed purchases, budget, per-purchase limit).
2. The user approves it in the **web dashboard** (Google login). The gateway creates a **task**
   bound to the agent's API key.
3. The agent calls the MCP tool `paid_fetch(url)`. The gateway fetches the merchant; on HTTP 402
   it runs the decision pipeline:

```
x402 offer → Normalizer → Policy → Screen → Judge → Decision → ALLOW | REVIEW | BLOCK
               (profile)   (rules)   (LLM)    (LLM)
```

- **Normalizer** accepts only x402 v2 `exact`, USDC (EIP-3009) on the configured network: Base
  Sepolia by default, Base mainnet with `PAYMENT_NETWORK=base-mainnet`.
- **Policy** enforces deterministic limits; a Policy BLOCK never reaches the LLM.
- **Screen** is the only stage that reads untrusted merchant text. It returns structured facts and
  manipulation signals.
- **Judge** compares the purchase with the approved mandate. It **never sees merchant text**, only
  the mandate, code-computed facts and Screen's structured output (dual-LLM / quarantine pattern).
- Any LLM timeout or invalid answer means **BLOCK** (fail closed).

4. On ALLOW, funds are reserved atomically in the **sponsored ledger**. The gateway signs an
   EIP-3009 authorization from a shared sponsor wallet, pays, and verifies settlement **on chain**.
   On REVIEW, the user decides in the dashboard.

The full design (glossary, state machines, expected outcome of every scenario) is in
[`docs/architecture/overview.md`](docs/architecture/overview.md).

## Built during the hackathon

Everything in this repository was written during the event. Nothing existed before: the
`hackathon-start` tag marks the first commit (`0c6851f`, 19 October 12:06).

- **Gateway** (`apps/gateway`, Hono + SQLite)
  - Google OAuth login, sessions and agent API keys
  - Intent → task flow and REVIEW service
  - MCP server with the agent tools (`get_intent_template`, `submit_intent`, `paid_fetch`, …)
  - Decision pipeline: x402 normalizer, deterministic policy, code-computed facts, decision table
  - Jev client (TypeSafe) for Screen and Judge, with fail-closed handling
  - x402 v2 HTTP transport, EIP-3009 / EIP-712 signer, on-chain settlement verification
    (ChainReader) and reconciliation worker
  - Sponsored ledger: per-user allocation, task budget and sponsor pool with atomic reservations
- **Web dashboard** (`apps/web`, React + Vite): Dashboard API client for login, keys, intents,
  tasks and reviews
- **Shared contracts** (`packages/contracts`): Zod schemas for every type crossing a package
  boundary
- **Test merchants** (`tests/merchants`): real x402 v2 merchants on Base Sepolia, one per scenario
  (honest, prompt injection, recipient change, subscription, off-intent, over limit, free,
  unsupported token), deployed publicly, plus a one-off buyer smoke test

## Repository layout

| Path                 | What                                                    |
| -------------------- | ------------------------------------------------------- |
| `apps/gateway`       | Gateway: MCP server, Dashboard API, pipeline, payments  |
| `apps/web`           | User dashboard                                          |
| `packages/contracts` | Shared Zod schemas and types                            |
| `packages/cli`       | Harness CLI (installs the plugin into an agent harness) |
| `packages/agent`     | Harness-side agent helpers                              |
| `harness-plugin/`    | Integrations for Claude Code, Codex and Cursor          |
| `tests/merchants`    | Real x402 test merchants                                |
| `docs/`              | Architecture and design docs                            |

## Getting started

Requires Node.js 22+ (see `.nvmrc`).

```bash
npm install
cp .env.example .env      # fill in secrets locally, never commit .env

npm run dev:gateway       # http://localhost:8787/health
npm run dev:web           # http://localhost:5173 (proxies /api and /auth to the gateway)
npm run dev:merchants     # http://localhost:4021/health
```

## Data and safety

- Testnet by default (Base Sepolia, test USDC). `PAYMENT_NETWORK=base-mainnet` pays real USDC
  on Base; no real personal data either way.
- The sponsor private key is a server-side secret read only by the Signer; agents and harnesses
  never receive it or a signed authorization.
- Merchant text is treated as untrusted data: only Screen reads it, never Judge, and it is never
  interpolated into another prompt.

## Built with

Open-source projects and services we build on:

- [x402](https://github.com/coinbase/x402) SDK (`@x402/core`, `@x402/evm`, `@x402/hono`,
  `@x402/fetch`) by Coinbase, and the x402.org testnet facilitator
- [Hono](https://hono.dev), [viem](https://viem.sh), [Zod](https://zod.dev),
  [better-sqlite3](https://github.com/WiseLibs/better-sqlite3),
  [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [React](https://react.dev), [Vite](https://vite.dev), [Vitest](https://vitest.dev),
  [TypeScript](https://www.typescriptlang.org), [tsx](https://tsx.is)
- [Jev](https://typesafe.ai) by TypeSafe AI for the Screen and Judge decisions
- Base Sepolia and Circle test USDC; [Railway](https://railway.com) for hosting the test merchants

## AI assistance

We used AI coding assistants (Claude) throughout the hackathon for design discussion, code,
tests and documentation. The agent instructions we gave them are versioned in `CLAUDE.md` files.
Every change was reviewed and merged by a team member through pull requests.

## Team

Daniel Zvolský, Ondřej Palouš, Petr Jeřábek, Radek Koblic, Luboš Harašta (CTU Blockchain Lab).
