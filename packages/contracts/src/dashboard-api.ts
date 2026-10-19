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
});
export type Me = z.infer<typeof MeSchema>;
