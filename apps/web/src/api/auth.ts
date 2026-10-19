import { MeSchema, type Me } from '@semanticauth/contracts';
import { z } from 'zod';
import { ApiError, request } from './http';

export const LOGIN_URL = '/auth/google/login';
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  try {
    return await request('/api/me', MeSchema, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export const logout = () => request('/auth/logout', z.undefined(), { method: 'POST' });
