# Shared EOA Signer

`createEoaSigner(config?, dependencies?)` implements the server-only `Signer`
interface. It loads one sponsor EOA and exposes only its public `address` and
`signPayment(input)`. Signing uses viem locally; there is no RPC, payment submission,
database access, or MCP/dashboard endpoint in this adapter.

The implementation follows the supplied architecture PDFs:

- `architecture-semanticAuth-final-v2.pdf`, pages 8–9 and 15–16: output adapter,
  atomic reservation before signing, `reserved → prepared → issued → submitted`.
- `semanticauth-odpovednosti-v2.pdf`, pages 8 and 10: only PaymentGateway provides
  an already authorized operation to Signer; durable `issued` precedes x402 execution.
- `hackathon-v2.pdf`, page 3: a shared sponsor EOA, server secrets, and EIP-3009/EIP-712.

## Initialization and secrets

```ts
import { createEoaSigner, loadSignerConfig } from './adapters/signer';

// Server composition root only; pass the resulting interface to PaymentGateway.
const signer = createEoaSigner(loadSignerConfig());
// signer.address is public. Never expose the signPayment method as an agent tool.
```

The default secret provider reads `SPONSOR_PRIVATE_KEY` inside the adapter when
the signer is created. Supply it through the deployment platform's server secret
configuration. Both 32-byte hex forms, with and without `0x`, are accepted.
Missing, malformed, zero, or out-of-range keys prevent initialization.

`loadSignerConfig()` reads only public settings:

| Setting                            | Purpose                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SPONSOR_ADDRESS`                  | Optional expected public EOA address; initialization fails if the key belongs to another wallet |
| `SIGNER_AUTHORIZATION_TTL_SECONDS` | Local lifetime cap, default 120 seconds; allowed range 1–3600                                   |

A synchronous server secret provider can instead be injected as `readPrivateKey`.
The account is retained in a closure, never returned in configuration or results.
Provider/cryptography errors are replaced with generic errors without their message
or cause, and the signer does not log inputs, keys, signatures, or authorization bodies.
The returned signer interface is frozen. Recreate it when rotating the server secret.
JavaScript cannot guarantee erasure of the key from process memory; the backend
process and its server environment remain a trusted boundary.

## Signing an approved operation

```ts
const result = await signer.signPayment({
  operation: {
    id: operation.id,
    url: operation.url,
    state: 'reserved',
    verdict: 'ALLOW',
    offer: selected.offer,
  },
  reservation: {
    operationId: reservation.operationId,
    state: reservation.state,
    amount: reservation.amount, // bigint in atomic units
  },
  requirements: selected.requirements,
});

if (!result.ok) {
  // Stop payment execution. The result contains only a machine-readable reason.
  return;
}

// result.paymentPayload is INTERNAL: a signed authorization, not agent-visible content.
// PaymentGateway moves reserved → prepared and persists the exact payload/header as issued
// before passing it to x402Transport.fetchWithPayment(...).
```

PaymentGateway must supply snapshots from its own repositories after the full
Policy/Screen/Judge decision and a committed reservation. The adapter validates
these snapshots but cannot prove the database state itself. It verifies:

- operation state `reserved`, verdict `ALLOW`, reservation state `reserved`;
- matching reservation/operation IDs and identical reserved/approved amount;
- x402 `exact`, `eip155:84532`, and native Base Sepolia USDC;
- identical normalized and merchant recipient/amount, and matching operation/resource URLs;
- merchant domain metadata `extra.name = USDC`, `extra.version = 2`, and an absent
  or explicit `eip3009` transfer method. Permit2 and other profiles are rejected.

The trusted signing domain is pinned to chain ID 84532, USDC contract
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, name `USDC`, and version `2`.
Merchant metadata cannot override it. The [x402 EIP-3009 implementation](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/src/exact/client/eip3009.ts)
describes the wire format; signing uses [viem EIP-712](https://viem.sh/docs/accounts/local/signTypedData).
The configurable mainnet ChainReader does not enable mainnet signing.

Each authorization contains the shared EOA as `from`, the approved recipient as
`to`, exact atomic `value`, `validAfter = 0`, and a cryptographically random 32-byte
nonce. `validBefore` is the server UTC time in seconds plus the smaller of the
local lifetime cap and the merchant's `maxTimeoutSeconds`. EIP-712 numeric fields
are `bigint`; the resulting x402 JSON represents all authorization numbers as
decimal-integer strings.

## Results and execution boundary

`signPayment()` returns `{ ok: true, paymentPayload }` or
`{ ok: false, reason }`. Reasons: `invalid_input`, `unsupported_offer`,
`offer_mismatch`, `reservation_mismatch`, and `signing_failed`.

The success payload contains `x402Version`, a minimal `resource.url`, the selected
`accepted` payment requirements, and `payload: { signature, authorization }`.
It can be passed directly to the existing `encodePaymentSignature()` transport
helper. It contains no private key, account object, or secret-provider reference.

Only PaymentGateway may call `signPayment()`. It remains responsible for task and
intent validity, repository ownership, reservation/state concurrency, storing the
exact signed authorization as `issued`, and keeping all signed data out of MCP and
dashboard responses. Sign once per operation and reuse the persisted authorization;
the stateless signer does not replace operation idempotency or safe persistence.
Never automatically sign a replacement after an uncertain payment result.

`PaymentGateway.executePayment()` is currently a separate TODO. This change supplies
the signer adapter and its interface without changing the orchestrator or database.
Failure handling remains task closure without payment recovery.

```bash
npm test -w @semanticauth/gateway -- signer
```

Tests use fresh unfunded synthetic keys, cryptographically recover and verify real
signatures, reject tampering, and check secret isolation. No real wallet, network,
or blockchain transaction is used.
