import { z } from 'zod';

export const X402JsonSchema = z.json();
export type X402Json = z.infer<typeof X402JsonSchema>;
const jsonObject = z.record(z.string(), X402JsonSchema);

export const X402ResourceSchema = z
  .object({
    url: z.url(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    serviceName: z.string().optional(),
  })
  .catchall(X402JsonSchema);

// Transport validates wire structure; supported-profile enforcement belongs to the payment pipeline.
export const X402PaymentRequirementsSchema = z
  .object({
    scheme: z.string().min(1),
    network: z.string().min(1),
    amount: z.string().regex(/^(0|[1-9]\d*)$/),
    asset: z.string().min(1),
    payTo: z.string().min(1),
    maxTimeoutSeconds: z.number().int().positive(),
    extra: jsonObject.optional(),
  })
  .catchall(X402JsonSchema);
export type X402PaymentRequirements = z.infer<typeof X402PaymentRequirementsSchema>;

export const X402PaymentRequiredSchema = z
  .object({
    x402Version: z.literal(2),
    error: z.string().optional(),
    resource: X402ResourceSchema,
    accepts: z.array(X402PaymentRequirementsSchema).min(1),
    extensions: jsonObject.optional(),
  })
  .catchall(X402JsonSchema);
export type X402PaymentRequired = z.infer<typeof X402PaymentRequiredSchema>;

export const X402PaymentPayloadSchema = z
  .object({
    x402Version: z.literal(2),
    resource: X402ResourceSchema.optional(),
    accepted: X402PaymentRequirementsSchema,
    payload: jsonObject.refine((value) => Object.keys(value).length > 0),
    extensions: jsonObject.optional(),
  })
  .catchall(X402JsonSchema);
export type X402PaymentPayload = z.infer<typeof X402PaymentPayloadSchema>;

export const X402PaymentResponseSchema = z
  .object({
    success: z.boolean(),
    transaction: z.string(),
    network: z.string().min(1),
    payer: z.string().optional(),
    errorReason: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .catchall(X402JsonSchema);
export type X402PaymentResponse = z.infer<typeof X402PaymentResponseSchema>;

export const X402RequestSchema = z
  .object({
    url: z.url(),
    method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    // A repeatable body prevents a consumed stream from changing the paid request.
    body: z.string().optional(),
  })
  .refine((value) => !['GET', 'HEAD'].includes(value.method) || value.body === undefined);
export type X402Request = z.input<typeof X402RequestSchema>;
