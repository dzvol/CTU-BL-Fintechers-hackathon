import {
  AddressSchema,
  NormalizedOfferSchema,
  OperationIdSchema,
  PaymentNetworkSchema,
} from '@semanticauth/contracts';
import { z } from 'zod';
import { X402PaymentPayloadSchema, X402PaymentRequirementsSchema } from '../x402';

export const SignerConfigSchema = z.object({
  network: PaymentNetworkSchema.default('base-sepolia'),
  expectedAddress: AddressSchema.optional(),
  authorizationTtlSeconds: z.number().int().positive().max(3600).default(120),
});
export type SignerConfig = z.input<typeof SignerConfigSchema>;

/** Internal snapshots loaded by PaymentGateway after the decision and atomic reservation. */
export const SignPaymentInputSchema = z.object({
  operation: z.object({
    id: OperationIdSchema,
    url: z.url(),
    state: z.literal('reserved'),
    verdict: z.literal('ALLOW'),
    offer: NormalizedOfferSchema.omit({ description: true }),
  }),
  reservation: z.object({
    operationId: OperationIdSchema,
    state: z.literal('reserved'),
    amount: z
      .bigint()
      .positive()
      .max((1n << 256n) - 1n),
  }),
  requirements: X402PaymentRequirementsSchema,
});
export type SignPaymentInput = z.infer<typeof SignPaymentInputSchema>;

const uint256 = z
  .string()
  .refine((value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) < 1n << 256n);

export const Eip3009AuthorizationSchema = z.object({
  from: AddressSchema,
  to: AddressSchema,
  value: uint256,
  validAfter: uint256,
  validBefore: uint256,
  nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
export type Eip3009Authorization = z.infer<typeof Eip3009AuthorizationSchema>;

export const SignedPaymentPayloadSchema = X402PaymentPayloadSchema.extend({
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    authorization: Eip3009AuthorizationSchema,
  }),
});
export type SignedPaymentPayload = z.infer<typeof SignedPaymentPayloadSchema>;

export type SignPaymentResult =
  | { ok: true; paymentPayload: SignedPaymentPayload }
  | {
      ok: false;
      reason:
        | 'invalid_input'
        | 'unsupported_offer'
        | 'offer_mismatch'
        | 'reservation_mismatch'
        | 'signing_failed';
    };
