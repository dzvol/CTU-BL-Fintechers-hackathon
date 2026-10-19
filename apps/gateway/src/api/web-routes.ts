import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, Hono, MiddlewareHandler, Next } from 'hono';

// Gateway paths; a missing one must stay a 404 instead of turning into the dashboard page.
const GATEWAY_PATH = /^\/(api|auth|mcp|v1|health)(\/|$)/;

/** Skips gateway paths and stamps the cache policy on whatever the handler served. */
const dashboardOnly =
  (handler: MiddlewareHandler, cacheControl: (path: string) => string) =>
  async (c: Context, next: Next) => {
    if (GATEWAY_PATH.test(c.req.path)) return next();
    const res = await handler(c, next);
    if (res instanceof Response) res.headers.set('cache-control', cacheControl(c.req.path));
    return res;
  };

/**
 * Serves the built dashboard on the gateway's origin: hashed assets are cached for good, every
 * other path gets index.html so client-side routes survive a reload.
 */
export function mountDashboard(app: Hono, root: string) {
  app.get(
    '*',
    dashboardOnly(serveStatic({ root }), (path) =>
      path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    ),
  );
  app.get(
    '*',
    dashboardOnly(serveStatic({ root, path: 'index.html' }), () => 'no-cache'),
  );
}
