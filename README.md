# SemanticAuth

Built during the hackathon.


## Getting started

Requires Node.js 22+ (see `.nvmrc`).

```bash
npm install
cp .env.example .env      # fill in secrets locally, never commit .env

npm run dev:gateway       # http://localhost:8787/health
npm run dev:web           # http://localhost:5173 (proxies /api and /auth to the gateway)
npm run dev:merchants     # http://localhost:4021/health
```

Checks (also run in CI):

```bash
npm run typecheck
npm test
npm run build
npm run format:check
```
