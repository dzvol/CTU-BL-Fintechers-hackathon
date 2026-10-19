import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GATEWAY_URL,
  deleteApiKey,
  loadApiKey,
  resolveGatewayUrl,
  saveApiKey,
  saveConfig,
} from './credential-store';

const KEY = 'sa_testkeytestkeytestkeytestkey';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'semanticauth-cli-'));
  vi.stubEnv('SEMANTICAUTH_CONFIG_DIR', dir);
  vi.stubEnv('SEMANTICAUTH_API_KEY', '');
  vi.stubEnv('SEMANTICAUTH_GATEWAY_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('credential store', () => {
  it('stores the key readable only by the user', () => {
    const path = saveApiKey(KEY);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(loadApiKey()).toEqual({ key: KEY, source: 'file' });
    expect(deleteApiKey()).toBe(true);
    expect(loadApiKey()).toBeUndefined();
  });

  it('prefers the environment variable over the stored file', () => {
    saveApiKey(KEY);
    vi.stubEnv('SEMANTICAUTH_API_KEY', 'sa_fromenvfromenvfromenvfromenv');
    expect(loadApiKey()).toEqual({ key: 'sa_fromenvfromenvfromenvfromenv', source: 'env' });
  });

  it('resolves the gateway URL: flag → env → config → default', () => {
    expect(resolveGatewayUrl()).toBe(DEFAULT_GATEWAY_URL);
    saveConfig({ gateway_url: 'https://config.example.com' });
    expect(resolveGatewayUrl()).toBe('https://config.example.com');
    vi.stubEnv('SEMANTICAUTH_GATEWAY_URL', 'https://env.example.com/mcp');
    expect(resolveGatewayUrl()).toBe('https://env.example.com');
    expect(resolveGatewayUrl('https://flag.example.com/')).toBe('https://flag.example.com');
  });
});
