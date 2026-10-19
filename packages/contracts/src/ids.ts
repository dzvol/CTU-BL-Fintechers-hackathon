import { z } from 'zod';

export type IdPrefix = 'usr' | 'key' | 'int' | 'task' | 'op' | 'rev';

const prefixedId = (prefix: IdPrefix) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9a-f-]{36}$`), `expected ${prefix}_<uuid>`);

export const UserIdSchema = prefixedId('usr');
export const ApiKeyIdSchema = prefixedId('key');
export const IntentIdSchema = prefixedId('int');
export const TaskIdSchema = prefixedId('task');
export const OperationIdSchema = prefixedId('op');
export const ReviewIdSchema = prefixedId('rev');

export type UserId = z.infer<typeof UserIdSchema>;
export type ApiKeyId = z.infer<typeof ApiKeyIdSchema>;
export type IntentId = z.infer<typeof IntentIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type OperationId = z.infer<typeof OperationIdSchema>;
export type ReviewId = z.infer<typeof ReviewIdSchema>;

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** ISO 8601 UTC timestamp. */
export const TimestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

/** EVM address (0x + 40 hex). */
export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected EVM address');
export type Address = z.infer<typeof AddressSchema>;

export const TxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected tx hash');
export type TxHash = z.infer<typeof TxHashSchema>;
