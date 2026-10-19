---
description: Propose a SemanticAuth purchase intent for a task and get the approval link
argument-hint: '[what you need to buy and why]'
allowed-tools: mcp__plugin_semanticauth_gateway__get_task, mcp__plugin_semanticauth_gateway__get_intent_template, mcp__plugin_semanticauth_gateway__submit_intent
---

Use the semanticauth skill to prepare a purchase intent for this request:

$ARGUMENTS

1. Call `get_task`. If an active task already covers the request, tell the user and stop.
2. Follow step 2 of the skill: check which intent fields the request leaves open (what may be
   bought, what must never be bought, total budget, maximum per purchase, number of purchases).
   If any is missing, ask for all of them in one message with suggested values and end your
   turn. Never pick the money limits yourself.
3. Call `get_intent_template` and fill it in (`task` = the request above, in the user's words;
   everything else exactly as the user gave or confirmed it).
4. Call `submit_intent`, show the purpose, allowed purchases and limits in 3–4 lines, and give
   the user the `approvalUrl`. Then end your turn; do not buy anything yet.
