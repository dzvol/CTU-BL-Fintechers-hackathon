import { z } from 'zod';
import { ApiKeyIdSchema, TimestampSchema, UserIdSchema } from './ids';

/** Agent API key as shown in the dashboard. The secret itself is never returned again. */
export const ApiKeySchema = z.object({
  id: ApiKeyIdSchema,
  name: z.string(),
  /** First characters of the key, to recognise it ("sa_AbC123…"). */
  prefix: z.string(),
  createdAt: TimestampSchema,
  lastUsedAt: TimestampSchema.optional(),
  revokedAt: TimestampSchema.optional(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

/** POST /api/keys */
export const CreateApiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

/** POST /api/keys response: the only time the full `key` is shown. */
export const CreatedApiKeySchema = z.object({
  apiKey: ApiKeySchema,
  key: z.string(),
});
export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>;

/** GET /v1/whoami (agent API key): lets the CLI verify a key. */
export const WhoAmISchema = z.object({
  userId: UserIdSchema,
  apiKeyId: ApiKeyIdSchema,
  email: z.email(),
});
export type WhoAmI = z.infer<typeof WhoAmISchema>;
