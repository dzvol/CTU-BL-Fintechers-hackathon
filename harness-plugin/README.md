# End-to-end setup: from a fresh clone to Claude Code talking to the gateway

This guide takes you from an empty machine to an agent in Claude Code (or Codex) that sees the
six SemanticAuth MCP tools. Follow the steps in order; each one ends with a check.

> **Current state of `main`:** login, API keys, `/v1/whoami` and the MCP endpoint work. The MCP
> tools themselves (`get_intent_template`, `submit_intent`, `get_intent_status`, `get_task`,
> `paid_fetch`, `check_review`) are still stubs that return `not_implemented`. You can set up and
> verify the whole connection today; real purchases arrive when the gateway services are done.

## Overview

```
Claude Code / Codex ──MCP (Bearer API key)──▶ gateway :8787 ◀──/api, /auth── dashboard :5173
        ▲                                         ▲                               ▲
   plugin + SKILL                         semanticauth CLI                 Google login,
 (harness-plugin/)                     (auth, install, doctor)            creates API key
```

1. Run the gateway and the dashboard.
2. Log in to the dashboard with Google and create an agent API key.
3. Store the key with the `semanticauth` CLI.
4. Install the plugin into Claude Code (or Codex).
5. Verify.

## 0. Prerequisites

| What                   | Why                                      | Check              |
| ---------------------- | ---------------------------------------- | ------------------ |
| Node.js 22+ (`.nvmrc`) | Everything runs on Node via `tsx` / Vite | `node -v`          |
| Google account         | Dashboard login, needed to create a key  |                    |
| Claude Code            | The harness                              | `claude --version` |
| Codex (optional)       | Second supported harness                 | `codex --version`  |

Install Claude Code if you don't have it: `npm i -g @anthropic-ai/claude-code`.

## 1. Install dependencies and create `.env`

```bash
npm install
cp .env.example .env
```

`.env` holds secrets. It is git-ignored; never commit it and never paste it anywhere.

### 1a. Google OAuth (required to log in)

