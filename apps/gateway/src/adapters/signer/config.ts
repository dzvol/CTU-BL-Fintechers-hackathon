import { PaymentNetworkSchema, type PaymentNetwork } from '@semanticauth/contracts';
import { SignerConfigSchema } from './schemas';
import type { SignerConfig } from './schemas';

/** What the Signer signs on one network. Merchant fields may confirm it, never replace it. */
export interface PaymentProfile {
  id: PaymentNetwork;
  /** For messages to people and agents. */
  label: string;
  scheme: 'exact';
  /** CAIP-2 id as x402 v2 writes it in `accepts[].network`. */
  network: `eip155:${number}`;
  chainId: number;
  /** Native USDC (Circle's registry). */
  token: `0x${string}`;
  /** EIP-712 domain of that USDC contract, read from the contract's name() and version(). */
  domainName: string;
  domainVersion: string;
}

export const PAYMENT_PROFILES: Readonly<Record<PaymentNetwork, Readonly<PaymentProfile>>> =
  Object.freeze({
    'base-sepolia': Object.freeze({
      id: 'base-sepolia',
      label: 'Base Sepolia',
      scheme: 'exact',
      network: 'eip155:84532',
      chainId: 84532,
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      domainName: 'USDC',
      domainVersion: '2',
    }),
    // Real money. The domain name differs from Sepolia's; a wrong one yields signatures that the
    // contract rejects only at settlement.
    'base-mainnet': Object.freeze({
      id: 'base-mainnet',
      label: 'Base',
      scheme: 'exact',
      network: 'eip155:8453',
      chainId: 8453,
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      domainName: 'USD Coin',
      domainVersion: '2',
    }),
  });

/** Sepolia unless PAYMENT_NETWORK names another network; an unknown name fails startup. */
export function loadPaymentNetwork(source: NodeJS.ProcessEnv = process.env): PaymentNetwork {
  const parsed = PaymentNetworkSchema.default('base-sepolia').safeParse(
    source.PAYMENT_NETWORK || undefined,
  );
  if (!parsed.success) {
    throw new Error(`PAYMENT_NETWORK must be one of: ${PaymentNetworkSchema.options.join(', ')}`);
  }
  return parsed.data;
}

/** Public configuration only. The private key is read exclusively inside createEoaSigner. */
export function loadSignerConfig(source: NodeJS.ProcessEnv = process.env): SignerConfig {
  const parsed = SignerConfigSchema.safeParse({
    network: loadPaymentNetwork(source),
    expectedAddress: source.SPONSOR_ADDRESS || undefined,
    authorizationTtlSeconds:
      source.SIGNER_AUTHORIZATION_TTL_SECONDS === undefined
        ? undefined
        : Number(source.SIGNER_AUTHORIZATION_TTL_SECONDS),
  });
  if (!parsed.success) throw new Error('Invalid Signer configuration');
  return parsed.data;
}
