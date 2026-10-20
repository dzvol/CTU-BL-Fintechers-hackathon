import { base, baseSepolia } from 'viem/chains';
import { z } from 'zod';
import { ChainReaderConfigSchema } from './schemas';
import type { ChainReaderConfig } from './schemas';

/** Native USDC addresses from Circle's contract-address registry. */
export const CHAIN_READER_NETWORKS = {
  'base-sepolia': {
    chain: baseSepolia,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'base-mainnet': {
    chain: base,
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
} as const;

// An empty variable in .env means unset.
const network = z.preprocess(
  (value) => value || undefined,
  z.enum(['base-sepolia', 'base-mainnet']).optional(),
);
const envSchema = z.object({
  // Follows PAYMENT_NETWORK so the reader verifies on the chain the Signer signs for.
  CHAIN_READER_NETWORK: network,
  PAYMENT_NETWORK: network,
  CHAIN_READER_RPC_URL: z.string().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  CHAIN_READER_CONFIRMATIONS: z.coerce.number().int().positive().default(1),
  CHAIN_READER_TIMEOUT_MS: z.coerce.number().int().positive().max(2_147_483_647).default(10_000),
});

/** Optional environment loader; the factory also accepts explicit configuration. */
export function loadChainReaderConfig(source: NodeJS.ProcessEnv = process.env): ChainReaderConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) throw new Error('Invalid ChainReader environment configuration');
  const env = result.data;
  const selected = env.CHAIN_READER_NETWORK ?? env.PAYMENT_NETWORK ?? 'base-sepolia';
  const config = ChainReaderConfigSchema.safeParse({
    network: selected,
    rpcUrl:
      env.CHAIN_READER_RPC_URL ||
      (selected === 'base-sepolia' ? env.BASE_SEPOLIA_RPC_URL || undefined : undefined),
    confirmations: env.CHAIN_READER_CONFIRMATIONS,
    timeoutMs: env.CHAIN_READER_TIMEOUT_MS,
  });
  if (!config.success) throw new Error('Invalid ChainReader environment configuration');
  return config.data;
}
