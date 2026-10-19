# Jev inspection query mapping

Pure TypeScript mappers for the field mappings in `agent-docs/templates.md`.
Import the functions, output Zod schemas, and inferred types from `./index`.

```ts
import { mapToolCatalog, mapPaymentRequired, mapDataReceival } from './domain/normalizer';

const catalog = mapToolCatalog(originalToolSearchResponse);
const payment = mapPaymentRequired(originalPaymentRequiredResponse);
const delivery = mapDataReceival(originalResponseBody, 'application/json');

if (!payment.success) {
  // Stop processing this message; no partial inspection queries are returned.
  return { reason: payment.reason };
}
// Pass each payment.queries entry to Screen, which handles untrusted merchant data.
```

Functions take decoded message objects, not JSON strings or Fetch `Response` instances.
For HTTP responses, the caller reads/decodes the body and optionally passes the
`Content-Type` header as the second argument to a data mapper. MCP functions accept
the full JSON-RPC response, including `jsonrpc` and `result`.

| Function                                  | Original message                                                                                           | Output cardinality                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `mapToolCatalog(query)`                   | MCP `tools/list` response or one Bazaar tool discovery entry                                               | One query per tool                            |
| `mapPaymentRequired(query)`               | x402 v2 payment required, MCP payment required, Bazaar resources/search response, or MPP payment challenge | One query per resource/payment option         |
| `mapDataReceival(query, contentType?)`    | x402 decoded body with `data`, or MCP tool result                                                          | One query for x402; one per MCP content block |
| `mapMppDataReceival(query, contentType?)` | Entire decoded MPP response body (including plain text)                                                    | One query                                     |

Every function returns `{ success: true, queries: [...] }` or
`{ success: false, reason: 'invalid_input', issues: [...] }`. A malformed entry fails
the whole message; valid empty lists succeed with an empty query list. Missing
optional fields are omitted instead of replaced with invented values. In particular,
MPP challenges omit `resourceUrl`, `scheme`, and `serviceName`, and Bazaar resource
discovery omits descriptions and service names that are absent in its format.

MCP `annotations` and `_meta` become `annotation` and `metadata`. The complete MCP
payment `content` array becomes `additionalContent`. MCP delivery text maps to
`body.value`, with the original block `type` as `contentType`; non-text blocks are
preserved in full. Preserving a block does not imply Jev supports that media type.
The x402 data mapper extracts only `data`; the MPP data mapper retains the entire
body. This distinction is explicit to avoid mistaking a legitimate MPP `data` field
for an x402 envelope.

These functions prepare **Screen inputs**, retaining merchant text verbatim. They
do not select or approve a payment option, enforce the supported payment profile,
or produce the separate `NormalizedOffer` used by Policy and payment execution.
Network, amount, token, settlement headers, and other fields marked “No mapping”
are intentionally excluded from inspection queries. Callers must still validate
the supported payment profile and perform the gateway decision pipeline before
signing. Never send these inspection queries directly to Judge.
