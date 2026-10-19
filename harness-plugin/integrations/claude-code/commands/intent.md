---
description: Propose a SemanticAuth purchase intent for a task and get the approval link
argument-hint: '[what you need to buy and why]'
allowed-tools: mcp__plugin_semanticauth_gateway__get_task, mcp__plugin_semanticauth_gateway__get_intent_template, mcp__plugin_semanticauth_gateway__submit_intent
---

Use the semanticauth skill to prepare a purchase intent for this request:

$ARGUMENTS

1. Call `get_task`. If an active task already covers the request, tell the user and stop.
2. Call `get_intent_template` and fill it in with the lowest limits that cover the request
   (`task` = the request above, in the user's words).
3. Before submitting, show the user the purpose, allowed purchases and limits in 3–4 lines.
4. Call `submit_intent` and give the user the `approvalUrl`. Then end your turn; do not buy
   anything yet.
