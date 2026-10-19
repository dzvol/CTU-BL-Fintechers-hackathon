# x402 HTTP transport

`createHttpX402Transport(config?)` implements `X402Transport`. It performs HTTP I/O
only. Wire headers follow the [x402 v2 HTTP specification](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md).

- `fetchResource(request)` performs one unpaid HTTP request.
- `fetchWithPayment(request, paymentSignature)` performs one explicit request with
  the previously issued `PAYMENT-SIGNATURE` header.
- `encodePaymentSignature(payload)` validates and base64-encodes the complete
  x402 v2 payment payload. Encoding does not sign or approve a payment.

The request contains `url`, optional `method` (default `GET`), optional `headers`,
and an optional repeatable string `body`. Reuse the same request when paying.
Payment headers are rejected in ordinary request headers. Responses never trigger
automatic payment, retries, or redirects. The paid call forwards the exact encoded
header without reserializing it.

```ts
import { createHttpX402Transport, encodePaymentSignature } from './adapters/x402';
import { mapDataReceival, mapPaymentRequired } from './domain/normalizer';

const transport = createHttpX402Transport();
const request = { url: 'https://merchant.example/honest/market-snapshot' };
const initial = await transport.fetchResource(request);

if (initial.kind === 'payment_required') {
  const screenQueries = mapPaymentRequired(initial.normalizerInput);
  // initial.paymentRequired retains all offers, amounts, networks, assets, and metadata.
  // initial.response.body and bodyText retain the separate untrusted 402 body.
}

// In PaymentGateway, AFTER the full decision pipeline, atomic reservation, and signing:
// const signature = encodePaymentSignature(signedPaymentPayload);
// await persistIssued(operationId, signature); // before it leaves the gateway
// const paid = await transport.fetchWithPayment(request, signature);
// if (paid.kind === 'content') {
//   const screenQueries = mapDataReceival(paid.normalizerInput, paid.response.contentType);
//   // Independently verify settlement through ChainReader before marking the operation settled.
// }
```

## Results and normalizer inputs

| `kind`             | Meaning                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `payment_required` | HTTP 402 with structurally valid x402 v2 requirements                                     |
| `content`          | HTTP 2xx; free or paid according to the method used                                       |
| `http_error`       | Other HTTP statuses, including redirects                                                  |
| `invalid_response` | Invalid payment requirements or malformed settlement metadata                             |
| `transport_error`  | Timeout, network/read failure, or response exceeding the byte limit                       |
| `invalid_request`  | Invalid request, unsupported URL, or malformed/mismatched payment signature; nothing sent |

Received responses retain status, URL, headers, content type, original bytes,
decoded JSON/text, and body format. Binary content is preserved as original bytes
and exposed as base64 in `body`. An empty body has format `empty` and value `null`;
the orchestrator decides whether a paid empty body is `delivery_failed`.

For `payment_required`, pass `normalizerInput` to `mapPaymentRequired`. This is the
decoded `PAYMENT-REQUIRED` object plus `additionalContent` containing the separate
response body, so injection text outside the header is screened too. The canonical
header takes precedence over the body. Body-only v2 offers are accepted for
compatibility with the templates; a malformed header never falls back to the body.

For every other received response, pass `normalizerInput` to `mapDataReceival`, with
`response.contentType` as the optional second argument. It wraps the **entire**
merchant body as `{ data: body }`. This lets the normalizer handle the arbitrary
application JSON delivered by `tests/merchants`, plain text, and binary content,
without assuming the merchant itself uses a `data` wrapper. Unknown media support
must be handled by the Screen caller.

`paymentResponse` reports `absent`, `valid`, or `invalid`. Here `valid` means the
`PAYMENT-RESPONSE` header has a valid wire structure; it is a merchant claim, not
proof of settlement. Both success and failure metadata are preserved.

`paymentAttempted` is true once fetch was invoked with the authorization. A timeout,
connection drop, or HTTP error after that point must not release funds or cause an
automatic retry. Ledger/reconciliation and ChainReader determine the outcome.

## Configuration and boundaries

Defaults: HTTPS, 15-second timeout (including body reading), 2 MiB response limit.
`allowHttpLocalhost: true` permits HTTP only for `localhost`, `127.0.0.1`, and `[::1]`,
for example `http://localhost:4021/honest/market-snapshot`. Inject `fetch` for offline
tests. No environment variables or dependencies are added.

The service must enforce the supported exact/Base Sepolia/USDC/EIP-3009 profile,
run the full authorization pipeline, bind the signature to the approved request,
and persist it before calling the paid method. The transport does not call Signer,
Jev, the facilitator, the database, or ChainReader. DNS/IP egress filtering remains
the separate EgressGuard responsibility described in the architecture. Do not
return the internal transport response directly to an agent or dashboard.

`services/payment-gateway/payment-gateway.ts` remains the existing orchestration
stub; wire this interface into that service when its payment workflow is implemented.
