import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
  TransactionReceiptNotFoundError,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { describe, expect, it, vi } from 'vitest';
import {
  CHAIN_READER_NETWORKS,
  createRpcChainReader,
  loadChainReaderConfig,
  USDC_PAYMENT_EVENTS,
} from './index';
import type { ChainPayment, ChainReaderConfig, ChainReaderRpc } from './index';

const txHash = `0x${'11'.repeat(32)}` as const;
const blockHash = `0x${'22'.repeat(32)}` as const;
const nonce = `0x${'33'.repeat(32)}` as const;
const otherNonce = `0x${'44'.repeat(32)}` as const;
const payer = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const relayer = '0x3333333333333333333333333333333333333333';
const token = CHAIN_READER_NETWORKS['base-sepolia'].usdcAddress;
const payment: ChainPayment = {
  txHash,
  chainId: 84532,
  token,
  payer,
  recipient,
  amount: 10000n,
  authorizationNonce: nonce,
};

function usedLog(
  authorizer: `0x${string}` = payer,
  authorizationNonce: `0x${string}` = nonce,
  logIndex = 0,
) {
  return {
    address: token,
    blockHash,
    blockNumber: 100n,
    transactionHash: txHash,
    logIndex,
    removed: false,
    topics: encodeEventTopics({
      abi: USDC_PAYMENT_EVENTS,
      eventName: 'AuthorizationUsed',
      args: { authorizer, nonce: authorizationNonce },
    }),
    data: '0x',
  };
}

function transferLog(
  from: `0x${string}` = payer,
  to: `0x${string}` = recipient,
  value = 10000n,
  logIndex = 1,
) {
  return {
    ...usedLog(),
    logIndex,
    topics: encodeEventTopics({
      abi: USDC_PAYMENT_EVENTS,
      eventName: 'Transfer',
      args: { from, to },
    }),
    data: encodeAbiParameters(parseAbiParameters('uint256'), [value]),
  };
}

function receipt() {
  return {
    transactionHash: txHash,
    blockHash,
    blockNumber: 100n,
    status: 'success',
    from: relayer,
    to: token,
    logs: [usedLog(), transferLog()],
  };
}

function setup(config: ChainReaderConfig = {}) {
  const client = {
    getChainId: vi.fn<ChainReaderRpc['getChainId']>().mockResolvedValue(84532),
    getTransactionReceipt: vi
      .fn<ChainReaderRpc['getTransactionReceipt']>()
      .mockResolvedValue(receipt()),
    getBlockNumber: vi.fn<ChainReaderRpc['getBlockNumber']>().mockResolvedValue(101n),
    getBlock: vi
      .fn<ChainReaderRpc['getBlock']>()
      .mockResolvedValue({ number: 100n, hash: blockHash }),
  };
  return { client, reader: createRpcChainReader(config, { client }) };
}

