---
description: Show the active SemanticAuth task and its remaining budget
allowed-tools: mcp__plugin_semanticauth_gateway__get_task
---

Call the SemanticAuth `get_task` tool and report to the user, briefly and in their language:

- whether there is an active task (`task` is null when there is none),
- budget, spent and reserved, converted from atomic units to USDC (divide by 1 000 000), and
  what remains (budget − spent − reserved).

Do not call `paid_fetch` or `submit_intent`.
