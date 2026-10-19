import { type Me, MeSchema } from '@semanticauth/contracts';

export const LOGIN_URL = '/auth/google/login';

/** The logged-in user, or null when there is no session. */
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/me failed with HTTP ${res.status}`);
  return MeSchema.parse(await res.json());
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
}
