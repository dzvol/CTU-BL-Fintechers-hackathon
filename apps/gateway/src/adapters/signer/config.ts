import { SignerConfigSchema } from './schemas';
import type { SignerConfig } from './schemas';

/** Trusted MVP profile. Merchant fields may confirm it, but cannot replace this signing domain. */
export const SIGNER_PROFILE = Object.freeze({
  scheme: 'exact',
  network: 'eip155:84532',
  chainId: 84532,
  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  domainName: 'USDC',
  domainVersion: '2',
} as const);

/** Public configuration only. The private key is read exclusively inside createEoaSigner. */
export function loadSignerConfig(source: NodeJS.ProcessEnv = process.env): SignerConfig {
  const parsed = SignerConfigSchema.safeParse({
    expectedAddress: source.SPONSOR_ADDRESS || undefined,
    authorizationTtlSeconds:
      source.SIGNER_AUTHORIZATION_TTL_SECONDS === undefined
        ? undefined
        : Number(source.SIGNER_AUTHORIZATION_TTL_SECONDS),
  });
  if (!parsed.success) throw new Error('Invalid Signer configuration');
  return parsed.data;
}
