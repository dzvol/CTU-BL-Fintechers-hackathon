import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeGoogle, testConfig } from './helpers';

const dist = mkdtempSync(join(tmpdir(), 'web-dist-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
mkdirSync(join(dist, 'privacy-policy'));
writeFileSync(join(dist, 'privacy-policy', 'index.html'), '<h1>Privacy policy</h1>');
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const app = createApp({ ...testConfig, webDistDir: dist }, { googleOAuth: fakeGoogle });

describe('dashboard served by the gateway', () => {
  it('answers client-side routes with index.html, never cached', async () => {
    for (const path of ['/', '/overview', '/tasks/int_x']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('id="root"');
      expect(res.headers.get('cache-control')).toBe('no-cache');
    }
  });

  it('serves static pages such as the privacy policy as themselves, readable without JS', async () => {
    for (const path of ['/privacy-policy', '/privacy-policy/']) {
      expect(await (await app.request(path)).text()).toContain('<h1>Privacy policy</h1>');
    }
  });

  it('caches hashed assets for good', async () => {
    const res = await app.request('/assets/app-abc123.js');
    expect(await res.text()).toBe('console.log(1)');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('keeps gateway paths as API answers', async () => {
    expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' });
    const missing = await app.request('/api/does-not-exist');
    expect(await missing.text()).not.toContain('id="root"');
    expect((await app.request('/api/me')).status).toBe(401);
  });

  it('does not serve the dashboard when no build is configured', async () => {
    const plain = createApp(testConfig, { googleOAuth: fakeGoogle });
    expect((await plain.request('/overview')).status).toBe(404);
  });
});
