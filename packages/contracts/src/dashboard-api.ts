import { z } from 'zod';
import { UserIdSchema } from './ids';
import { AmountSchema } from './money';

/** GET /api/me: the logged-in user. */
export const MeSchema = z.object({
  id: UserIdSchema,
  email: z.email(),
  name: z.string().optional(),
  picture: z.url().optional(),
  /** Sponsored allocation assigned on first login. */
  allocation: AmountSchema,
  /**
   * What the allocation has paid for and what is left. Optional only for compatibility; the
   * gateway always sends it. With `remaining` at 0 the user's API keys stop working.
   */
  balance: z
    .object({
      spent: AmountSchema,
      /** Held for payments in progress. */
      reserved: AmountSchema,
      remaining: AmountSchema,
    })
    .optional(),
});
export type Me = z.infer<typeof MeSchema>;

/** Every dashboard list endpoint answers `{ items: [...] }`. */
export const listResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item) });
export interface ListResponse<T> {
  items: T[];
}
