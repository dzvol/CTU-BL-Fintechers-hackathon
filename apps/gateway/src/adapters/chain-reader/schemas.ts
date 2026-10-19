import { AddressSchema, TxHashSchema } from '@semanticauth/contracts';
import { z } from 'zod';

export const ChainReaderConfigSchema = z.object({
  network: z.enum(['base-sepolia', 'base-mainnet']).default('base-sepolia'),
  rpcUrl: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .optional(),
  confirmations: z.number().int().positive().default(1),
  timeoutMs: z.number().int().positive().max(2_147_483_647).default(10_000),
});
export type ChainReaderConfig = z.input<typeof ChainReaderConfigSchema>;

export const ChainPaymentSchema = z.object({
  txHash: TxHashSchema,
  chainId: z.number().int().positive(),
  token: AddressSchema,
  payer: AddressSchema,
  recipient: AddressSchema,
  amount: z
    .bigint()
    .positive()
    .max((1n << 256n) - 1n),
  /** Taken from the gateway's persisted authorization, never from merchant text. */
  authorizationNonce: TxHashSchema,
});
export type ChainPayment = z.infer<typeof ChainPaymentSchema>;

export const ChainLogSchema = z.object({
  address: AddressSchema,
  topics: z.array(TxHashSchema).max(4),
  data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
  logIndex: z.number().int().nonnegative(),
  transactionHash: TxHashSchema,
  blockHash: TxHashSchema,
  blockNumber: z.bigint().nonnegative(),
  removed: z.boolean(),
});

export const ChainReceiptSchema = z.object({
  transactionHash: TxHashSchema,
  blockHash: TxHashSchema,
  blockNumber: z.bigint().nonnegative(),
  status: z.enum(['success', 'reverted']),
  logs: z.array(ChainLogSchema),
});
export type ChainReceipt = z.infer<typeof ChainReceiptSchema>;

export const ChainBlockSchema = z.object({
  number: z.bigint().nonnegative(),
  hash: TxHashSchema,
});
