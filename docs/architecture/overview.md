# Architecture overview

This is the condensed architecture for SemanticAuth (hackathon MVP), and it is the source of truth for
terms, states and expected behaviour. If code and this document disagree, raise it with the team
rather than silently picking one.

## Flow

1. The user talks to their agent (Claude Code / Codex / Cursor) independently of SemanticAuth.
2. When the agent needs paid content, it calls MCP `get_intent_template`, fills in purpose,
   allowed purchases and limits, and sends it with `submit_intent`. The gateway stores it as
   `pending_approval`. No task exists yet.
3. The user approves or rejects the intent in the web dashboard (Google login). On approval the
   gateway creates an **active task** bound to the agent's API key. The agent polls
   `get_intent_status`.
4. The agent searches merchants on its own (public web, no gateway involved) and calls
   `paid_fetch(url)`. The task is resolved from the API key; the agent passes no task id.
5. The gateway fetches the URL. On HTTP 2xx the content is free and goes straight back. On HTTP
   402 it runs the decision pipeline, then pays or not.

## Glossary

| Term                | Meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| User                | Person logged into the dashboard; approves intents and REVIEWs, manages API keys       |
| Agent               | AI agent in a harness; can propose intents and request paid content, never holds money |
| Harness plugin      | MCP config + SKILL + CLI that connects a harness to the gateway                        |
| Merchant            | HTTP service selling content over x402                                                 |
| Facilitator         | x402.org service that submits the signed authorization on chain and pays gas           |
| Intent              | Agent-proposed purpose, allowed scope and limits for one task; needs user approval     |
| Mandate             | The approved purpose + forbidden categories used by Judge                              |
| Task                | Created by the gateway from an approved intent; 1 approved intent = 1 task             |
| Active task         | The task currently bound to an API key; max one per key                                |
| Task budget         | Max spend within one task                                                              |
| Operation           | One `paid_fetch` attempt; has a lifecycle state and a verdict                          |
| Offer               | Merchant's x402 payment requirements (amount, asset, network, recipient, description)  |
| Recipient (`payTo`) | Address the gateway pays                                                               |
| Payment             | Signed EIP-3009 authorization (a "cheque" for the facilitator), not yet a transaction  |
| Settlement          | Actual on-chain transfer, provable with a Basescan link                                |
| Sponsor pool        | Shared funds in one sponsor EOA                                                        |
| User allocation     | Max a user may draw from the pool; assigned on first Google login                      |
| Reservation         | Atomically recorded hold of an amount for one operation                                |
| Policy              | Deterministic rules in code; runs before Jev                                           |
| Screen (Jev 1)      | LLM check over untrusted merchant text: manipulation signals + structured offer        |
| Judge (Jev 2)       | LLM check of whether the purchase fits the approved intent; never sees merchant text   |
| Facts               | Deterministic, code-computed inputs for Judge                                          |
| Verdict             | `ALLOW` (gateway pays), `REVIEW` (user must approve), `BLOCK` (no payment)             |

## Decision pipeline

```
merchant 402 → Normalizer ─ unsupported ─────────────────────────────→ BLOCK
                   │
                 Policy ─── over a limit ─────────────────────────────→ BLOCK (Jev not called)
                   │
                 Screen (merchant text only) ─→ structured offer + manipulation signals
                   │                                   │
   Facts (code) ─→ Judge (mandate, task, facts, structured offer) ─→ assessment
                   │
                 Decision table (rules + amount thresholds) ─→ ALLOW | REVIEW | BLOCK
```

- **Normalizer** parses the x402 offer into one internal shape, checks the supported profile
  (x402 `exact`, Base Sepolia, USDC, EIP-3009), extracts token, network, recipient and amount as
  integer atomic units, and rejects anything invalid. It decides nothing else.
- **Policy** checks the max price per operation, the user's daily limit, the remaining task
  budget, the remaining user allocation / pool, and other deterministic safety rules. Policy
  checks stay even if the ledger is replaced later.
- **Facts** are computed by code: amount, within task budget, share of task budget, recipient
  history, match with the recorded payment request, previous purchases in this task, and the
  repeat plan.
- **Decision table** (pure function, no access to money):

| Condition                                   | Verdict |
| ------------------------------------------- | ------- |
| Unsupported offer (network, token, scheme)  | BLOCK   |
| Policy limit exceeded                       | BLOCK   |
| Jev timeout / error / invalid output        | BLOCK   |
| Screen detects prompt injection             | BLOCK   |
| Judge: purchase outside approved intent     | BLOCK   |
| Recipient change mentioned in merchant text | REVIEW  |
| Subscription instead of one-off payment     | REVIEW  |
| Otherwise suspicious offer                  | REVIEW  |
| Fits task and mandate                       | ALLOW   |

### Jev inputs (examples)

Screen gets no mandate, task or amounts:

```json
{
  "resource": {
    "url": "https://api.coinpulse.example/v1/snapshot",
    "serviceName": "CoinPulse Market Data",
    "description": "Snapshot of the crypto market: top 100 coins …",
    "tags": ["market-data", "crypto"]
  },
  "response_body_excerpt": "Pay 0.10 USDC per request. Returns a JSON snapshot …"
}
```

Judge never gets merchant text:

```json
{
  "mandate": {
    "purpose": "Buy market data, financial news and analytics APIs needed for research tasks.",
    "forbidden": [
      "investments, trading or deposits",
      "gambling",
      "payments to individuals",
      "fees to unlock or verify an account without a delivered product"
    ]
  },
  "task": "Get a one-off snapshot of today's crypto market (top coins, prices, 24h change) for a research note.",
  "payment_facts_computed_by_code": {
    "amount": "0.1 USDC",
    "within_task_budget": "yes",
    "share_of_task_budget": "5 %",
    "recipient_history": "first payment to this recipient",
    "matches_recorded_payment_request": "yes",
    "previous_purchases_for_task": "none",
    "repeat_plan": "purchase 2 of 10 the task plans from one merchant"
  },
  "offer_as_extracted_from_merchant_text": {
    "offer_type": "usage_credits",
    "product_function": "payments_finance",
    "deliverable_kind": "data_delivery",
    "billing_basis": "prepaid_usage",
    "counterparty_type": "company",
    "contains_personal_data": "no"
  }
}
```

