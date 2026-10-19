/**
 * Agent API keys as issued by the gateway: "sa_" + base64url randomness. The pattern is a typo
 * check for the CLI, not validation: only the gateway decides whether a key is valid.
 */
export const API_KEY_PATTERN = /^sa_[A-Za-z0-9_-]{20,}$/;

/** Same length as the prefix the dashboard shows, so the user can match the two. */
const DISPLAY_PREFIX_LENGTH = 10;

export function isWellFormedApiKey(key: string): boolean {
  return API_KEY_PATTERN.test(key);
}

/** Safe form for output. Never print a full key. */
export function maskApiKey(key: string): string {
  return `${key.slice(0, DISPLAY_PREFIX_LENGTH)}…`;
}
