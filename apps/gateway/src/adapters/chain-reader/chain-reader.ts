import type { Settlement } from '@semanticauth/contracts';
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  toEventSelector,
  TransactionReceiptNotFoundError,
} from 'viem';
import type { Hash, Hex } from 'viem';
import { z } from 'zod';
import { CHAIN_READER_NETWORKS } from './config';
import {
  ChainBlockSchema,
  ChainPaymentSchema,
  ChainReaderConfigSchema,
  ChainReceiptSchema,
} from './schemas';
import type { ChainPayment, ChainReaderConfig, ChainReceipt } from './schemas';

/** Small injectable RPC boundary. Returned RPC data is validated before use. */
export interface ChainReaderRpc {
  getChainId(): Promise<unknown>;
  getTransactionReceipt(input: { hash: Hash }): Promise<unknown>;
  getBlockNumber(input: { cacheTime: number }): Promise<unknown>;
  getBlock(input: { blockNumber: bigint }): Promise<unknown>;
}

export type PaymentVerification =
  | {
      status: 'settled';
      settlement: Settlement;
      chainId: number;
      blockNumber: bigint;
      blockHash: string;
      confirmations: bigint;
      authorizationLogIndex: number;
      transferLogIndex: number;
    }
  | {
      status: 'failed';
      reason:
        | 'invalid_input'
        | 'unsupported_network'
        | 'unsupported_token'
        | 'transaction_reverted'
        | 'authorization_mismatch'
        | 'payment_mismatch';
    }
  | {
      status: 'unknown';
      reason:
        | 'rpc_unavailable'
        | 'rpc_chain_mismatch'
        | 'receipt_not_found'
        | 'invalid_rpc_response'
        | 'insufficient_confirmations'
        | 'reorg_detected';
    };

export interface ChainReader {
  /** One bounded verification; never signs, broadcasts, retries a payment, or changes the ledger. */
  verifyPayment(payment: ChainPayment): Promise<PaymentVerification>;
}

