import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadEnv } from './env';
import { SCENARIOS } from './scenarios';

const env = loadEnv();

serve({ fetch: createApp(env).fetch, port: env.MERCHANTS_PORT }, (info) => {
  console.log(`Test merchants listening on http://localhost:${info.port}`);
  for (const s of SCENARIOS) {
    console.log(`  ${s.expected.padEnd(6)} ${s.path}`);
  }
});
