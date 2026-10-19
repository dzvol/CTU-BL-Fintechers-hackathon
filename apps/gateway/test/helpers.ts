import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { GoogleOAuthClient } from '../src/adapters/google-oauth/google-oauth-client';
import { createApp } from '../src/app';
import type { Config } from '../src/config';

export type TestApp = ReturnType<typeof createApp>;

export const testConfig: Config = {
  port: 0,
  webBaseUrl: 'http://localhost:5173',
  databasePath: ':memory:',
  google: undefined,
  sessionSecret: 'x'.repeat(64),
  secureCookies: false,
  userAllocation: 2_000_000n,
};

/** Fake Google: the callback `code` becomes the Google account id, so tests can log in as anyone. */
export const fakeGoogle: GoogleOAuthClient = {
  authorizationUrl: ({ state }) => `https://google.test/auth?state=${state}`,
  exchangeCode: async ({ code }) => ({ googleSub: code, email: `${code}@example.com` }),
};

export const createTestApp = () => createApp(testConfig, { googleOAuth: fakeGoogle });

/** name=value pairs from Set-Cookie, ready for a Cookie header. */
export function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

/** Runs the OAuth flow for `googleSub`; returns both responses and the session cookie. */
export async function login(app: TestApp, googleSub = 'alice') {
  const start = await app.request('/auth/google/login');
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const callback = await app.request(`/auth/google/callback?code=${googleSub}&state=${state}`, {
    headers: { cookie: cookiesFrom(start) },
  });
  return { start, callback, sessionCookie: cookiesFrom(callback) };
}

/** Dashboard request as a logged-in user, the way the browser sends it. */
export function asUser(app: TestApp, sessionCookie: string, path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      cookie: sessionCookie,
      origin: testConfig.webBaseUrl,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

/** Logs in and creates an agent API key; returns the raw key. */
export async function createAgentKey(app: TestApp, googleSub = 'alice') {
  const { sessionCookie } = await login(app, googleSub);
  const res = await asUser(app, sessionCookie, '/api/keys', {
    method: 'POST',
    body: JSON.stringify({ name: 'claude-code' }),
  });
  const { key, apiKey } = (await res.json()) as { key: string; apiKey: { id: string } };
  return { key, apiKeyId: apiKey.id, sessionCookie };
}

/** A real MCP client talking to the in-process app over Streamable HTTP. */
export async function connectMcp(app: TestApp, key: string) {
  const client = new Client({ name: 'test-agent', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('http://gateway.test/mcp'), {
    fetch: async (url, init) => app.request(url.toString(), init),
    requestInit: { headers: { authorization: `Bearer ${key}` } },
  });
  await client.connect(transport);
  return client;
}
