import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.MERCHANTS_PORT ?? 4021);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Test merchants listening on http://localhost:${info.port}`);
});
