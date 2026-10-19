# Harness plugin (`harness-plugin/`, `packages/cli`, `packages/agent`)

Connects Claude Code, Codex and Cursor to the SemanticAuth gateway. Owner: member 1. This area
is isolated: it talks to the gateway only through its MCP tools and public API, and imports
nothing from `apps/`.

## Parts

- `harness-plugin/integrations/<harness>/`: files installed into a harness. For Claude Code that is
  `.claude-plugin/plugin.json`, `.mcp.json` and `skills/semanticauth/SKILL.md`; for Codex, the MCP
  config and skills; for Cursor, `mcp/` and `rules/`.
- `packages/agent/`: gateway client, MCP config generation, and per-harness adapters
  (`adapters/claude-code.ts`, `codex.ts`, `cursor.ts`).
- `packages/cli/`: the `semanticauth` command with `install`, `uninstall`, `auth`, `config` and
  `doctor` (`commands/`, `installers/`, `credentials/`).

## Rules

- The plugin holds no payment logic, wallet or keys other than the agent API key. Every decision
  is made and enforced by the gateway.
- The SKILL guides the agent but guarantees nothing, since the agent may ignore it. Never rely on
  the SKILL for anything security-relevant; if something must hold, it belongs in the gateway.
  Tell the user if you find such a gap.
- The SKILL must describe the flow from `docs/architecture/overview.md`: `get_intent_template` →
  `submit_intent` → tell the user to approve it in the dashboard → poll `get_intent_status` →
  search for sources yourself → `paid_fetch` → on REVIEW, tell the user and poll `check_review`.
  It must also say never to retry a payment that failed after it was sent.
- Store the API key in a user-level credential file with `0600` permissions (or an env var).
  Never write it into repo files or a project-level config that might get committed, and never
  print it in full.
- Installers are idempotent and reversible. `uninstall` removes exactly what `install` added and
  leaves the user's other MCP servers and settings untouched.
- `doctor` checks the config, gateway reachability and API key validity, and prints actionable
  fixes.
- Done means tested in a real Claude Code and a real Codex session, not only unit tests.
