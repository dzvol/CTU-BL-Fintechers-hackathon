import { z } from 'zod';

/** Error body for every non-2xx HTTP response from the gateway. */
export const ApiErrorSchema = z.object({
  error: z.object({
    /** snake_case, e.g. "no_active_task", "forbidden". */
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
