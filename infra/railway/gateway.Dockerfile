# Gateway + dashboard in one service: the gateway serves apps/web/dist on its own origin, so the
# session cookie and CSRF origin check need no proxy. Build context: repository root.
FROM node:22-bookworm-slim

# better-sqlite3 falls back to compiling when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci --include=dev && npm run build -w @semanticauth/web

ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/apps/web/dist \
    DATABASE_PATH=/data/semanticauth.db
WORKDIR /app/apps/gateway
EXPOSE 8787
# node directly (not npm) so SIGTERM reaches the server on redeploys.
CMD ["node", "--import", "tsx", "src/index.ts"]
