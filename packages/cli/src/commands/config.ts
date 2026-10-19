import { normalizeGatewayUrl } from '@semanticauth/agent';
import { loadConfig, resolveGatewayUrl, saveConfig } from '../credentials/credential-store';
import { CliError, info, ok } from '../ui';

const KEYS = ['gateway_url'] as const;
type Key = (typeof KEYS)[number];

function assertKey(key: string): asserts key is Key {
  if (!(KEYS as readonly string[]).includes(key)) {
    throw new CliError(`Unknown key "${key}".`, `Allowed: ${KEYS.join(', ')}`);
  }
}

/** Plain HTTP only for local development; the API key travels in a header. */
export function validateGatewayUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('gateway_url must be an absolute URL, e.g. https://gateway.example.com');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new CliError('Outside localhost the gateway must use HTTPS.');
  }
  return normalizeGatewayUrl(value);
}

export function configGet(key?: string): void {
  if (!key) {
    info(JSON.stringify({ ...loadConfig(), effective_gateway_url: resolveGatewayUrl() }, null, 2));
    return;
  }
  assertKey(key);
  info(resolveGatewayUrl());
}

export function configSet(key: string, value: string): void {
  assertKey(key);
  saveConfig({ gateway_url: validateGatewayUrl(value) });
  ok(`${key} = ${resolveGatewayUrl()}`);
}