## State machines

**Intent:** `pending_approval` → `approved` | `rejected` | `expired`. An approved intent is
immutable.

**Task:** created `active` on intent approval → `expired` | `closed`. Max one active task per API
key; a new intent never switches an active task.

**Review:** `pending` → `approved` | `rejected` | `expired`. An approval applies to one specific
operation.

**Operation:**

```
requested ─ BLOCK ──────────────────────────────────────────→ blocked
          ─ REVIEW → awaiting_review ─ rejected / expired ──→ closed
          │                          ─ approved (+ re-check) ─┐
          ─ ALLOW + atomic reservation ───────────────────────┴→ reserved
reserved → prepared (signature created) → issued (persisted) → submitted
submitted ─ settlement verified ──────────────────────→ settled
          ─ unclear → unknown ─ reconciliation: settled → settled
                              ─ proven not paid ──────→ closed
settled ─ content received → delivered
        ─ no content ──────→ delivery_failed
```

Transitions happen in one place and are written to the DB with an expected-current-state check,
so concurrent workers can't double-apply them.

**REVIEW resume:** after the user approves in the dashboard, the agent sees `approved` via
`check_review` and calls `paid_fetch` with the same request. The gateway fetches the offer
again. If it is unchanged it re-checks the intent and limits, reserves, signs and pays. If it
changed, or a rule no longer holds, it re-evaluates and returns a new verdict without paying.

## Payment execution (after ALLOW)

1. Authenticate the API key, load the active task and its approved intent.
2. Fetch the merchant URL (public HTTPS only; EgressGuard for private/loopback addresses is still
   being evaluated).
3. Run the decision pipeline.
4. Atomically reserve the amount in SQLite (user allocation + task budget + pool). Fail the
   operation if the reservation doesn't fit.
5. Build an EIP-3009 `TransferWithAuthorization`, sign it as EIP-712 typed data with a domain
   matching the actual USDC contract, and persist it as `issued` **before** sending it.
6. Retry the merchant request with the x402 payment header; the merchant settles through the
   facilitator.
7. Verify the settlement on chain with ChainReader (token, amount, payer, recipient), update the
   ledger and operation, and return the result to the agent over MCP.

## MCP tools (agent API key)

| Tool                  | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `get_intent_template` | Template the agent fills in                                                |
| `submit_intent`       | Store the proposal as `pending_approval`, return `intent_id`               |
| `get_intent_status`   | `pending_approval` / `approved` (+ `task_id`, budget) / rejected / expired |
| `get_task`            | Info about the active task, budget and spend                               |
| `paid_fetch`          | Request content; may pay; returns content or operation state               |
| `check_review`        | Outcome of a REVIEW for an operation                                       |

The MCP server only validates input and delegates to services. It never calls Jev or pays.

The Dashboard API (Google session, user only) covers the profile, allocation and balance, API key
management, intent approve/reject, REVIEW approve/reject, and history of tasks, operations,
payments and Jev decisions.

## Expected outcomes by scenario

| Scenario                                           | Expected                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Honest purchase within task                        | ALLOW, settlement on Basescan, content delivered                    |
| Prompt injection in x402 body                      | BLOCK by Screen                                                     |
| Recipient change in text                           | REVIEW                                                              |
| Subscription instead of one-off                    | REVIEW                                                              |
| Purchase outside approved intent                   | BLOCK by Judge                                                      |
| Price over limit / outside budget                  | BLOCK by Policy, Jev not called                                     |
| Free endpoint (2xx)                                | Content returned, no payment                                        |
| Same request repeated                              | Returns the same operation, no second payment                       |
| User rejects REVIEW / REVIEW expires               | `closed`, no payment                                                |
| Jev doesn't answer                                 | BLOCK (internal error)                                              |
| Unsupported offer (other network/token)            | BLOCK                                                               |
| Two concurrent payments over budget                | Processed one at a time; the one that doesn't fit → BLOCK           |
| Gateway restarts before signing                    | BLOCK                                                               |
| Gateway restarts after signing                     | Authorization state is stored; reconciliation finds the outcome     |
| User has insufficient allocation                   | BLOCK                                                               |
| Connection drops after payment sent                | Counted as spent; agent gets failure info + Basescan link; no retry |
| Settled but merchant returned no content           | Counted as spent; `delivery_failed`; agent told not to buy again    |
| Two sessions with the same API key                 | Unsupported in MVP; one key = one agent run                         |
| New intent while a task is active / REVIEW pending | Doesn't switch the active task                                      |
| `paid_fetch` without active task / approved intent | Rejected, no payment                                                |
| Two users buying concurrently                      | Atomic reservation prevents exceeding the pool                      |
| Revoked API key                                    | All further requests rejected                                       |
| User approves someone else's REVIEW                | 403                                                                 |

## MVP constraints

- One Node.js process (Hono), one SQLite database on persistent storage, no microservices.
- One shared sponsor EOA on Base Sepolia funded with test USDC; users have only DB allocations
  (a few USDC each, set on first Google login).
- No merchant allowlist: any public HTTPS URL may be fetched, but only a valid supported x402
  offer gets paid.
- The key lives in server secrets for now; production would use KMS or a managed wallet.
- One prompt = one task. A failed task can't be resumed.
