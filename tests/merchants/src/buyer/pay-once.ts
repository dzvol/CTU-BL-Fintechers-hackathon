/**
 * Manual smoke test: pays one test merchant once with a throwaway buyer wallet, without the
 * gateway, to prove the merchants settle for real on Base Sepolia.
 *
 *   npm run pay -w @semanticauth/test-merchants                    # /honest/market-snapshot
 *   npm run pay -w @semanticauth/test-merchants -- /subscription/market-snapshot
 *
 * The buyer key is a test-only wallet, never the sponsor key. This script bypasses every
 * SemanticAuth check on purpose, so it pays whatever the merchant asks.
 */
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

const EnvSchema = z.object({
  // MetaMask exports keys without the 0x prefix, so accept both forms.
  TEST_BUYER_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^(0x)?[0-9a-fA-F]{64}$/, 'expected a 32-byte hex private key (64 hex characters)')
    .transform((key) => (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`),
  MERCHANTS_BASE_URL: z.url().default('http://localhost:4021'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid buyer env:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const env = parsed.data;

const path = process.argv[2] ?? '/honest/market-snapshot';
const url = new URL(path, env.MERCHANTS_BASE_URL);

const account = privateKeyToAccount(env.TEST_BUYER_PRIVATE_KEY);
const client = new x402Client();
registerExactEvmScheme(client, { signer: account });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

console.log(`Buyer ${account.address} → GET ${url}`);

const res = await fetchWithPayment(url);
console.log(`HTTP ${res.status}`);
console.log(await res.text());

const paymentResponse = res.headers.get('payment-response');
if (paymentResponse) {
  const settle = decodePaymentResponseHeader(paymentResponse);
  console.log(`Settled: ${settle.success} on ${settle.network}`);
  if (settle.transaction) {
    console.log(`Basescan: https://sepolia.basescan.org/tx/${settle.transaction}`);
  }
  if (!settle.success) console.log(`Reason: ${settle.errorReason ?? 'unknown'}`);
} else {
  console.log('No PAYMENT-RESPONSE header: nothing was settled.');
}
