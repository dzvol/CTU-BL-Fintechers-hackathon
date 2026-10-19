import type { ApiKeyId, UserId } from '@semanticauth/contracts';

/** Who is calling, as established by the auth layer. Services trust it. */
export interface UserContext {
  userId: UserId;
}

/** An agent authenticated by API key. The active task is resolved from `apiKeyId`. */
export interface AgentContext {
  userId: UserId;
  apiKeyId: ApiKeyId;
}
