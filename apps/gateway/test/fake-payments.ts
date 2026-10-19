import { generatePrivateKey } from 'viem/accounts';
import { vi } from 'vitest';
import type { ChainPayment, ChainReader, PaymentVerification } from '../src/adapters/chain-reader';
import { createEoaSigner } from '../src/adapters/signer';

/** The real Signer with a fresh throwaway key per test; no key is ever written down. */
export const testSigner = () => createEoaSigner({}, { readPrivateKey: generatePrivateKey });

export const settledOnChain = (payment: ChainPayment): PaymentVerification => ({
  status: 'settled',
  settlement: {
    txHash: payment.txHash,
    explorerUrl: `https://sepolia.basescan.org/tx/${payment.txHash}`,
  },
  chainId: payment.chainId,
  blockNumber: 1n,
  blockHash: `0x${'cd'.repeat(32)}`,
  confirmations: 1n,
  authorizationLogIndex: 0,
  transferLogIndex: 1,
});

/** A ChainReader that confirms every payment unless the test says otherwise. */
export function fakeChainReader(
  outcome: (payment: ChainPayment) => PaymentVerification = settledOnChain,
) {
  return { verifyPayment: vi.fn(async (payment: ChainPayment) => outcome(payment)) };
}

/** What createServices needs for payments, with chain reads that don't wait between tries. */
export const fakePayments = (chainReader: ChainReader = fakeChainReader()) => ({
  signer: testSigner(),
  chainReader,
  poolLimit: 20_000_000n,
  settlementChecks: { attempts: 3, delayMs: 0 },
});
