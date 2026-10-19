# Operation states and errors

## `paid_fetch` states

| state                                       | paid?  | meaning                                                                                                                                          | retry?                                                               |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `delivered`                                 | yes/no | Content returned. Paid content only after the gateway verified the settlement on chain; free content (`reason: free_content`) needed no payment. | No. A repeat call returns the same operation and does not pay again. |
| `awaiting_review`                           | no     | The checks found something the user must decide (subscription, changed recipient, suspicious offer).                                             | Only after `check_review` returns `approved`, with the **same url**. |
| `blocked`                                   | no     | Policy (price, budget, unsupported offer), Screen (manipulation in merchant text) or Judge (does not match the intent) refused it.               | Never. Do not work around it.                                        |
| `closed`                                    | no     | The user rejected the review, it expired, or reconciliation proved nothing was paid.                                                             | Never.                                                               |
| `delivery_failed`                           | yes    | Paid, but the merchant returned no content.                                                                                                      | Never; it would pay twice. Show `settlement.explorerUrl`.            |
| `issued`, `submitted`, `unknown`, `settled` | maybe  | The signed authorization left the gateway. The amount counts as spent until reconciliation proves otherwise.                                     | Never. Check `get_task` later.                                       |

## `reason` codes

- BLOCK: `unsupported_offer`, `policy_limit_exceeded`, `insufficient_allocation`,
  `jev_unavailable`, `prompt_injection`, `off_intent`
- REVIEW: `recipient_change`, `subscription`, `suspicious_offer`
- ALLOW: `within_intent`, `free_content`

## Tool errors

A failed tool call returns `{ "error": { "code": "…", "message": "…" } }`.

| code                     | what to do                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| `invalid_request`        | Fix the arguments as `message` says. For limits: ask for less.              |
| `no_active_task`         | Submit an intent first.                                                     |
| `forbidden`, `not_found` | Wrong `intentId` / `operationId`. Call `get_task` to see the current state. |
| `not_implemented`        | That part of the gateway is not ready yet. Tell the user.                   |
| anything else            | Tell the user the gateway failed. Do not try to pay another way.            |

If the whole MCP request fails with HTTP 401 the key is invalid or revoked: ask the user to run
`semanticauth doctor` or update the plugin settings. HTTP 429 means too many requests: wait for
the user's next message before trying again.

## If the MCP server itself is unavailable

If the SemanticAuth tools are missing or fail to connect, tell the user to run
`semanticauth doctor` (or check `/mcp` in Claude Code). Never fall back to another way of paying.
