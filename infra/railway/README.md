# Deploying to Railway

Two services from this repository, each built from its Dockerfile here:

| Service     | What it runs                                          | Config file                     | Needs               |
| ----------- | ----------------------------------------------------- | ------------------------------- | ------------------- |
| `gateway`   | Gateway API, MCP endpoint and the dashboard (one URL) | `/infra/railway/gateway.json`   | a volume at `/data` |
| `merchants` | Test x402 merchants for demos                         | `/infra/railway/merchants.json` | `MERCHANT_PAY_TO`   |

The gateway serves the built dashboard itself (`WEB_DIST_DIR`), so the session cookie and the
CSRF origin check work without a proxy. Agents run on people's own machines and connect to
`https://<gateway domain>/mcp`.

## Before going public

- Use a **fresh sponsor wallet**. Fund it with Base Sepolia USDC and set `SPONSOR_POOL_USDC` at or
  below its balance: anyone who signs in gets `USER_ALLOCATION_USDC` from that pool.
- Keep `numReplicas` at 1. SQLite, the rate limiter and restart recovery assume one process.
- **Real money:** `PAYMENT_NETWORK=base-mainnet` pays real USDC on Base. Fund the sponsor wallet
  with mainnet USDC, set `SPONSOR_ADDRESS` (required on mainnet), and keep
  `USER_ALLOCATION_USDC` and `SPONSOR_POOL_USDC` small: every Google sign-in can spend its
  allocation. The demo merchants are Sepolia-only, so their offers are blocked on mainnet.

## Steps

1. **Project:** Railway → New project → Deploy from GitHub repo → this repository.
2. **Gateway service:** Settings → Config-as-code → `/infra/railway/gateway.json`. Add a volume
   mounted at `/data`. Networking → Generate domain, e.g. `https://semanticauth.up.railway.app`.
3. **Gateway variables** (Variables tab; seal the secrets):

   ```
   WEB_BASE_URL=https://<gateway domain>
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…                     # sealed
   GOOGLE_REDIRECT_URI=https://<gateway domain>/auth/google/callback
   SESSION_SECRET=<openssl rand -hex 32>      # sealed
   JEV_API_KEY=…                              # sealed
   JEV_VARIANT=baseline
   SPONSOR_PRIVATE_KEY=0x…                    # sealed, the fresh wallet
   SPONSOR_ADDRESS=0x…
   PAYMENT_NETWORK=base-sepolia               # base-mainnet = real USDC, see "Before going public"
   USER_ALLOCATION_USDC=5
   SPONSOR_POOL_USDC=20
   ```

   `NODE_ENV`, `DATABASE_PATH` and `WEB_DIST_DIR` come from the Dockerfile. Leave
   `X402_ALLOW_HTTP_LOCALHOST` unset: deployed merchants are HTTPS.

4. **Google Cloud Console** → the OAuth client → add the redirect URI from step 3. While the
   consent screen is in _Testing_, only listed test users can sign in; publish it to let anyone in.
5. **Merchants service:** add a second service from the same repo, config
   `/infra/railway/merchants.json`, variable `MERCHANT_PAY_TO=0x…` (any address you control, never
   the sponsor wallet), then generate a domain.
6. **Check:** `https://<gateway domain>/health` answers `{"status":"ok"}`, Google sign-in works,
   create a key on the Agent page, then on your machine:

   ```bash
   semanticauth config set gateway_url https://<gateway domain>
   semanticauth auth
   semanticauth install claude-code   # or codex
   semanticauth doctor
   ```

Every push to the connected branch redeploys. The database lives on the volume and survives it.

## Build locally

```bash
docker build -f infra/railway/gateway.Dockerfile -t semanticauth-gateway .
docker run --rm -p 8787:8787 -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e WEB_BASE_URL=http://localhost:8787 semanticauth-gateway
```
