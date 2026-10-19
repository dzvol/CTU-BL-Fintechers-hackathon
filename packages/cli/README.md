# semanticauth CLI

Installs and configures SemanticAuth for Claude Code and Codex. There is no build step; run it
from a repo checkout:

```bash
alias semanticauth="npx tsx $(pwd)/packages/cli/src/index.ts"

semanticauth auth                         # store the API key (masked prompt), verify via /v1/whoami
semanticauth config set gateway_url https://<gateway-host>
semanticauth install claude-code          # marketplace + plugin + key into Claude Code (secret store)
semanticauth install codex                # ~/.codex/config.toml + SKILL into ~/.agents/skills
semanticauth run codex                    # Codex with the key in SEMANTICAUTH_API_KEY
semanticauth doctor                       # what is wrong and how to fix it
semanticauth uninstall claude-code|codex  # removes exactly what install added
```

| Where                                     | What                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `~/.config/semanticauth/credentials.json` | API key, mode 600 (`SEMANTICAUTH_API_KEY` overrides it)                                      |
| `~/.config/semanticauth/config.json`      | `gateway_url` (`--gateway` and `SEMANTICAUTH_GATEWAY_URL` override it)                       |
| `~/.codex/config.toml`                    | block between `# >>> semanticauth` and `# <<< semanticauth`, `.bak-*` backup before a change |
| `~/.agents/skills/semanticauth/`          | SKILL for Codex (marker file `.semanticauth-managed`)                                        |

Why `run codex`: Codex doesn't accept a token inline for HTTP MCP servers, only the name of an
environment variable (`bearer_token_env_var`).

The key never goes into command arguments (they show up in the process list) and is never
printed in full. Non-interactive use: `echo "$KEY" | semanticauth auth`.