export const USDC_PAYMENT_EVENTS = parseAbi([
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const eventSelectors = new Set<string>([
  toEventSelector('AuthorizationUsed(address,bytes32)'),
  toEventSelector('Transfer(address,address,uint256)'),
]);
const equalHex = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
type UnverifiedPayment = Exclude<PaymentVerification, { status: 'settled' }>;

const invalidRpc = (): UnverifiedPayment => ({
  status: 'unknown',
  reason: 'invalid_rpc_response',
});

function matchPayment(
  receipt: ChainReceipt,
  payment: ChainPayment,
): { authorizationLogIndex: number; transferLogIndex: number } | UnverifiedPayment {
  const events: {
    decoded: ReturnType<typeof decodeEventLog<typeof USDC_PAYMENT_EVENTS>>;
    logIndex: number;
  }[] = [];
  for (const log of [...receipt.logs].sort((a, b) => a.logIndex - b.logIndex)) {
    if (
      !equalHex(log.address, payment.token) ||
      !eventSelectors.has(log.topics[0]?.toLowerCase() ?? '')
    )
      continue;
    try {
      const decoded = decodeEventLog({
        abi: USDC_PAYMENT_EVENTS,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      events.push({ decoded, logIndex: log.logIndex });
    } catch {
      return invalidRpc();
    }
  }
  const authorizationIndex = events.findIndex(
    ({ decoded }) =>
      decoded.eventName === 'AuthorizationUsed' &&
      equalHex(decoded.args.authorizer, payment.payer) &&
      equalHex(decoded.args.nonce, payment.authorizationNonce),
  );
  const authorization = events[authorizationIndex];
  if (!authorization) return { status: 'failed', reason: 'authorization_mismatch' };

  // Circle USDC emits AuthorizationUsed immediately before its Transfer. Pair them so
  // a batched transaction cannot borrow a matching transfer from another authorization.
  const transfer = events[authorizationIndex + 1];
  if (
    transfer?.decoded.eventName !== 'Transfer' ||
    !equalHex(transfer.decoded.args.from, payment.payer) ||
    !equalHex(transfer.decoded.args.to, payment.recipient) ||
    transfer.decoded.args.value !== payment.amount
  ) {
    return { status: 'failed', reason: 'payment_mismatch' };
  }
  return { authorizationLogIndex: authorization.logIndex, transferLogIndex: transfer.logIndex };
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('ChainReader timeout')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Independent RPC reader for native USDC on Base Sepolia or Base mainnet. */
export function createRpcChainReader(
  config: ChainReaderConfig = {},
  dependencies: { client?: ChainReaderRpc } = {},
): ChainReader {
  const options = ChainReaderConfigSchema.parse(config);
  const network = CHAIN_READER_NETWORKS[options.network];
  const client =
    dependencies.client ??
    createPublicClient({
      chain: network.chain,
      cacheTime: 0,
      transport: http(options.rpcUrl, { timeout: options.timeoutMs, retryCount: 0 }),
    });

  async function verify(payment: ChainPayment): Promise<PaymentVerification> {
    const rpcChain = z
      .number()
      .int()
      .positive()
      .safeParse(await client.getChainId());
    if (!rpcChain.success) return invalidRpc();
    if (rpcChain.data !== network.chain.id)
      return { status: 'unknown', reason: 'rpc_chain_mismatch' };

    const receiptResult = ChainReceiptSchema.safeParse(
      await client.getTransactionReceipt({ hash: payment.txHash as Hash }),
    );
    if (!receiptResult.success) return invalidRpc();
    const receipt = receiptResult.data;
    if (!equalHex(receipt.transactionHash, payment.txHash)) return invalidRpc();
    if (receipt.status === 'reverted') return { status: 'failed', reason: 'transaction_reverted' };
    if (receipt.logs.some((log) => log.removed))
      return { status: 'unknown', reason: 'reorg_detected' };
    if (
      new Set(receipt.logs.map((log) => log.logIndex)).size !== receipt.logs.length ||
      receipt.logs.some(
        (log) =>
          !equalHex(log.transactionHash, payment.txHash) ||
          !equalHex(log.blockHash, receipt.blockHash) ||
          log.blockNumber !== receipt.blockNumber,
      )
    )
      return invalidRpc();

    const matched = matchPayment(receipt, payment);
    if ('status' in matched) return matched;

    const head = z
      .bigint()
      .nonnegative()
      .safeParse(await client.getBlockNumber({ cacheTime: 0 }));
    if (!head.success) return invalidRpc();
    const confirmations = head.data - receipt.blockNumber + 1n;
    if (confirmations < BigInt(options.confirmations)) {
      return { status: 'unknown', reason: 'insufficient_confirmations' };
    }
    const block = ChainBlockSchema.safeParse(
      await client.getBlock({ blockNumber: receipt.blockNumber }),
    );
    if (!block.success) return invalidRpc();
    if (
      block.data.number !== receipt.blockNumber ||
      !equalHex(block.data.hash, receipt.blockHash)
    ) {
      return { status: 'unknown', reason: 'reorg_detected' };
    }
    return {
      status: 'settled',
      settlement: {
        txHash: payment.txHash,
        explorerUrl: `${network.chain.blockExplorers.default.url}/tx/${payment.txHash}`,
      },
      chainId: network.chain.id,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      confirmations,
      ...matched,
    };
  }

  return {
    async verifyPayment(input) {
      const payment = ChainPaymentSchema.safeParse(input);
      if (!payment.success) return { status: 'failed', reason: 'invalid_input' };
      if (payment.data.chainId !== network.chain.id) {
        return { status: 'failed', reason: 'unsupported_network' };
      }
      if (!equalHex(payment.data.token, network.usdcAddress)) {
        return { status: 'failed', reason: 'unsupported_token' };
      }
      try {
        return await withTimeout(() => verify(payment.data), options.timeoutMs);
      } catch (error) {
        return {
          status: 'unknown',
          reason:
            error instanceof TransactionReceiptNotFoundError
              ? 'receipt_not_found'
              : 'rpc_unavailable',
        };
      }
    },
  };
}