describe('ChainReader.verifyPayment', () => {
  it('accepts actual viem-formatted RPC responses through an offline provider', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_blockNumber') return '0x65';
      if (method === 'eth_getBlockByNumber')
        return { number: '0x64', hash: blockHash, transactions: [] };
      if (method === 'eth_getTransactionReceipt') {
        return {
          ...receipt(),
          status: '0x1',
          blockNumber: '0x64',
          logs: receipt().logs.map((log) => ({
            ...log,
            blockNumber: '0x64',
            logIndex: `0x${log.logIndex.toString(16)}`,
          })),
        };
      }
      throw new Error('Unexpected RPC method');
    });
    const client = createPublicClient({
      chain: baseSepolia,
      cacheTime: 0,
      transport: custom({ request }, { retryCount: 0 }),
    });
    const reader = createRpcChainReader({}, { client });
    expect((await reader.verifyPayment(payment)).status).toBe('settled');
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('verifies the successful receipt, USDC events, authorization nonce, and canonical block', async () => {
    const { reader, client } = setup();
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'settled',
      settlement: { txHash, explorerUrl: `https://sepolia.basescan.org/tx/${txHash}` },
      chainId: 84532,
      blockHash,
      blockNumber: 100n,
      confirmations: 2n,
      authorizationLogIndex: 0,
      transferLogIndex: 1,
    });
    expect(client.getTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
    expect(client.getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    expect(client.getBlock).toHaveBeenCalledWith({ blockNumber: 100n });
    // The receipt sender is the facilitator/relayer, not the token payer.
    expect(receipt().from).not.toBe(payer);
  });

  it('switches Base mainnet chain, USDC contract, and explorer together', async () => {
    const { reader, client } = setup({ network: 'base-mainnet' });
    const mainnetToken = CHAIN_READER_NETWORKS['base-mainnet'].usdcAddress;
    client.getChainId.mockResolvedValue(8453);
    client.getTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: receipt().logs.map((log) => ({ ...log, address: mainnetToken })),
    });
    expect(
      await reader.verifyPayment({ ...payment, chainId: 8453, token: mainnetToken }),
    ).toMatchObject({
      status: 'settled',
      chainId: 8453,
      settlement: { explorerUrl: `https://basescan.org/tx/${txHash}` },
    });
  });

  it('keeps atomic values exact beyond JavaScript number precision', async () => {
    const { reader, client } = setup();
    const amount = 900719925474099312345n;
    client.getTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [usedLog(), transferLog(payer, recipient, amount)],
    });
    expect((await reader.verifyPayment({ ...payment, amount })).status).toBe('settled');
  });

  it('compares valid address and hash encodings case-insensitively', async () => {
    const { reader } = setup();
    expect(
      (await reader.verifyPayment({ ...payment, token: `0x${token.slice(2).toUpperCase()}` }))
        .status,
    ).toBe('settled');
  });

  it('uses log indices instead of assuming the RPC array order', async () => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [transferLog(), usedLog()],
    });
    expect((await reader.verifyPayment(payment)).status).toBe('settled');
  });

  it.each([
    { ...payment, txHash: 'not a hash' },
    { ...payment, amount: 10000 },
    { ...payment, amount: '10000' },
    { ...payment, amount: 0n },
    { ...payment, amount: -1n },
    { ...payment, amount: 1n << 256n },
    { ...payment, authorizationNonce: undefined },
  ])('fails malformed input before RPC calls: %#', async (input) => {
    const { reader, client } = setup();
    expect(await reader.verifyPayment(input as ChainPayment)).toEqual({
      status: 'failed',
      reason: 'invalid_input',
    });
    expect(client.getChainId).not.toHaveBeenCalled();
  });

  it('rejects mismatched expected chain or token before querying the chain', async () => {
    const { reader, client } = setup();
    expect(await reader.verifyPayment({ ...payment, chainId: 8453 })).toEqual({
      status: 'failed',
      reason: 'unsupported_network',
    });
    expect(await reader.verifyPayment({ ...payment, token: recipient })).toEqual({
      status: 'failed',
      reason: 'unsupported_token',
    });
    expect(client.getChainId).not.toHaveBeenCalled();
  });

  it('checks the actual RPC chain ID instead of trusting its configured chain', async () => {
    const { reader, client } = setup();
    client.getChainId.mockResolvedValue(8453);
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'rpc_chain_mismatch',
    });
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('rejects a reverted transaction despite any merchant success claim', async () => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue({ ...receipt(), status: 'reverted' });
    const claimedSuccess = { ...payment, success: true };
    expect(await reader.verifyPayment(claimedSuccess)).toEqual({
      status: 'failed',
      reason: 'transaction_reverted',
    });
    expect(client.getBlock).not.toHaveBeenCalled();
  });

  it.each([
    [usedLog(payer, otherNonce), transferLog()],
    [usedLog(recipient), transferLog()],
    [transferLog()],
    [],
    [
      { ...usedLog(), address: recipient },
      { ...transferLog(), address: recipient },
    ],
  ])('rejects missing or mismatched authorization evidence: %#', async (...logs) => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue({ ...receipt(), logs });
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'failed',
      reason: 'authorization_mismatch',
    });
  });

  it.each([
    [usedLog(), transferLog(recipient)],
    [usedLog(), transferLog(payer, relayer)],
    [usedLog(), transferLog(payer, recipient, 9999n)],
    [usedLog()],
    [usedLog(), { ...transferLog(), address: recipient }],
  ])('rejects incorrect payer, recipient, amount, or missing transfer: %#', async (...logs) => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue({ ...receipt(), logs });
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'failed',
      reason: 'payment_mismatch',
    });
  });

  it('does not borrow a matching transfer from another authorization in a batch', async () => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [
        usedLog(),
        transferLog(payer, relayer),
        usedLog(payer, otherNonce, 2),
        transferLog(payer, recipient, 10000n, 3),
      ],
    });
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'failed',
      reason: 'payment_mismatch',
    });
  });

  it('reports an unavailable receipt as unknown, never as proof of non-payment', async () => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: txHash }),
    );
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'receipt_not_found',
    });
  });

  it('reports a network error without leaking RPC credentials or retrying', async () => {
    const { reader, client } = setup();
    client.getChainId.mockRejectedValue(new Error('RPC endpoint contains sensitive credentials'));
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'rpc_unavailable',
    });
    expect(client.getChainId).toHaveBeenCalledTimes(1);
  });

  it('bounds the entire verification even when an injected RPC call stalls', async () => {
    const { reader, client } = setup({ timeoutMs: 10 });
    client.getChainId.mockImplementation(() => new Promise(() => {}));
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'rpc_unavailable',
    });
  });

  it('enforces the configured confirmation threshold without polling', async () => {
    const { reader, client } = setup({ confirmations: 3 });
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'insufficient_confirmations',
    });
    expect(client.getBlockNumber).toHaveBeenCalledTimes(1);
    expect(client.getBlock).not.toHaveBeenCalled();
  });

  it('does not confirm a receipt ahead of the RPC head', async () => {
    const { reader, client } = setup();
    client.getBlockNumber.mockResolvedValue(99n);
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'insufficient_confirmations',
    });
  });

  it('detects a changed canonical block hash', async () => {
    const { reader, client } = setup();
    client.getBlock.mockResolvedValue({ number: 100n, hash: otherNonce });
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'reorg_detected',
    });
  });

  it('rejects removed logs', async () => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue({
      ...receipt(),
      logs: [{ ...usedLog(), removed: true }, transferLog()],
    });
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'reorg_detected',
    });
  });

  it.each([
    null,
    { ...receipt(), transactionHash: otherNonce },
    { ...receipt(), blockNumber: '100' },
    { ...receipt(), logs: [usedLog(), { ...transferLog(), transactionHash: otherNonce }] },
    { ...receipt(), logs: [usedLog(), { ...transferLog(), blockHash: otherNonce }] },
    { ...receipt(), logs: [usedLog(), { ...transferLog(), blockNumber: 99n }] },
    { ...receipt(), logs: [usedLog(), { ...transferLog(), logIndex: 0 }] },
    { ...receipt(), logs: [usedLog(), { ...transferLog(), data: '0x01' }] },
  ])('fails closed on inconsistent or malformed RPC receipts: %#', async (value) => {
    const { reader, client } = setup();
    client.getTransactionReceipt.mockResolvedValue(value);
    expect(await reader.verifyPayment(payment)).toEqual({
      status: 'unknown',
      reason: 'invalid_rpc_response',
    });
  });

  it('validates the remaining RPC responses instead of coercing them', async () => {
    for (const method of ['getChainId', 'getBlockNumber', 'getBlock'] as const) {
      const { reader, client } = setup();
      client[method].mockResolvedValue('invalid');
      expect(await reader.verifyPayment(payment)).toEqual({
        status: 'unknown',
        reason: 'invalid_rpc_response',
      });
    }
  });
});

