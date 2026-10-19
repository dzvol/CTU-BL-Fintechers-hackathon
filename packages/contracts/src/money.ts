import { z } from 'zod';

export const USDC_DECIMALS = 6;

/** USDC atomic units as a decimal-integer string: "100000" = 0.1 USDC. Used everywhere internally. */
export const AmountSchema = z.string().regex(/^(0|[1-9]\d*)$/, 'expected integer atomic units');
export type Amount = z.infer<typeof AmountSchema>;

/**
 * Human-readable USDC ("0.10", "2"). Only for agent-facing MCP inputs, because LLMs get atomic
 * units wrong. Convert with `parseUsdc` at the boundary.
 */
export const UsdcDecimalSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'expected USDC amount like "0.10" (max 6 decimals)');
export type UsdcDecimal = z.infer<typeof UsdcDecimalSchema>;

/** "0.10" → 100000n */
export function parseUsdc(value: UsdcDecimal): bigint {
  const [whole = '0', fraction = ''] = UsdcDecimalSchema.parse(value).split('.');
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fraction.padEnd(USDC_DECIMALS, '0'));
}

/** 100000n | "100000" → "0.10" (at least 2 decimals, trailing zeros trimmed). For display only. */
export function formatUsdc(amount: bigint | Amount): string {
  const units = typeof amount === 'bigint' ? amount : BigInt(AmountSchema.parse(amount));
  const base = 10n ** BigInt(USDC_DECIMALS);
  const sign = units < 0n ? '-' : '';
  const abs = units < 0n ? -units : units;
  const fraction = (abs % base).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  return `${sign}${abs / base}.${fraction.padEnd(2, '0')}`;
}
