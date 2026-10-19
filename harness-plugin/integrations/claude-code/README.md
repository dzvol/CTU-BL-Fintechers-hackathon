# SemanticAuth plugin for Claude Code

Connects Claude Code to the SemanticAuth gateway. The agent can propose an intent, wait for the
user's approval in the dashboard and buy paid content through `paid_fetch`. The plugin has **no
payment logic**: only the gateway holds the wallet, and it checks every purchase.

| File                             | Purpose                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `.claude-plugin/plugin.json`     | Manifest and `userConfig` (API key → OS secret store, gateway URL)                              |
| `.mcp.json`                      | Remote HTTP MCP server `gateway` → `${gateway_url}/mcp` with `Authorization: Bearer ${api_key}` |
| `skills/semanticauth/SKILL.md`   | Agent workflow: intent → approval → `paid_fetch` → reacting to operation states                 |
| `skills/semanticauth/reference/` | Intent examples, states and errors (loaded on demand)                                           |
| `commands/status.md`             | `/semanticauth:status`: active task and remaining budget                                        |
| `commands/intent.md`             | `/semanticauth:intent <what and why>`: prepares and submits an intent                           |

The agent sees the tools as `mcp__plugin_semanticauth_gateway__<tool>`.

## Install

With the CLI (recommended; it passes the key through stdin, not argv):

```bash
npx tsx packages/cli/src/index.ts auth
npx tsx packages/cli/src/index.ts install claude-code --gateway https://<gateway-host>
```

Manually in Claude Code, from a checkout:

```text
/plugin marketplace add ./harness-plugin
/plugin install semanticauth@semanticauth
```

Claude Code asks for the API key and gateway URL when the plugin is enabled. Change them later
with `/plugin` → SemanticAuth → Configure. For a single session without installing:
`claude --plugin-dir ./harness-plugin/integrations/claude-code`.

Check: `/mcp` in Claude Code shows `plugin:semanticauth:gateway` connected with 6 tools.

## Security note

The SKILL only guides the agent; it enforces nothing. Every rule in its "Never" section must be
enforced by the gateway (active task, limits, Screen/Judge, idempotency).
