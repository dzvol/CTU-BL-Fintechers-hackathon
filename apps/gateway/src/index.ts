import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();

serve({ fetch: createApp(config).fetch, port: config.port }, (info) => {
  console.log(
    `SemanticAuth gateway listening on http://localhost:${info.port} (Jev variant: ${config.jevVariant.id})`,
  );
});