describe('ChainReader configuration', () => {
  it('defaults to Base Sepolia and uses the existing Sepolia RPC variable', () => {
    expect(loadChainReaderConfig({ BASE_SEPOLIA_RPC_URL: 'https://sepolia-rpc.example/' })).toEqual(
      {
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia-rpc.example/',
        confirmations: 1,
        timeoutMs: 10000,
      },
    );
  });

  it('does not inherit the Sepolia RPC when switching to mainnet', () => {
    expect(
      loadChainReaderConfig({
        CHAIN_READER_NETWORK: 'base-mainnet',
        BASE_SEPOLIA_RPC_URL: 'https://sepolia-rpc.example/',
        USDC_ADDRESS: token,
      }),
    ).toEqual({ network: 'base-mainnet', rpcUrl: undefined, confirmations: 1, timeoutMs: 10000 });
  });

  it('follows PAYMENT_NETWORK unless CHAIN_READER_NETWORK overrides it', () => {
    expect(loadChainReaderConfig({ PAYMENT_NETWORK: 'base-mainnet' }).network).toBe('base-mainnet');
    expect(
      loadChainReaderConfig({
        PAYMENT_NETWORK: 'base-mainnet',
        CHAIN_READER_NETWORK: 'base-sepolia',
      }).network,
    ).toBe('base-sepolia');
  });

  it('supports an explicit RPC override and numeric environment settings', () => {
    expect(
      loadChainReaderConfig({
        CHAIN_READER_NETWORK: 'base-mainnet',
        CHAIN_READER_RPC_URL: 'https://mainnet-rpc.example/',
        CHAIN_READER_CONFIRMATIONS: '5',
        CHAIN_READER_TIMEOUT_MS: '3000',
      }),
    ).toEqual({
      network: 'base-mainnet',
      rpcUrl: 'https://mainnet-rpc.example/',
      confirmations: 5,
      timeoutMs: 3000,
    });
  });

  it.each([
    { CHAIN_READER_NETWORK: 'unknown' },
    { PAYMENT_NETWORK: 'ethereum' },
    { CHAIN_READER_RPC_URL: 'ftp://invalid.example' },
    { CHAIN_READER_CONFIRMATIONS: '0' },
    { CHAIN_READER_TIMEOUT_MS: 'invalid' },
  ])('rejects invalid environment configuration without printing its values: %j', (env) => {
    expect(() => loadChainReaderConfig(env)).toThrow(
      'Invalid ChainReader environment configuration',
    );
  });
});
