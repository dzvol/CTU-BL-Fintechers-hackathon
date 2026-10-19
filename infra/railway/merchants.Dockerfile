# Test merchants for demos (x402 offers on Base Sepolia). Build context: repository root.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci --include=dev

ENV NODE_ENV=production
WORKDIR /app/tests/merchants
CMD ["node", "--import", "tsx", "src/index.ts"]