Without these values the gateway still starts, but login answers
`503 google_oauth_not_configured`, so you cannot create an API key.

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or pick a project.
2. **APIs & Services → OAuth consent screen**: user type _External_, fill in the app name and
   your e-mail, and add yourself (and teammates) as **test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:5173/auth/google/callback`
4. Copy the client ID and secret into `.env`:

```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/google/callback
```

The redirect URI goes through the Vite dev server on port 5173, which proxies `/auth` and `/api`
to the gateway. It must match the value in Google Cloud exactly.

### 1b. Session secret (recommended)

```bash
openssl rand -hex 32     # paste the output into SESSION_SECRET= in .env
```

Without it the gateway generates a random secret per process, so every restart logs you out.
It is required when `NODE_ENV=production`.

### 1c. Everything else

The defaults in `.env.example` work for local development (`PORT=8787`,
`WEB_BASE_URL=http://localhost:5173`, SQLite in `apps/gateway/data/`). The Jev and payment
variables (`JEV_*`, `SPONSOR_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `USDC_ADDRESS`,
`X402_FACILITATOR_URL`) are not read by the gateway yet; leave them empty until the payment and
Jev adapters land. `SPONSOR_PRIVATE_KEY` is a server-only secret: never share it with an agent.

## 2. Run the gateway and the dashboard

Two terminals, both from the repo root:

```bash
npm run dev:gateway      # http://localhost:8787
npm run dev:web          # http://localhost:5173
```

Optional, for later payment tests: `npm run dev:merchants` (test x402 merchants on :4021).

**Check:** http://localhost:8787/health answers, and the gateway log does **not** say
`GOOGLE_* env not set`.

To start over with an empty database: `npm run db:reset`.

## 3. Create an API key

1. Open http://localhost:5173 and log in with Google (as a test user from step 1a).
2. Click **Create API key**. The key starts with `sa_` and is shown **only once**; copy it now.

One user has one active key: creating a new key revokes the previous one, so every harness
configured with the old key stops working until you update it.

## 4. Store the key with the CLI

The CLI has no build step; run it through `tsx` from the repo root:

```bash
alias semanticauth="npx tsx $(pwd)/packages/cli/src/index.ts"

semanticauth auth            # paste the key (masked); verified via GET /v1/whoami
```

**Check:** it prints `Key sa_XXXXXXX… verified against http://localhost:8787 (your@email)`.
The key is saved to `~/.config/semanticauth/credentials.json` with mode 600.

Gateway somewhere else? `semanticauth config set gateway_url https://<host>` (HTTPS is required
outside localhost).

## 5a. Install into Claude Code

Pick one:

**CLI (recommended).** It adds the marketplace, installs the plugin and passes the key through
stdin:

```bash
semanticauth install claude-code
```

**Manually inside Claude Code**, started from the repo root:

```text
/plugin marketplace add ./harness-plugin
/plugin install semanticauth@semanticauth
```

Claude Code asks for the API key and the gateway URL (`http://localhost:8787`) and keeps the key
in the OS secret store. Change them later with `/plugin` → SemanticAuth → Configure.

**One session only, nothing installed:**

```bash
claude --plugin-dir ./harness-plugin/integrations/claude-code
```

**Check:** in Claude Code run `/mcp`: `plugin:semanticauth:gateway` is connected with 6 tools.
In a session that was already running, run `/reload-plugins` first.

## 5b. Install into Codex (optional)

```bash
semanticauth install codex   # writes a managed block to ~/.codex/config.toml + SKILL
semanticauth run codex       # starts Codex with SEMANTICAUTH_API_KEY set
```

Codex only reads the key from an environment variable, so start it through `semanticauth run
codex` (or export `SEMANTICAUTH_API_KEY` yourself in your shell profile).

## 6. Verify everything

```bash
semanticauth doctor
```

It checks Node, the key, gateway reachability, the 6 tools, the active task and both harness
installs, and prints a fix for each problem.

Then ask Claude something that needs paid content, e.g. _"Buy me a snapshot of today's crypto
market."_ It should load the `semanticauth` skill and call `get_task` / `get_intent_template`
(today they answer `not_implemented`).

## Troubleshooting

| Symptom                                                | Fix                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Login says `google_oauth_not_configured`               | `GOOGLE_*` missing in `.env`; restart `npm run dev:gateway` after editing it.                  |
| Google: `redirect_uri_mismatch`                        | The redirect URI in Google Cloud must be exactly `http://localhost:5173/auth/google/callback`. |
| Google: "access blocked" / app not verified            | Add your account as a test user on the OAuth consent screen.                                   |
| Logged out after every gateway restart                 | Set `SESSION_SECRET` in `.env`.                                                                |
| `semanticauth auth`: "rejected the key"                | Key revoked (a newer key exists) or mistyped. Create a new one in the dashboard.               |
| `semanticauth auth`: "not reachable"                   | Gateway not running or wrong URL: `semanticauth config get`.                                   |
| `/mcp` shows the server as failed                      | Run `semanticauth doctor`; check the key and URL in `/plugin` → SemanticAuth → Configure.      |
| `install claude-code` warns it could not save settings | Enter the key manually via `/plugin` → SemanticAuth → Configure.                               |
| `npx tsx` is slow or asks to install                   | Run `npm install` in the repo root first.                                                      |

## Uninstall

```bash
semanticauth uninstall claude-code   # plugin + marketplace
semanticauth uninstall codex         # only our block in config.toml + our SKILL folder
semanticauth auth --logout           # delete the stored key
```

## Where things live

| Path                                       | What                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| `harness-plugin/integrations/claude-code/` | Claude Code plugin: manifest, `.mcp.json`, SKILL, commands |
| `harness-plugin/integrations/codex/`       | Manual Codex config example                                |
| `packages/cli/`                            | `semanticauth` CLI ([README](../packages/cli/README.md))   |
| `packages/agent/`                          | Gateway client and harness adapters used by the CLI        |
| `docs/architecture/overview.md`            | Flow, glossary, state machines: the source of truth        |
