# Test merchants and acceptance tests (`tests/`)

Owner: member 5.

## `tests/merchants`: real x402 merchants

- They speak the **real x402 protocol** and settle on **Base Sepolia** through the facilitator
  (`X402_FACILITATOR_URL`). No mocked 402 responses, no fake settlements: the demo shows real
  transactions on Basescan.
- They are deployed publicly over HTTPS so the cloud gateway can reach them. Keep the list of
  stable URLs in `tests/merchants/README.md`.
- The merchant's receiving address (`payTo`) comes from env and must never be the sponsor wallet.
  No private keys are needed to receive.
- Each endpoint represents one scenario from `docs/architecture/overview.md`, and its name says
  which, e.g. `/honest/market-snapshot`, `/injection/…`, `/recipient-change/…`,
  `/subscription/…`, `/off-intent/…`, `/over-limit/…`, `/free/…`, `/unsupported-network/…`. Note
  the expected verdict next to each route.
- Adversarial text (prompt injection, recipient change, subscription upsell) goes in the offer's
  description and body, where a real attacker would put it.
- Prices stay tiny (cents of test USDC) so the sponsor pool lasts the whole demo.

## `tests/acceptance`: end-to-end

- Runs against a deployed or local gateway plus the merchants above, one test per scenario,
  asserting the verdict, the operation state and (for ALLOW) the on-chain settlement.
- Never put real secrets or API keys in test files; read them from env.
