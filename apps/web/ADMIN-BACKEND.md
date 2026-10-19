# Read-only administration: gateway handoff

Status: frontend layout preparation, not live administration. No gateway or shared-contract changes are included. The current branch has no admin role, user-list repository method, admin API, billing model, or request-usage counters. Registration records already contain ID, email, name, createdAt and lastLoginAt.

## Current frontend behavior

Authenticated owners can open **Administration preview**. `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/plans`, and `/admin/activity` use the dashboard shell and table primitives. They show unavailable states, not mock records, zero totals, or data from the signed-in owner's endpoints relabeled as cross-user data. No `/api/admin` requests are made yet. There are no admin mutations. Unsupported plans, usage, wallet relationships and aggregate spending are marked coming soon.

The preview link is a temporary navigation affordance, not a permission. Before enabling live data, render the admin navigation only when the gateway reports the permission, guard all admin routes, and enforce that permission on the server for every request. Ordinary owners must then see access denied, rather than an empty user directory.

## Proposed authorization contract (requires gateway-owner agreement)

Add an optional `permissions: string[]` to the shared Me schema and `/api/me`; missing means no permissions. Use `admin:read` for read-only administration. Keep personal account APIs scoped to the session user. Permissions come from server-owned persisted authorization data, never browser storage, an email query parameter, agent input, or a client-set role. Provision the initial administrator through an explicit operator-controlled bootstrap process; no self-promotion endpoint is needed.

All `/api/admin/*` endpoints require the existing owner session plus `admin:read`. Reject unauthenticated callers with 401 and authenticated ordinary owners with 403. Agent API keys must not authorize these routes. Authorization must be checked before querying cross-user data. Return private/no-store cache headers. Use existing error envelopes; do not leak user existence on unauthorized requests.

## Proposed read endpoints

These are proposed contracts, not existing APIs. Add shared Zod response schemas in `@semanticauth/contracts`; the web owner can then add validated adapters in `src/api/admin.ts`. Do not duplicate shared API shapes in components.

| Endpoint                             | Parameters                                                                                                              | Response requirements                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/admin/overview`            | None initially                                                                                                          | `registeredUsers`, `activeApiKeys`, `activeTasks`, `asOf` from authoritative queries. Unsupported metrics must be null or omitted, never fabricated as zero.                                                       |
| `GET /api/admin/users`               | `q`, `cursor`, `limit`                                                                                                  | `{ items: AdminUserSummary[], nextCursor: string \| null }`. Each item: `id`, `email`, optional `name`, `createdAt`, `lastLoginAt`, `allocation`, `activeApiKeyCount`. Plan and usage omitted until supported.     |
| `GET /api/admin/users/:userId`       | Validated user ID                                                                                                       | `{ user: AdminUserSummary }`. Return 404 for a missing user only after admin authorization.                                                                                                                        |
| `GET /api/admin/users/:userId/keys`  | `cursor`, `limit`                                                                                                       | Paginated public ApiKey metadata: ID, name, prefix, creation/last-use/revocation timestamps. No raw secret, hash or session token.                                                                                 |
| `GET /api/admin/users/:userId/tasks` | `cursor`, `limit`, optional `status`                                                                                    | Paginated tasks with joined intent purpose. Preserve separate intent/task IDs and existing shared task states. Do not present current placeholder spent/reserved fields as authoritative usage.                    |
| `GET /api/admin/operations`          | `userId`, `taskId`, `from`, `to`, `verdict`, `state`, `cursor`, `limit`; payment/delivery filters need agreed semantics | Paginated Operation records plus explicit user/agent identity for each row. Preserve payment and delivery separately. Do not expose credentials, authorization payloads or unrestricted response bodies.           |
| `GET /api/admin/usage` — future      | `periodStart`, `periodEnd`, `userId`, `cursor`, `limit`                                                                 | Paginated per-user plan/usage summaries with stable period boundaries, plan ID, active key count, key limit, measured request count, request limit and `asOf`. Unsupported fields null with explicit availability. |

`allocation` and monetary aggregates must remain atomic USDC integer strings. Timestamps are ISO UTC. Counts are nonnegative integers. Use existing ID schemas. The usage endpoint is deferred; return 501 if intentionally reserved but not implemented. Do not silently return an empty successful report.

## Pagination and usage semantics

- Cap page size (proposed default 25, maximum 100); validate search and filter lengths. Use opaque cursors and a stable ordering such as createdAt plus ID. Document cursor/filter mismatch behavior.
- Search users by name/email; expose only profile data needed by the operator, not Google subject IDs or session records.
- Define whether request counts include MCP calls, paid_fetch attempts, cached repeats, failed requests and rejected calls. Define UTC reporting-period boundaries and reset rules before displaying quotas or enforcing paid plans.
- Persist plan assignments and meter usage server-side. The current Free/Go/Pro pricing UI is a product preview, not a billing source of truth.
- An issued or unknown payment counts as spent until reconciliation proves otherwise. Delivery is not settlement evidence. Do not total raw offer amounts and call that spending.
- Wallet relationships require separate wallet/agent entities and authorization bindings; the current single hackathon allowance is not such a model.

## Frontend connection work after contracts land

1. Consume the shared permission field and schemas. Hide the preview navigation from non-admins and require `admin:read` on every admin route.
2. Replace static unavailable table bodies with validated, session-authenticated GET adapters. Preserve loading, 403, 404, 501 and actual-empty states distinctly.
3. Implement cursor navigation and debounced user search; View user links use actual returned IDs. Add activity filters only for supported server query semantics.
4. Namespace queries under `['admin', ...]`, including filters and IDs. Cancel and clear admin caches immediately on permission loss, session expiry or logout. Never persist this cache to local storage.
5. Keep all mutations absent. Suspension, plan edits, allocation changes, role grants and credential revocation need separate authorization and audit design.

## Required gateway verification

Test 401 without a session; 403 for ordinary owners; no access using an agent key; valid admin lists across users; authorization before ID lookup; deterministic pagination/search; malformed IDs/filter/cursors; no credential fields in responses; correct counts and allocation precision. Verify permission removal denies subsequent reads. On the frontend, test route denial and clearing of previously cached admin data when permission is lost. Do not enable real user data behind a client-only gate.
