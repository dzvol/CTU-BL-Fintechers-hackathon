import { z } from 'zod';

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 0x-prefixed EVM address');

const EnvSchema = z.object({
  MERCHANTS_PORT: z.coerce.number().int().positive().default(4021),
  /** Address that receives test payments. Never the sponsor wallet. */
  MERCHANT_PAY_TO: AddressSchema,
  USDC_ADDRESS: AddressSchema.default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  X402_FACILITATOR_URL: z.url().default('https://x402.org/facilitator'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Hosts like Railway assign the port through PORT; locally MERCHANTS_PORT keeps it off the
  // gateway's PORT from the shared .env.
  const port = source.RAILWAY_ENVIRONMENT ? source.PORT : source.MERCHANTS_PORT;
  const parsed = EnvSchema.safeParse({ ...source, MERCHANTS_PORT: port });
  if (!parsed.success) {
    // Fail at startup with a readable message instead of serving broken offers.
    throw new Error(`Invalid test-merchant env:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
