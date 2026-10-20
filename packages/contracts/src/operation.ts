import { z } from 'zod';
import {
  AddressSchema,
  OperationIdSchema,
  TaskIdSchema,
  TimestampSchema,
  TxHashSchema,
} from './ids';
import { AmountSchema } from './money';
import { VerdictReasonSchema, VerdictSchema } from './verdict';

/** Operation lifecycle, see docs/architecture/overview.md. */
export const OperationStateSchema = z.enum([
  'requested',
  'blocked',
  'awaiting_review',
  'reserved',
  'prepared',
  'issued',
  'submitted',
  'unknown',
  'settled',
  'delivered',
  'delivery_failed',
  'closed',
]);
export type OperationState = z.infer<typeof OperationStateSchema>;

/** Merchant x402 offer after normalization. Only the supported profile gets this far. */
export const NormalizedOfferSchema = z.object({
  scheme: z.literal('exact'),
  network: z.literal('base-sepolia'),
  /** USDC contract. */
  asset: AddressSchema,
  payTo: AddressSchema,
  amount: AmountSchema,
  resourceUrl: z.url(),
  /** Untrusted merchant text. Never show it to Judge. */
  description: z.string().optional(),
  /** Untrusted: the name the merchant gives its service. Never show it to Judge. */
  serviceName: z.string().optional(),
  /**
   * Untrusted: the extra content of the merchant's payment request as JSON text, so the user can
   * see what is on offer. Never show it to Judge or the agent.
   */
  details: z.string().optional(),
});
export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;

export const SettlementSchema = z.object({
  txHash: TxHashSchema,
  explorerUrl: z.url(),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const OperationSchema = z.object({
  id: OperationIdSchema,
  taskId: TaskIdSchema,
  url: z.url(),
  state: OperationStateSchema,
  verdict: VerdictSchema.optional(),
  reason: VerdictReasonSchema.optional(),
  /** Absent for free content and for offers rejected by the normalizer. */
  offer: NormalizedOfferSchema.optional(),
  settlement: SettlementSchema.optional(),
  /** Human-readable explanation of the current state. */
  message: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Operation = z.infer<typeof OperationSchema>;
