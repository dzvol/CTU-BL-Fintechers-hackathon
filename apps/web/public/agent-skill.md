---
name: semanticauth-onboarding
description: Connect an agent to SemanticAuth and guide the owner through approving its first task.
---

# SemanticAuth agent onboarding

Guide the owner through the following steps. Do not request a private wallet key or seed phrase.

## Connect

1. Have the owner create an agent API key on the dashboard's Agent page. It is shown once.
2. Guide the owner to store it locally as SEMANTICAUTH_API_KEY using a secure environment or secret store. Do not ask them to paste the secret into chat. Never print, log, commit, or embed the key in a URL.
3. For this local hackathon app, the MCP endpoint is http://localhost:8787/mcp. Confirm the gateway is running on the agent's computer. A localhost address does not reach another machine. For a hosted gateway, ask the owner for its trusted HTTPS endpoint; do not guess one.
4. Configure the owner's chosen client. Ask before changing an existing client configuration.

For Codex, add the following to ~/.codex/config.toml:

```toml
[mcp_servers.semanticauth]
url = "http://localhost:8787/mcp"
bearer_token_env_var = "SEMANTICAUTH_API_KEY"
```

For Claude Code, after the environment variable is securely set:

```sh
claude mcp add --transport http semanticauth http://localhost:8787/mcp \
  --header "Authorization: Bearer $SEMANTICAUTH_API_KEY"
```

The Claude Code command expands the secret into client configuration; use the client's secure storage on a trusted machine. Never show the expanded command or its configuration in logs or chat. Restart/reconnect the client if required to load its environment and MCP configuration.

## Propose the first task

1. Read get_intent_template. Use the returned schema rather than inventing fields.
2. Ask the owner what task they want, their spending budget, maximum per purchase, expected purchase count, permitted purchases, and forbidden purchases.
3. Call submit_intent only after the owner provides those limits.
4. Direct the owner to Overview in the dashboard to review and approve. The agent cannot approve its own intent or a purchase review.
5. Use get_intent_status to check approval and get_task to read the active task. Do not submit another intent while an active task exists.
6. Only use paid_fetch for requests authorized by the approved task. Never perform a sample purchase merely to test setup.

## Limits and recovery

- One active API key is currently supported. Creating a replacement revokes the previous key. Revocation closes associated active work; already-issued payments may still complete.
- A purchase in REVIEW waits for the owner on Overview. Call check_review until it is decided; after approval call paid_fetch again with the same URL. Never bypass approval.
- An unknown payment outcome counts as spent. Do not retry a payment with an unknown outcome.
- If access is revoked or authentication fails, stop and direct the owner to the Agent page. Do not create or rotate credentials automatically.
